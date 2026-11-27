"""Deterministic demo seed (ARD section 12, PLAN P2-10).

Run from backend/:   python -m app.seeds.generate   (applies migrations first)

- 8 departments, 150 employees (1 finance head, 3 auditors, 18 managers, the rest employees)
  in a 3 to 4 level acyclic hierarchy, ~25 cities from reference_data.json, fake bank accounts.
- 3,000 claims over the last 12 months, created and decided through the REAL services with a
  simulated clock, so findings, approval steps, delegations, sample audits, payout batches and
  audit events are genuine. Only the clock is faked.
- Planted cases (duplicates, limit breaches, missing receipts, weekend lines, boundary values,
  split claims) are written to seed_manifest.json with whether the system detected each one.
- A fixed random seed makes the data the same on every run (ids and timestamps of rows differ).

Demo logins (one per role) are printed once at the end; the password comes from the
SEED_DEMO_PASSWORD environment variable or is generated. It is never written to a file.
"""

import io
import json
import os
import random
import secrets
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import Principal, Role
from app.core.config import get_settings
from app.core.db import create_db_engine
from app.core.errors import AppError
from app.core.pagination import PageParams
from app.core.security import hash_password
from app.modules.audit.service import AuditService
from app.modules.claims.schemas import (
    ApproveRequest,
    ClaimCreate,
    DelegationCreate,
    LineCreate,
    RejectRequest,
    SampleResolve,
    SendBackRequest,
)
from app.modules.claims.service import ClaimsService, claims_service
from app.modules.org.service import OrgService, org_service
from app.modules.payouts.service import PayoutsService, payouts_service
from app.modules.policy.schemas import load_reference_data
from app.modules.policy.service import PolicyService, policy_service
from app.modules.receipts.service import ReceiptService, receipt_service

SEED = 20261127
TODAY = date(2026, 11, 27)
CLAIMS = 3000
MANIFEST = Path(__file__).resolve().parent / "seed_manifest.json"
BACKEND_DIR = Path(__file__).resolve().parents[2]
PNG = b"\x89PNG\r\n\x1a\n"
DEPARTMENTS = [
    ("ENG", "Engineering"),
    ("DEL", "Delivery"),
    ("SAL", "Sales"),
    ("MKT", "Marketing"),
    ("OPS", "Operations"),
    ("HR", "HR"),
    ("FIN", "Finance"),
    ("LEG", "Legal"),
]
FIRST = [
    "Aarav", "Aditi", "Akash", "Ananya", "Arjun", "Diya", "Farah", "Gaurav", "Ishaan", "Kavya",
    "Meera", "Neha", "Nikhil", "Priya", "Rahul", "Riya", "Rohan", "Sana", "Tanvi", "Vikram",
    "Zoya", "Kabir", "Leela", "Omar",
]  # fmt: skip
LAST = [
    "Sharma", "Verma", "Iyer", "Nair", "Reddy", "Gupta", "Khan", "Das",
    "Menon", "Patel", "Rao", "Joshi", "Bose", "Kapoor", "Singh", "Pillai",
]  # fmt: skip
VENDORS = {
    "MEALS": ["Saravana Bhavan", "Haldiram's", "Barbeque Nation", "Cafe Coffee Day", "Udupi Grand"],
    "HOTEL": ["Taj Hotel", "ITC Grand", "Lemon Tree", "Ginger Hotel", "Treebo Stay"],
    "LOCAL_CAB": ["Ola", "Uber", "Meru Cabs", "BluSmart"],
    "TRAVEL": ["IndiGo", "Air India", "IRCTC", "Vistara"],
    "OTHER": ["Amazon Business", "Staples India", "Croma", "Reliance Digital"],
}


class SimClock:
    """The services' injectable clock, moved forward by the simulation."""

    def __init__(self, start: datetime) -> None:
        self.value = start

    def __call__(self) -> datetime:
        return self.value

    def at(self, day: date, hour: int = 11) -> None:
        self.value = datetime.combine(day, time(hour, 0), UTC)


@dataclass
class Plant:
    kind: str
    expected_rule: str | None
    claim_no: str = ""
    line_position: int = 1
    detected: bool | None = None
    note: str = ""
    expected_levels: list[int] | None = None
    absent_rule: str | None = None


