"""Public interface of the policy module (ARD section 5): configuration as data, versioned and
audited; evaluation through the pure engine."""

from typing import Any

from sqlalchemy.orm import Session

from app.core.auth import Principal, require_head
from app.core.clock import Clock
from app.core.db import utcnow
from app.core.errors import ConflictError, NotFoundError, ServiceUnavailableError, ValidationFailed
from app.modules.audit.service import AuditService
from app.modules.policy.engine import (
    ClaimContext,
    Evaluation,
    LineInput,
    evaluate,
    inr,
    normalise_vendor,
)
from app.modules.policy.models import ApprovalLevel, PolicyRule, PolicyVersion
from app.modules.policy.repository import PolicyRepository
from app.modules.policy.schemas import (
    AppConfigRead,
    AppConfigUpdate,
    ApprovalLevelConfig,
    PolicyRuleConfig,
    PolicySnapshot,
    PolicyVersionRead,
    load_reference_data,
)

__all__ = [
    "ClaimContext",
    "Evaluation",
    "LineInput",
    "PolicyService",
    "PolicySnapshot",
    "inr",
    "normalise_vendor",
]


def _rule_rows(rules: list[PolicyRuleConfig]) -> list[PolicyRule]:
    return [
        PolicyRule(
            position=i,
            code=r.code,
            type=r.type,
            category_code=r.category,
            params=r.params,
            outcome=r.outcome,
            severity=r.severity,
            force_level=r.force_level,
            message_template=r.message_template,
            active=r.active,
        )
        for i, r in enumerate(rules, start=1)
    ]


def _rule_config(row: PolicyRule) -> PolicyRuleConfig:
    return PolicyRuleConfig(
        code=row.code,
        type=row.type,  # type: ignore[arg-type]  # validated on write
        category=row.category_code,
        params=row.params,
        outcome=row.outcome,  # type: ignore[arg-type]
        severity=row.severity,  # type: ignore[arg-type]
        force_level=row.force_level,
        message_template=row.message_template,
        active=row.active,
    )


def _read(version: PolicyVersion) -> PolicyVersionRead:
    return PolicyVersionRead(
        id=version.id,
        version_no=version.version_no,
        status=version.status,  # type: ignore[arg-type]
        notes=version.notes,
        created_at=version.created_at,
        published_at=version.published_at,
        published_by_id=version.published_by_id,
        rules=[_rule_config(r) for r in version.rules],
    )


