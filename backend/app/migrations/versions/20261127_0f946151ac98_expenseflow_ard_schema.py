"""expenseflow_ard_schema

Revision ID: 0f946151ac98
Revises: a29597f219cf
Create Date: 2026-11-27 14:56:03.216531

Reviewed by hand: [x] app types replaced by sa.DateTime; ARD section 7 constraints added:
claim_transitions seeded from ARD section 4 + trigger, claims start as DRAFT, rules of a
non-DRAFT policy version immutable, audit_events append-only; categories seeded (fixed codes).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0f946151ac98"
down_revision: str | Sequence[str] | None = "a29597f219cf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ARD section 4: the only allowed claim status transitions (source of truth for the trigger).
TRANSITIONS = [
    ("DRAFT", "APPROVED"),
    ("DRAFT", "REJECTED"),
    ("DRAFT", "PENDING_MANAGER"),
    ("DRAFT", "WITHDRAWN"),
    ("PENDING_MANAGER", "PENDING_AUDITOR"),
    ("PENDING_MANAGER", "PENDING_HEAD"),
    ("PENDING_MANAGER", "APPROVED"),
    ("PENDING_MANAGER", "WITHDRAWN"),
    ("PENDING_AUDITOR", "PENDING_HEAD"),
    ("PENDING_AUDITOR", "APPROVED"),
    ("PENDING_HEAD", "APPROVED"),
    ("PENDING_MANAGER", "REJECTED"),
    ("PENDING_AUDITOR", "REJECTED"),
    ("PENDING_HEAD", "REJECTED"),
    ("PENDING_MANAGER", "SENT_BACK"),
    ("PENDING_AUDITOR", "SENT_BACK"),
    ("PENDING_HEAD", "SENT_BACK"),
    ("SENT_BACK", "PENDING_MANAGER"),
    ("SENT_BACK", "APPROVED"),
    ("SENT_BACK", "REJECTED"),
    ("SENT_BACK", "WITHDRAWN"),
    ("APPROVED", "PAID"),
    ("APPROVED", "PENDING_AUDITOR"),
]
CATEGORIES = [
    ("MEALS", "Meals"),
    ("HOTEL", "Hotel"),
    ("LOCAL_CAB", "Local cab"),
    ("TRAVEL", "Travel"),
    ("OTHER", "Other"),
]

SQLITE_TRIGGERS = (
    "CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events "
    "BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END",
    "CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events "
    "BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END",
    "CREATE TRIGGER claims_insert_draft BEFORE INSERT ON claims WHEN NEW.status <> 'DRAFT' "
    "BEGIN SELECT RAISE(ABORT, 'claims must be created as DRAFT'); END",
    "CREATE TRIGGER claims_status_transition BEFORE UPDATE OF status ON claims "
    "WHEN NEW.status <> OLD.status AND NOT EXISTS (SELECT 1 FROM claim_transitions "
    "WHERE from_status = OLD.status AND to_status = NEW.status) "
    "BEGIN SELECT RAISE(ABORT, 'illegal claim status transition'); END",
    "CREATE TRIGGER policy_rules_frozen_update BEFORE UPDATE ON policy_rules "
    "WHEN (SELECT status FROM policy_versions WHERE id = OLD.policy_version_id) <> 'DRAFT' "
    "BEGIN SELECT RAISE(ABORT, 'rules of a published policy version are immutable'); END",
    "CREATE TRIGGER policy_rules_frozen_delete BEFORE DELETE ON policy_rules "
    "WHEN (SELECT status FROM policy_versions WHERE id = OLD.policy_version_id) <> 'DRAFT' "
    "BEGIN SELECT RAISE(ABORT, 'rules of a published policy version are immutable'); END",
    "CREATE TRIGGER policy_rules_frozen_insert BEFORE INSERT ON policy_rules "
    "WHEN (SELECT status FROM policy_versions WHERE id = NEW.policy_version_id) <> 'DRAFT' "
    "BEGIN SELECT RAISE(ABORT, 'rules of a published policy version are immutable'); END",
)
SQLITE_TRIGGER_NAMES = (
    "audit_events_no_update",
    "audit_events_no_delete",
    "claims_insert_draft",
    "claims_status_transition",
    "policy_rules_frozen_update",
    "policy_rules_frozen_delete",
    "policy_rules_frozen_insert",
)
POSTGRES_TRIGGERS = (
    "CREATE FUNCTION audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS "
    "$$ BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$",
    "CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON audit_events "
    "FOR EACH ROW EXECUTE FUNCTION audit_events_immutable()",
    "CREATE FUNCTION claims_check_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
    "IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN "
    "RAISE EXCEPTION 'claims must be created as DRAFT'; END IF; "
    "IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NOT EXISTS (SELECT 1 FROM "
    "claim_transitions WHERE from_status = OLD.status AND to_status = NEW.status) THEN "
    "RAISE EXCEPTION 'illegal claim status transition'; END IF; RETURN NEW; END $$",
    "CREATE TRIGGER claims_status_transition BEFORE INSERT OR UPDATE ON claims "
    "FOR EACH ROW EXECUTE FUNCTION claims_check_transition()",
)


def _create_db_rules() -> None:
    op.bulk_insert(
        sa.table("claim_transitions", sa.column("from_status"), sa.column("to_status")),
        [{"from_status": f, "to_status": t} for f, t in TRANSITIONS],
    )
    op.bulk_insert(
        sa.table("categories", sa.column("code"), sa.column("name")),
        [{"code": code, "name": name} for code, name in CATEGORIES],
    )
    postgres = op.get_bind().dialect.name == "postgresql"
    for statement in POSTGRES_TRIGGERS if postgres else SQLITE_TRIGGERS:
        op.execute(statement)


def _drop_db_rules() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_events_no_change ON audit_events")
        op.execute("DROP FUNCTION IF EXISTS audit_events_immutable()")
        op.execute("DROP TRIGGER IF EXISTS claims_status_transition ON claims")
        op.execute("DROP FUNCTION IF EXISTS claims_check_transition()")
    else:
        for name in SQLITE_TRIGGER_NAMES:
            op.execute(f"DROP TRIGGER IF EXISTS {name}")


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "app_config",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_app_config")),
    )
    op.create_table(
        "approval_levels",
        sa.Column("level_no", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("min_amount_paise_exclusive", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "role IN ('MANAGER', 'AUDITOR', 'FINANCE_HEAD')",
            name=op.f("ck_approval_levels_role_valid"),
        ),
        sa.CheckConstraint(
            "min_amount_paise_exclusive >= 0", name=op.f("ck_approval_levels_min_non_negative")
        ),
        sa.PrimaryKeyConstraint("level_no", name=op.f("pk_approval_levels")),
    )
    op.create_table(
        "audit_events",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=True),
        sa.Column("on_behalf_of_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("claim_id", sa.String(length=36), nullable=True),
        sa.Column("before_json", sa.JSON(), nullable=True),
        sa.Column("after_json", sa.JSON(), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("prev_hash", sa.String(length=64), nullable=False),
        sa.Column("row_hash", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
        sa.UniqueConstraint("row_hash", name=op.f("uq_audit_events_row_hash")),
    )
    with op.batch_alter_table("audit_events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_audit_events_action"), ["action"], unique=False)
        batch_op.create_index(batch_op.f("ix_audit_events_actor_id"), ["actor_id"], unique=False)
        batch_op.create_index("ix_audit_events_claim", ["claim_id", "id"], unique=False)
        batch_op.create_index(batch_op.f("ix_audit_events_ts"), ["ts"], unique=False)

    op.create_table(
        "categories",
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.CheckConstraint(
            "code IN ('MEALS', 'HOTEL', 'LOCAL_CAB', 'TRAVEL', 'OTHER')",
            name=op.f("ck_categories_code_valid"),
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_categories")),
    )
    op.create_table(
        "cities",
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("tier", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint("tier IN (1, 2)", name=op.f("ck_cities_tier_valid")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cities")),
        sa.UniqueConstraint("name", name=op.f("uq_cities_name")),
    )
    op.create_table(
        "claim_transitions",
        sa.Column("from_status", sa.String(length=20), nullable=False),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("from_status", "to_status", name=op.f("pk_claim_transitions")),
    )
    op.create_table(
        "departments",
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_departments")),
        sa.UniqueConstraint("code", name=op.f("uq_departments_code")),
        sa.UniqueConstraint("name", name=op.f("uq_departments_name")),
    )
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("employee_code", sa.String(length=16), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("department_id", sa.String(length=36), nullable=False),
        sa.Column("manager_id", sa.String(length=36), nullable=True),
        sa.Column("home_city_id", sa.String(length=36), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "role IN ('EMPLOYEE', 'MANAGER', 'AUDITOR', 'FINANCE_HEAD')",
            name=op.f("ck_users_role_valid"),
        ),
        sa.CheckConstraint(
            "manager_id IS NULL OR manager_id <> id", name=op.f("ck_users_not_own_manager")
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name=op.f("fk_users_department_id_departments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["home_city_id"],
            ["cities.id"],
            name=op.f("fk_users_home_city_id_cities"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["manager_id"],
            ["users.id"],
            name=op.f("fk_users_manager_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("employee_code", name=op.f("uq_users_employee_code")),
    )
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_users_department_id"), ["department_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_manager_id"), ["manager_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_users_role"), ["role"], unique=False)

    op.create_table(
        "bank_accounts",
        sa.Column("employee_id", sa.String(length=36), nullable=False),
        sa.Column("account_no", sa.String(length=34), nullable=False),
        sa.Column("ifsc", sa.String(length=11), nullable=False),
        sa.Column("holder_name", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["users.id"],
            name=op.f("fk_bank_accounts_employee_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("employee_id", name=op.f("pk_bank_accounts")),
    )
    op.create_table(
        "delegations",
        sa.Column("delegator_id", sa.String(length=36), nullable=False),
        sa.Column("delegate_id", sa.String(length=36), nullable=False),
        sa.Column("level_no", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint("delegator_id <> delegate_id", name=op.f("ck_delegations_not_self")),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_delegations_range_valid")),
        sa.ForeignKeyConstraint(
            ["delegate_id"],
            ["users.id"],
            name=op.f("fk_delegations_delegate_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["delegator_id"],
            ["users.id"],
            name=op.f("fk_delegations_delegator_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["level_no"],
            ["approval_levels.level_no"],
            name=op.f("fk_delegations_level_no_approval_levels"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delegations")),
    )
    with op.batch_alter_table("delegations", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_delegations_delegate_id"), ["delegate_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_delegations_delegator_id"), ["delegator_id"], unique=False
        )

    op.create_table(
        "payout_batches",
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("created_by_id", sa.String(length=36), nullable=False),
        sa.Column("verified_by_id", sa.String(length=36), nullable=True),
        sa.Column("total_paise", sa.Integer(), nullable=False),
        sa.Column("claim_count", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=80), nullable=True),
        sa.Column("file_content", sa.Text(), nullable=True),
        sa.Column("file_sha256", sa.String(length=64), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'VERIFIED', 'EXPORTED', 'PAID', 'CANCELLED')",
            name=op.f("ck_payout_batches_status_valid"),
        ),
        sa.CheckConstraint(
            "verified_by_id IS NULL OR verified_by_id <> created_by_id",
            name=op.f("ck_payout_batches_maker_checker"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_payout_batches_created_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_id"],
            ["users.id"],
            name=op.f("fk_payout_batches_verified_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payout_batches")),
        sa.UniqueConstraint("number", name=op.f("uq_payout_batches_number")),
    )
    with op.batch_alter_table("payout_batches", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_payout_batches_status"), ["status"], unique=False)

    op.create_table(
        "policy_versions",
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_by_id", sa.String(length=36), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'ACTIVE', 'RETIRED')", name=op.f("ck_policy_versions_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_policy_versions_created_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["published_by_id"],
            ["users.id"],
            name=op.f("fk_policy_versions_published_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_policy_versions")),
        sa.UniqueConstraint("version_no", name=op.f("uq_policy_versions_version_no")),
    )
    with op.batch_alter_table("policy_versions", schema=None) as batch_op:
        batch_op.create_index(
            "uq_policy_versions_single_active",
            ["status"],
            unique=True,
            sqlite_where=sa.text("status = 'ACTIVE'"),
            postgresql_where=sa.text("status = 'ACTIVE'"),
        )

    op.create_table(
        "receipts",
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("storage_key", sa.String(length=64), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("mime", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_receipts_owner_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_receipts")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_receipts_storage_key")),
    )
    with op.batch_alter_table("receipts", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_receipts_owner_id"), ["owner_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_receipts_sha256"), ["sha256"], unique=False)

    op.create_table(
        "claims",
        sa.Column("number", sa.String(length=24), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("department_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("total_paise", sa.Integer(), nullable=False),
        sa.Column("payable_paise", sa.Integer(), nullable=False),
        sa.Column("policy_version_id", sa.String(length=36), nullable=True),
        sa.Column("required_levels", sa.JSON(), nullable=False),
        sa.Column("current_level", sa.Integer(), nullable=True),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("auto_approved", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payout_batch_id", sa.String(length=36), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PENDING_MANAGER', 'PENDING_AUDITOR', 'PENDING_HEAD', 'SENT_BACK', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PAID')",
            name=op.f("ck_claims_status_valid"),
        ),
        sa.CheckConstraint(
            "total_paise >= 0 AND payable_paise >= 0", name=op.f("ck_claims_amounts_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name=op.f("fk_claims_department_id_departments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_claims_owner_id_users"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["payout_batch_id"],
            ["payout_batches.id"],
            name=op.f("fk_claims_payout_batch_id_payout_batches"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["policy_version_id"],
            ["policy_versions.id"],
            name=op.f("fk_claims_policy_version_id_policy_versions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_claims")),
        sa.UniqueConstraint("number", name=op.f("uq_claims_number")),
    )
    with op.batch_alter_table("claims", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_claims_department_id"), ["department_id"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_claims_owner_id"), ["owner_id"], unique=False)
        batch_op.create_index("ix_claims_owner_status", ["owner_id", "status"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_claims_payout_batch_id"), ["payout_batch_id"], unique=False
        )
        batch_op.create_index(
            "ix_claims_queue", ["status", "current_level", "submitted_at"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_claims_submitted_at"), ["submitted_at"], unique=False)

    op.create_table(
        "policy_rules",
        sa.Column("policy_version_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("category_code", sa.String(length=16), nullable=True),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("outcome", sa.String(length=8), nullable=False),
        sa.Column("severity", sa.String(length=8), nullable=False),
        sa.Column("force_level", sa.Integer(), nullable=True),
        sa.Column("message_template", sa.String(length=300), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint(
            "outcome IN ('REJECT', 'ROUTE', 'FLAG')", name=op.f("ck_policy_rules_outcome_valid")
        ),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high')", name=op.f("ck_policy_rules_severity_valid")
        ),
        sa.ForeignKeyConstraint(
            ["category_code"],
            ["categories.code"],
            name=op.f("fk_policy_rules_category_code_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["policy_version_id"],
            ["policy_versions.id"],
            name=op.f("fk_policy_rules_policy_version_id_policy_versions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_policy_rules")),
        sa.UniqueConstraint(
            "policy_version_id", "code", name=op.f("uq_policy_rules_policy_version_id_code")
        ),
    )
    with op.batch_alter_table("policy_rules", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_policy_rules_policy_version_id"), ["policy_version_id"], unique=False
        )

    op.create_table(
        "approval_steps",
        sa.Column("claim_id", sa.String(length=36), nullable=False),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("level_no", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("assigned_to_id", sa.String(length=36), nullable=True),
        sa.Column("acted_by_id", sa.String(length=36), nullable=True),
        sa.Column("on_behalf_of_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("comment", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'SKIPPED', 'SUPERSEDED')",
            name=op.f("ck_approval_steps_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["acted_by_id"],
            ["users.id"],
            name=op.f("fk_approval_steps_acted_by_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_to_id"],
            ["users.id"],
            name=op.f("fk_approval_steps_assigned_to_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["claims.id"],
            name=op.f("fk_approval_steps_claim_id_claims"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["level_no"],
            ["approval_levels.level_no"],
            name=op.f("fk_approval_steps_level_no_approval_levels"),
        ),
        sa.ForeignKeyConstraint(
            ["on_behalf_of_id"],
            ["users.id"],
            name=op.f("fk_approval_steps_on_behalf_of_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_approval_steps")),
    )
    with op.batch_alter_table("approval_steps", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_approval_steps_claim_id"), ["claim_id"], unique=False)
        batch_op.create_index(
            "ix_approval_steps_inbox", ["assigned_to_id", "status", "created_at"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_approval_steps_status"), ["status"], unique=False)
        batch_op.create_index(
            "uq_approval_steps_one_pending",
            ["claim_id", "round", "level_no"],
            unique=True,
            sqlite_where=sa.text("status = 'PENDING'"),
            postgresql_where=sa.text("status = 'PENDING'"),
        )

    op.create_table(
        "claim_lines",
        sa.Column("claim_id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("category_code", sa.String(length=16), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("vendor", sa.String(length=120), nullable=False),
        sa.Column("vendor_norm", sa.String(length=120), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("city_id", sa.String(length=36), nullable=True),
        sa.Column("nights", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.String(length=36), nullable=True),
        sa.Column("receipt_sha256", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'AUTO_APPROVED', 'NEEDS_APPROVAL', 'AUTO_REJECTED', 'APPROVED', 'REJECTED')",
            name=op.f("ck_claim_lines_status_valid"),
        ),
        sa.CheckConstraint("amount_paise > 0", name=op.f("ck_claim_lines_amount_positive")),
        sa.CheckConstraint("nights >= 1", name=op.f("ck_claim_lines_nights_positive")),
        sa.ForeignKeyConstraint(
            ["category_code"],
            ["categories.code"],
            name=op.f("fk_claim_lines_category_code_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["city_id"],
            ["cities.id"],
            name=op.f("fk_claim_lines_city_id_cities"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["claims.id"],
            name=op.f("fk_claim_lines_claim_id_claims"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_claim_lines_owner_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["receipt_id"],
            ["receipts.id"],
            name=op.f("fk_claim_lines_receipt_id_receipts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_claim_lines")),
    )
    with op.batch_alter_table("claim_lines", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_claim_lines_claim_id"), ["claim_id"], unique=False)
        batch_op.create_index(
            "ix_claim_lines_daily", ["owner_id", "category_code", "expense_date"], unique=False
        )
        batch_op.create_index(
            "ix_claim_lines_dup", ["vendor_norm", "amount_paise", "expense_date"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_claim_lines_receipt_id"), ["receipt_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_claim_lines_receipt_sha256"), ["receipt_sha256"], unique=False
        )

    op.create_table(
        "payout_items",
        sa.Column("batch_id", sa.String(length=36), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("claim_id", sa.String(length=36), nullable=False),
        sa.Column("employee_id", sa.String(length=36), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("bank_ref", sa.String(length=40), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint("amount_paise > 0", name=op.f("ck_payout_items_amount_positive")),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["payout_batches.id"],
            name=op.f("fk_payout_items_batch_id_payout_batches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["claims.id"],
            name=op.f("fk_payout_items_claim_id_claims"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["users.id"],
            name=op.f("fk_payout_items_employee_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payout_items")),
        sa.UniqueConstraint("claim_id", name=op.f("uq_payout_items_claim_id")),
    )
    with op.batch_alter_table("payout_items", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_payout_items_batch_id"), ["batch_id"], unique=False)

    op.create_table(
        "sample_audits",
        sa.Column("claim_id", sa.String(length=36), nullable=False),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("draw_value", sa.Double(), nullable=False),
        sa.Column("rate", sa.Double(), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("reviewer_id", sa.String(length=36), nullable=True),
        sa.Column("outcome_note", sa.String(length=2000), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint(
            "status IN ('PENDING', 'PASSED', 'FAILED')", name=op.f("ck_sample_audits_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["claims.id"],
            name=op.f("fk_sample_audits_claim_id_claims"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_sample_audits_reviewer_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sample_audits")),
        sa.UniqueConstraint("claim_id", name=op.f("uq_sample_audits_claim_id")),
    )
    with op.batch_alter_table("sample_audits", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sample_audits_status"), ["status"], unique=False)

    op.create_table(
        "claim_comments",
        sa.Column("claim_id", sa.String(length=36), nullable=False),
        sa.Column("line_id", sa.String(length=36), nullable=True),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_claim_comments_author_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["claim_id"],
            ["claims.id"],
            name=op.f("fk_claim_comments_claim_id_claims"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["line_id"],
            ["claim_lines.id"],
            name=op.f("fk_claim_comments_line_id_claim_lines"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_claim_comments")),
    )
    with op.batch_alter_table("claim_comments", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_claim_comments_claim_id"), ["claim_id"], unique=False)

    op.create_table(
        "line_findings",
        sa.Column("line_id", sa.String(length=36), nullable=False),
        sa.Column("rule_code", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=8), nullable=False),
        sa.Column("severity", sa.String(length=8), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("force_level", sa.Integer(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.CheckConstraint(
            "outcome IN ('REJECT', 'ROUTE', 'FLAG')", name=op.f("ck_line_findings_outcome_valid")
        ),
        sa.ForeignKeyConstraint(
            ["line_id"],
            ["claim_lines.id"],
            name=op.f("fk_line_findings_line_id_claim_lines"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_line_findings")),
    )
    with op.batch_alter_table("line_findings", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_line_findings_line_id"), ["line_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_line_findings_rule_code"), ["rule_code"], unique=False)

    # ### end Alembic commands ###
    _create_db_rules()


def downgrade() -> None:
    _drop_db_rules()
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("line_findings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_line_findings_rule_code"))
        batch_op.drop_index(batch_op.f("ix_line_findings_line_id"))

    op.drop_table("line_findings")
    with op.batch_alter_table("claim_comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_claim_comments_claim_id"))

    op.drop_table("claim_comments")
    with op.batch_alter_table("sample_audits", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sample_audits_status"))

    op.drop_table("sample_audits")
    with op.batch_alter_table("payout_items", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_payout_items_batch_id"))

    op.drop_table("payout_items")
    with op.batch_alter_table("claim_lines", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_claim_lines_receipt_sha256"))
        batch_op.drop_index(batch_op.f("ix_claim_lines_receipt_id"))
        batch_op.drop_index("ix_claim_lines_dup")
        batch_op.drop_index("ix_claim_lines_daily")
        batch_op.drop_index(batch_op.f("ix_claim_lines_claim_id"))

    op.drop_table("claim_lines")
    with op.batch_alter_table("approval_steps", schema=None) as batch_op:
        batch_op.drop_index(
            "uq_approval_steps_one_pending",
            sqlite_where=sa.text("status = 'PENDING'"),
            postgresql_where=sa.text("status = 'PENDING'"),
        )
        batch_op.drop_index(batch_op.f("ix_approval_steps_status"))
        batch_op.drop_index("ix_approval_steps_inbox")
        batch_op.drop_index(batch_op.f("ix_approval_steps_claim_id"))

    op.drop_table("approval_steps")
    with op.batch_alter_table("policy_rules", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_policy_rules_policy_version_id"))

    op.drop_table("policy_rules")
    with op.batch_alter_table("claims", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_claims_submitted_at"))
        batch_op.drop_index("ix_claims_queue")
        batch_op.drop_index(batch_op.f("ix_claims_payout_batch_id"))
        batch_op.drop_index("ix_claims_owner_status")
        batch_op.drop_index(batch_op.f("ix_claims_owner_id"))
        batch_op.drop_index(batch_op.f("ix_claims_department_id"))

    op.drop_table("claims")
    with op.batch_alter_table("receipts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_receipts_sha256"))
        batch_op.drop_index(batch_op.f("ix_receipts_owner_id"))

    op.drop_table("receipts")
    with op.batch_alter_table("policy_versions", schema=None) as batch_op:
        batch_op.drop_index(
            "uq_policy_versions_single_active",
            sqlite_where=sa.text("status = 'ACTIVE'"),
            postgresql_where=sa.text("status = 'ACTIVE'"),
        )

    op.drop_table("policy_versions")
    with op.batch_alter_table("payout_batches", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_payout_batches_status"))

    op.drop_table("payout_batches")
    with op.batch_alter_table("delegations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_delegations_delegator_id"))
        batch_op.drop_index(batch_op.f("ix_delegations_delegate_id"))

    op.drop_table("delegations")
    op.drop_table("bank_accounts")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_role"))
        batch_op.drop_index(batch_op.f("ix_users_manager_id"))
        batch_op.drop_index(batch_op.f("ix_users_department_id"))

    op.drop_table("users")
    op.drop_table("departments")
    op.drop_table("claim_transitions")
    op.drop_table("cities")
    op.drop_table("categories")
    with op.batch_alter_table("audit_events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_audit_events_ts"))
        batch_op.drop_index("ix_audit_events_claim")
        batch_op.drop_index(batch_op.f("ix_audit_events_actor_id"))
        batch_op.drop_index(batch_op.f("ix_audit_events_action"))

    op.drop_table("audit_events")
    op.drop_table("approval_levels")
    op.drop_table("app_config")
    # ### end Alembic commands ###