@dataclass
class World:
    session: Session
    clock: SimClock
    rng: random.Random
    org: OrgService
    policy: PolicyService
    claims: ClaimsService
    receipts: ReceiptService
    payouts: PayoutsService
    people: dict[str, tuple[str, Role]] = field(default_factory=dict)  # id -> (name, role)
    employees: list[str] = field(default_factory=list)
    head: str = ""
    auditors: list[str] = field(default_factory=list)
    managers: list[str] = field(default_factory=list)
    city_ids: list[str] = field(default_factory=list)
    plants: list[Plant] = field(default_factory=list)
    receipt_n: int = 0

    def principal(self, user_id: str) -> Principal:
        return Principal(id=user_id, role=self.people[user_id][1])

    def receipt(self, user_id: str, content: bytes | None = None) -> str:
        self.receipt_n += 1
        data = content or PNG + f"seed-receipt-{self.receipt_n}".encode()
        return self.receipts.upload(self.principal(user_id), "receipt.png", io.BytesIO(data)).id


def build_world(session: Session) -> World:
    settings = get_settings()
    clock = SimClock(datetime.combine(TODAY - timedelta(days=400), time(9), UTC))
    rng = random.Random(SEED)  # noqa: S311 - deterministic demo data, not security
    audit = AuditService(session, clock)
    org = org_service(session, audit)
    policy = policy_service(session, audit, clock)
    receipts = receipt_service(session, audit, settings)
    claims = claims_service(session, audit, org, policy, receipts, clock, rng)
    payouts = payouts_service(session, claims, org, policy, audit, clock)
    return World(session, clock, rng, org, policy, claims, receipts, payouts)


# ---------------------------------------------------------------------- organisation
def seed_org(w: World, password_hash: str) -> dict[str, str]:
    """150 people. Returns the demo login email per role."""
    data = load_reference_data()
    w.city_ids = [w.org.create_city(c["name"], int(c["tier"])) for c in data["cities"]]
    depts = {code: w.org.create_department(code, name) for code, name in DEPARTMENTS}
    names = iter(f"{f} {last}" for last in LAST for f in FIRST)
    n = 0

    def user(role: Role, dept: str, manager: str | None, email: str | None = None) -> str:
        nonlocal n
        n += 1
        name = next(names)
        uid = w.org.create_user(
            email=email
            or f"{name.lower().replace(' ', '.').replace(chr(39), '')}{n}@expenseflow.test",
            full_name=name,
            employee_code=f"E{n:05d}",
            role=role,
            department_id=depts[dept],
            manager_id=manager,
            home_city_id=w.rng.choice(w.city_ids),
            password_hash=password_hash,
            is_active=True,
        )
        w.org.set_bank_account(uid, f"{w.rng.randrange(10**11, 10**12):012d}", f"MOCK{n:07d}", name)
        w.people[uid] = (name, role)
        return uid

    w.head = user("FINANCE_HEAD", "FIN", None, "head@expenseflow.test")
    w.auditors = [
        user("AUDITOR", "FIN", w.head, "auditor@expenseflow.test" if i == 0 else None)
        for i in range(3)
    ]
    # 8 department managers report to the head; 10 team managers report to them (4 levels deep).
    dept_managers = {
        code: user("MANAGER", code, w.head, "manager@expenseflow.test" if code == "ENG" else None)
        for code, _ in DEPARTMENTS
    }
    team_managers = [
        (code, user("MANAGER", code, dept_managers[code]))
        for code, _ in DEPARTMENTS[:5]
        for _ in range(2)
    ]
    w.managers = [*dept_managers.values(), *(m for _, m in team_managers)]
    leads = [*dept_managers.items(), *team_managers]
    first_employee = True
    while len(w.people) < 150:
        code, manager = leads[len(w.people) % len(leads)]
        w.employees.append(
            user("EMPLOYEE", code, manager, "employee@expenseflow.test" if first_employee else None)
        )
        first_employee = False
    w.session.flush()
    return {
        "EMPLOYEE": "employee@expenseflow.test",
        "MANAGER": "manager@expenseflow.test",
        "AUDITOR": "auditor@expenseflow.test",
        "FINANCE_HEAD": "head@expenseflow.test",
    }