class PolicyService:
    def __init__(
        self, repository: PolicyRepository, audit: AuditService, now: Clock = utcnow
    ) -> None:
        self._repo = repository
        self._audit = audit
        self._now = now

    # ------------------------------------------------------------------ seeding
    def ensure_reference_data(self) -> None:
        """Idempotently seed approval levels, app config and policy version 1 (ACTIVE) from
        `seeds/reference_data.json` (the same file the rule fixtures accompany)."""
        data = load_reference_data()
        if not self._repo.levels():
            self._repo.replace_levels(
                [
                    ApprovalLevel(**ApprovalLevelConfig.model_validate(lv).model_dump())
                    for lv in data["approval_levels"]
                ]
            )
        config = self._repo.config()
        for key, value in data["app_config"].items():
            if key not in config:
                self._repo.set_config(key, value)
        if self._repo.max_version() == 0:
            rules = [PolicyRuleConfig.model_validate(r) for r in data["policy_rules"]]
            version = self._repo.add(
                PolicyVersion(
                    version_no=1,
                    status="DRAFT",
                    notes="Seeded from the ARD",
                    created_at=self._now(),
                )
            )
            self._repo.replace_rules(version, _rule_rows(rules))
            version.status = "ACTIVE"
            version.published_at = self._now()
            self._repo.flush()
            self._audit.record(
                actor_id=None,
                action="policy.seeded",
                entity_type="policy_version",
                entity_id=version.id,
                after={"version_no": 1, "rules": [r.code for r in rules]},
            )

    # ------------------------------------------------------------------ evaluation
    def snapshot(self, version_id: str | None = None) -> PolicySnapshot:
        version = self._repo.get(version_id) if version_id else self._repo.active()
        if version is None:
            raise ServiceUnavailableError("No active expense policy.", code="POLICY_MISSING")
        config = self.config_values()
        return PolicySnapshot(
            version_id=version.id,
            rules=[_rule_config(r) for r in version.rules],
            levels=[ApprovalLevelConfig.model_validate(lv) for lv in self._repo.levels()],
            auto_approve_max_total_paise=config.auto_approve_max_total_paise,
            sample_audit_rate=config.sample_audit_rate,
        )

    @staticmethod
    def evaluate(
        lines: list[LineInput], context: ClaimContext, snapshot: PolicySnapshot
    ) -> Evaluation:
        return evaluate(lines, context, snapshot)

    def level_roles(self) -> dict[int, str]:
        return {lv.level_no: lv.role for lv in self._repo.levels() if lv.active}

    def config_values(self) -> AppConfigRead:
        raw = load_reference_data()["app_config"] | self._repo.config()
        return AppConfigRead.model_validate(raw)

    # ------------------------------------------------------------------ reading
    def active_read(self) -> PolicyVersionRead:
        version = self._repo.active()
        if version is None:
            raise ServiceUnavailableError("No active expense policy.", code="POLICY_MISSING")
        return _read(version)

    def versions(self, principal: Principal) -> list[PolicyVersionRead]:
        require_head(principal)
        return [_read(v) for v in self._repo.all()]

    # ------------------------------------------------------------------ administration
    def create_draft(
        self, principal: Principal, notes: str | None, rules: list[PolicyRuleConfig] | None
    ) -> PolicyVersionRead:
        require_head(principal)
        if rules is None:
            active = self._repo.active()
            rules = [_rule_config(r) for r in active.rules] if active else []
        version = self._repo.add(
            PolicyVersion(
                version_no=self._repo.max_version() + 1,
                status="DRAFT",
                notes=notes,
                created_by_id=principal.id,
                created_at=self._now(),
            )
        )
        self._repo.replace_rules(version, _rule_rows(rules))
        self._audit.record(
            actor_id=principal.id,
            action="policy.draft_created",
            entity_type="policy_version",
            entity_id=version.id,
            after={"version_no": version.version_no},
        )
        return _read(version)

    def update_draft(
        self,
        principal: Principal,
        version_id: str,
        notes: str | None,
        rules: list[PolicyRuleConfig],
    ) -> PolicyVersionRead:
        require_head(principal)
        version = self._draft(version_id)
        before = _read(version).model_dump(mode="json")
        version.notes = notes
        self._repo.replace_rules(version, _rule_rows(rules))
        self._audit.record(
            actor_id=principal.id,
            action="policy.draft_updated",
            entity_type="policy_version",
            entity_id=version.id,
            before=before,
            after=_read(version).model_dump(mode="json"),
        )
        return _read(version)

    def publish(self, principal: Principal, version_id: str) -> PolicyVersionRead:
        """Atomic: retire the active version, activate this draft, audit the diff (C8)."""
        require_head(principal)
        version = self._draft(version_id)
        if not version.rules:
            raise ValidationFailed("A policy version needs at least one rule.", code="EMPTY_POLICY")
        current = self._repo.active()
        before = _read(current).model_dump(mode="json") if current else None
        if current is not None:
            current.status = "RETIRED"
            self._repo.flush()
        version.status = "ACTIVE"
        version.published_by_id = principal.id
        version.published_at = self._now()
        self._repo.flush()
        self._audit.record(
            actor_id=principal.id,
            action="policy.published",
            entity_type="policy_version",
            entity_id=version.id,
            before=before,
            after=_read(version).model_dump(mode="json"),
        )
        return _read(version)

    def levels(self, principal: Principal) -> list[ApprovalLevelConfig]:
        require_head(principal)
        return [ApprovalLevelConfig.model_validate(lv) for lv in self._repo.levels()]

    def set_levels(
        self, principal: Principal, levels: list[ApprovalLevelConfig]
    ) -> list[ApprovalLevelConfig]:
        require_head(principal)
        numbers = [lv.level_no for lv in levels]
        if len(numbers) != len(set(numbers)) or 1 not in numbers:
            raise ValidationFailed("Levels must be unique and include level 1.", code="BAD_LEVELS")
        before = [lv.model_dump() for lv in self.levels(principal)]
        self._repo.replace_levels([ApprovalLevel(**lv.model_dump()) for lv in levels])
        after = [lv.model_dump() for lv in self.levels(principal)]
        self._audit.record(
            actor_id=principal.id,
            action="config.approval_levels_updated",
            entity_type="approval_level",
            entity_id="all",
            before={"levels": before},
            after={"levels": after},
        )
        return self.levels(principal)

    def config(self, principal: Principal) -> AppConfigRead:
        require_head(principal)
        return self.config_values()

    def set_config(self, principal: Principal, data: AppConfigUpdate) -> AppConfigRead:
        require_head(principal)
        before = self.config_values().model_dump()
        for key, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
            self._repo.set_config(key, value)
        after = self.config_values().model_dump()
        self._audit.record(
            actor_id=principal.id,
            action="config.updated",
            entity_type="app_config",
            entity_id="app_config",
            before=before,
            after=after,
        )
        return self.config_values()

    def _draft(self, version_id: str) -> PolicyVersion:
        version = self._repo.get(version_id)
        if version is None:
            raise NotFoundError("Policy version was not found.", code="POLICY_VERSION_NOT_FOUND")
        if version.status != "DRAFT":
            raise ConflictError(
                "Published policy versions are immutable; create a new draft.",
                code="POLICY_VERSION_IMMUTABLE",
            )
        return version


def policy_service(session: Session, audit: AuditService, now: Clock = utcnow) -> PolicyService:
    return PolicyService(PolicyRepository(session), audit, now)


def config_value(snapshot: Any, key: str) -> Any:  # pragma: no cover - convenience for scripts
    return getattr(snapshot, key)