# ---------------------------------------------------------------------- claims
def weekday_before(day: date, rng: random.Random, max_back: int = 6) -> date:
    for _ in range(20):
        d = day - timedelta(days=rng.randint(1, max_back))
        if d.weekday() < 5:
            return d
    return day - timedelta(days=3)


def normal_line(w: World, owner: str, expense: date) -> LineCreate:
    rng = w.rng
    category = rng.choices(list(VENDORS), weights=[30, 15, 30, 10, 15])[0]
    amount = {
        "MEALS": rng.randint(15_000, 120_000),
        "HOTEL": rng.randint(250_000, 390_000),
        "LOCAL_CAB": rng.randint(15_000, 180_000),
        "TRAVEL": rng.randint(300_000, 1_800_000),
        "OTHER": rng.randint(20_000, 900_000),
    }[category]
    return LineCreate(
        category=category,  # type: ignore[arg-type]
        description=f"{category.replace('_', ' ').title()} for client work",
        vendor=rng.choice(VENDORS[category]),
        amount_paise=amount,
        expense_date=expense,
        city_id=rng.choice(w.city_ids) if category == "HOTEL" else None,
        nights=1,
        receipt_id=w.receipt(owner) if amount > 50_000 else None,
    )


def submit(w: World, owner: str, lines: list[LineCreate], when: date, title: str) -> dict[str, Any]:
    w.clock.at(when, 10)
    p = w.principal(owner)
    draft = w.claims.create(p, ClaimCreate(title=title, lines=lines))
    detail = w.claims.submit(p, draft.id, draft.version)
    return detail.model_dump()


def decide(w: World, claim: dict[str, Any], when: date) -> None:
    """Walk a routed claim through its chain with a realistic mix of outcomes."""
    rng = w.rng
    day = when
    while claim["status"] in ("PENDING_MANAGER", "PENDING_AUDITOR", "PENDING_HEAD"):
        day += timedelta(days=rng.choice([0, 1, 1, 2, 3, 5]))
        if day >= TODAY - timedelta(days=2):
            return  # recent claims stay pending: the queues and oldest-age metric have data
        step = claim["current_step"]
        actor = actor_for(w, claim, step)
        if actor is None:
            return  # nobody eligible (NEEDS_REASSIGNMENT is in the audit trail)
        w.clock.at(day, rng.randint(9, 18))
        p = w.principal(actor)
        roll = rng.random()
        try:
            if roll < 0.06:
                claim = w.claims.reject(
                    p,
                    step["id"],
                    RejectRequest(
                        expected_version=claim["version"], comment="Not a business expense."
                    ),
                ).model_dump()
            elif roll < 0.12 and claim["round"] == 1:
                claim = w.claims.send_back(
                    p,
                    step["id"],
                    SendBackRequest(
                        expected_version=claim["version"], comment="Please attach the client name."
                    ),
                ).model_dump()
                day += timedelta(days=rng.randint(1, 3))
                if day >= TODAY - timedelta(days=2) or rng.random() < 0.3:
                    return  # some stay SENT_BACK
                w.clock.at(day, 10)
                claim = w.claims.resubmit(
                    w.principal(claim["owner_id"]), claim["id"], claim["version"]
                ).model_dump()
            else:
                claim = w.claims.approve(
                    p, step["id"], ApproveRequest(expected_version=claim["version"])
                ).model_dump()
        except AppError:
            return


def actor_for(w: World, claim: dict[str, Any], step: dict[str, Any]) -> str | None:
    if step["assigned_to"]:
        return str(step["assigned_to"])
    acted = {s["acted_by_id"] for s in claim["steps"] if s["round"] == claim["round"]}
    pool = [a for a in w.auditors if a != claim["owner_id"] and a not in acted]
    return w.rng.choice(pool) if pool else None


def seed_claims(w: World, total: int = CLAIMS) -> None:
    rng = w.rng
    start = TODAY - timedelta(days=365)
    days = sorted(start + timedelta(days=rng.randint(0, 360)) for _ in range(total))
    plan = plant_schedule(rng, total)
    for i, submit_day in enumerate(days):
        owner = rng.choice(w.employees if rng.random() < 0.9 else w.managers)
        kind = plan.get(i)
        if kind:
            claim = planted_claim(w, kind, owner, submit_day)
        else:
            lines = [
                normal_line(w, owner, weekday_before(submit_day, rng))
                for _ in range(rng.choices([1, 2, 3, 4, 5, 6], [30, 25, 20, 12, 8, 5])[0])
            ]
            claim = submit(
                w,
                owner,
                lines,
                submit_day,
                rng.choice(
                    ["Client visit", "Team offsite", "Sales trip", "Conference", "Local travel"]
                ),
            )
        decide(w, claim, submit_day)
        if i % 250 == 0:
            w.session.flush()
            print(f"  {i}/{total} claims", file=sys.stderr)


def plant_schedule(rng: random.Random, total: int = CLAIMS) -> dict[int, str]:
    """Which claim slots carry a planted case. A small run (tests) plants a sample of them."""
    kinds = (
        ["dup_vendor"] * 60
        + ["dup_receipt"] * 40
        + ["meals_breach"] * 30
        + ["hotel_breach"] * 30
        + ["cab_breach"] * 30
        + ["missing_receipt"] * 50
        + ["weekend"] * 120
        + ["split"] * 15
        + [
            "boundary_meals_at",
            "boundary_meals_over",
            "boundary_25k_at",
            "boundary_25k_over",
            "boundary_1l_at",
            "boundary_1l_over",
            "boundary_receipt_at",
            "boundary_receipt_over",
        ]
    )
    warmup = min(200, total // 4)  # some normal history first, so duplicates have sources
    room = total - warmup
    if room < len(kinds):
        kinds = rng.sample(kinds, room // 2)
    slots = rng.sample(range(warmup, total), len(kinds))
    return dict(zip(slots, kinds, strict=True))


_EARLIER: list[tuple[str, LineCreate, bytes]] = []  # clean lines to copy for duplicates


# kind -> (category, min paise, max paise, rule that must fire)
_BREACHES: dict[str, tuple[str, int, int, str]] = {
    "meals_breach": ("MEALS", 150_100, 400_000, "MEALS_DAILY_CAP"),
    "hotel_breach": ("HOTEL", 610_000, 900_000, "HOTEL_NIGHT_CAP"),
    "cab_breach": ("LOCAL_CAB", 200_100, 450_000, "CAB_TRIP_CAP"),
    "missing_receipt": ("OTHER", 50_001, 400_000, "RECEIPT_REQUIRED"),
    "weekend": ("OTHER", 20_000, 300_000, "WEEKEND_SPEND"),
}


def _duplicate_lines(w: World, kind: str, owner: str, day: date, line: Any) -> list[LineCreate]:
    """Copy an earlier clean line (vendor, amount, date) or re-upload its exact receipt file,
    sometimes by another employee."""
    if not _EARLIER:
        content = PNG + f"dup-source-{w.rng.random()}".encode()
        src = line("OTHER", 300_000, receipt_id=w.receipt(owner, content))
        submit(w, owner, [src], day, "Supplies")
        _EARLIER.append((owner, src, content))
    _, src, content = w.rng.choice(_EARLIER)
    if kind == "dup_vendor":
        return [src.model_copy(update={"receipt_id": w.receipt(owner)})]
    amount = w.rng.randint(60_000, 400_000)
    return [line("OTHER", amount, receipt_id=w.receipt(owner, content))]


def _split_lines(w: World, owner: str, day: date, exp: date, line: Any) -> list[LineCreate]:
    """C1: 18,000 now and 12,000 a day apart at the same vendor (30,000 > the 25,000 level)."""
    vendor = f"Split Vendor {w.rng.randint(1000, 9999)}"
    submit(w, owner, [line("OTHER", 1_800_000, vendor=vendor)], day, "Event part 1")
    second = exp - timedelta(days=1)
    return [
        line(
            "OTHER", 1_200_000, vendor=vendor, expense_date=second if second.weekday() < 5 else exp
        )
    ]


def _detected(plant: Plant, claim: dict[str, Any]) -> bool:
    """Did the system do what the planted case expects?"""
    codes = {f["rule_code"] for ln in claim["lines"] for f in ln["findings"]}
    checks = []
    if plant.expected_rule:
        checks.append(plant.expected_rule in codes)
    if plant.absent_rule:
        checks.append(plant.absent_rule not in codes)
    if plant.expected_levels is not None:
        checks.append(claim["required_levels"] == plant.expected_levels)
    return all(checks)


def planted_claim(w: World, kind: str, owner: str, day: date) -> dict[str, Any]:
    rng = w.rng
    exp = weekday_before(day, rng)
    plant = Plant(kind=kind, expected_rule=None)

    def line(category: str, amount: int, *, receipt: bool = True, **kw: Any) -> LineCreate:
        values: dict[str, Any] = {
            "category": category,
            "description": f"Planted: {kind}",
            "vendor": f"{rng.choice(VENDORS[category])} {rng.randint(100, 999)}",
            "amount_paise": amount,
            "expense_date": exp,
            "receipt_id": w.receipt(owner) if receipt and amount > 50_000 else None,
        }
        values.update(kw)
        return LineCreate(**values)

    if kind in ("dup_vendor", "dup_receipt"):
        lines, plant.expected_rule = _duplicate_lines(w, kind, owner, day, line), "DUPLICATE_LINE"
    elif kind == "split":
        lines, plant.expected_rule = _split_lines(w, owner, day, exp, line), "SPLIT_SUSPECT"
    elif kind in _BREACHES:
        category, low, high, rule = _BREACHES[kind]
        extra: dict[str, Any] = {}
        if kind == "hotel_breach":
            extra["city_id"] = w.city_ids[0]  # Mumbai, tier 1
        if kind == "missing_receipt":
            extra["receipt"] = False
        if kind == "weekend":
            extra["expense_date"] = exp - timedelta(days=(exp.weekday() - 5) % 7)  # a Saturday
        lines, plant.expected_rule = [line(category, rng.randint(low, high), **extra)], rule
    else:
        lines, plant.expected_rule, plant.note, plant.expected_levels, plant.absent_rule = boundary(
            kind, line
        )
    claim = submit(w, owner, lines, day, f"Planted {kind}")
    plant.claim_no = claim["claim_no"]
    plant.detected = _detected(plant, claim)
    w.plants.append(plant)
    return claim


Boundary = tuple[list[LineCreate], str | None, str, list[int] | None, str | None]


def boundary(kind: str, line: Any) -> Boundary:
    """(lines, rule that must fire, note, required levels expected, rule that must NOT fire)."""
    cases: dict[str, Boundary] = {
        "boundary_meals_at": (
            [line("MEALS", 150_000)],
            None,
            "meals exactly 1,500 passes",
            None,
            "MEALS_DAILY_CAP",
        ),
        "boundary_meals_over": (
            [line("MEALS", 150_001)],
            "MEALS_DAILY_CAP",
            "meals 1,500.01 is rejected",
            None,
            None,
        ),
        "boundary_25k_at": (
            [line("TRAVEL", 2_500_000)],
            None,
            "25,000 needs the manager only",
            [1],
            None,
        ),
        "boundary_25k_over": (
            [line("TRAVEL", 2_500_001)],
            None,
            "25,000.01 adds the auditor",
            [1, 2],
            None,
        ),
        "boundary_1l_at": (
            [line("TRAVEL", 5_000_000), line("TRAVEL", 5_000_000)],
            None,
            "1,00,000 stops at the auditor",
            [1, 2],
            None,
        ),
        "boundary_1l_over": (
            [line("TRAVEL", 5_000_000), line("TRAVEL", 5_000_001)],
            None,
            "1,00,000.01 adds the head",
            [1, 2, 3],
            None,
        ),
        "boundary_receipt_at": (
            [line("OTHER", 50_000, receipt=False)],
            None,
            "500 without a receipt passes",
            None,
            "RECEIPT_REQUIRED",
        ),
        "boundary_receipt_over": (
            [line("OTHER", 50_001, receipt=False)],
            "RECEIPT_REQUIRED",
            "500.01 without a receipt is rejected",
            None,
            None,
        ),
    }
    return cases[kind]


# ---------------------------------------------------------------------- after the claims
def seed_delegations(w: World) -> None:
    """Two managers on leave this month; their delegates already acted on some claims."""
    for delegator, delegate in ((w.managers[0], w.managers[1]), (w.managers[2], w.managers[3])):
        w.clock.at(TODAY - timedelta(days=10))
        w.claims.create_delegation(
            w.principal(delegator),
            DelegationCreate(
                delegate_id=delegate,
                level_no=1,
                starts_at=w.clock() - timedelta(hours=1),
                ends_at=w.clock() + timedelta(days=20),
            ),
        )
    w.clock.at(TODAY - timedelta(days=1), 15)
    for delegate in (w.managers[1], w.managers[3]):
        inbox = w.claims.inbox(w.principal(delegate), PageParams(limit=100))
        for item in [i for i in inbox.items if i.delegated_from_id][:3]:
            w.claims.approve(
                w.principal(delegate), item.step_id, ApproveRequest(expected_version=item.version)
            )


def seed_samples(w: World) -> None:
    """Older sample audits are resolved (mostly PASSED); the last few weeks stay pending."""
    w.clock.at(TODAY - timedelta(days=1), 12)
    page = w.claims.sample_audits(w.principal(w.auditors[0]), "PENDING", PageParams(limit=100))
    for s in page.items:
        if s.selected_at.date() > TODAY - timedelta(days=21):
            continue
        failed = w.rng.random() < 0.1
        body = SampleResolve(
            result="FAILED" if failed else "PASSED",
            note="Receipt total does not match." if failed else None,
        )
        for auditor in w.auditors:  # an auditor never audits their own claim
            try:
                w.claims.resolve_sample(w.principal(auditor), s.id, body)
                break
            except AppError:
                continue


def seed_payouts(w: World) -> int:
    """One paid batch per month for claims decided before it; the latest batch stays VERIFIED."""
    head, checker = w.principal(w.head), w.principal(w.auditors[1])
    month_ends = sorted(
        {date(d.year, d.month, 1) for d in (TODAY - timedelta(days=30 * k) for k in range(1, 12))}
    )
    batches = 0
    for i, first in enumerate(month_ends):
        w.clock.at(first + timedelta(days=2), 10)
        cutoff = datetime.combine(first, time.min, UTC)
        ids = [
            c.id
            for c in w.claims.payable_claims()
            if c.decided_at and c.decided_at < cutoff and c.owner_id != head.id
        ]
        if not ids:
            continue
        batch = w.payouts.create(head, ids)
        w.payouts.verify(checker, batch.id)
        batches += 1
        if i == len(month_ends) - 1:
            continue  # leave one VERIFIED batch for the demo
        w.payouts.export(head, batch.id)
        w.payouts.mark_paid(head, batch.id)
    return batches


def seed(session: Session, password: str, total: int = CLAIMS) -> dict[str, Any]:
    """Load everything into an empty, migrated database; returns the manifest (not committed)."""
    if session.execute(text("SELECT 1 FROM users LIMIT 1")).first():
        msg = "The database already has users. Seed an empty, migrated database."
        raise RuntimeError(msg)
    _EARLIER.clear()
    w = build_world(session)
    w.policy.ensure_reference_data()
    print("Seeding organisation...", file=sys.stderr)
    logins = seed_org(w, hash_password(password))
    print(f"Seeding {total} claims through the services...", file=sys.stderr)
    seed_claims(w, total)
    seed_delegations(w)
    seed_samples(w)
    batches = seed_payouts(w)
    session.flush()
    rows = session.execute(text("SELECT status, COUNT(*) FROM claims GROUP BY status")).all()
    return {
        "seed": SEED,
        "today": TODAY.isoformat(),
        "claims": total,
        "claim_statuses": dict(sorted(Counter({s: int(n) for s, n in rows}).items())),
        "payout_batches": batches,
        "planted": len(w.plants),
        "planted_detected": sum(1 for p in w.plants if p.detected),
        "plants": [p.__dict__ for p in w.plants],
        "logins": logins,
    }


def migrate(database_url: str) -> None:
    """Bring the schema to the latest migration first (a no-op when it already is)."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


def main() -> None:
    database_url = get_settings().database_url
    migrate(database_url)
    engine = create_db_engine(database_url)
    password = os.environ.get("SEED_DEMO_PASSWORD") or secrets.token_urlsafe(12)
    with Session(engine) as session:
        try:
            manifest = seed(session, password)
        except RuntimeError as exc:
            sys.exit(str(exc))
        session.commit()
    engine.dispose()
    logins = manifest.pop("logins")
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(
        f"Done. Planted cases detected: {manifest['planted_detected']}/{manifest['planted']}"
        f" (see {MANIFEST.name})."
    )
    print("Demo logins (shown once; the password is not stored anywhere):")
    for role, email in logins.items():
        print(f"  {role:<13} {email}  /  {password}")


if __name__ == "__main__":
    main()
