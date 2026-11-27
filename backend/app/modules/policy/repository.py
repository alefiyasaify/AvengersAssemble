from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.policy.models import AppConfig, ApprovalLevel, PolicyRule, PolicyVersion


class PolicyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------ versions
    def active(self) -> PolicyVersion | None:
        return self._session.execute(
            select(PolicyVersion)
            .where(PolicyVersion.status == "ACTIVE")
            .options(selectinload(PolicyVersion.rules))
        ).scalar_one_or_none()

    def get(self, version_id: str) -> PolicyVersion | None:
        return self._session.execute(
            select(PolicyVersion)
            .where(PolicyVersion.id == version_id)
            .options(selectinload(PolicyVersion.rules))
        ).scalar_one_or_none()

    def all(self) -> list[PolicyVersion]:
        return list(
            self._session.execute(
                select(PolicyVersion)
                .order_by(PolicyVersion.version_no.desc())
                .options(selectinload(PolicyVersion.rules))
            ).scalars()
        )

    def max_version(self) -> int:
        return int(self._session.execute(select(func.max(PolicyVersion.version_no))).scalar() or 0)

    def add(self, version: PolicyVersion) -> PolicyVersion:
        self._session.add(version)
        self._session.flush()
        return version

    def replace_rules(self, version: PolicyVersion, rules: list[PolicyRule]) -> None:
        version.rules.clear()
        self._session.flush()
        version.rules.extend(rules)
        self._session.flush()

    def flush(self) -> None:
        self._session.flush()

    # ------------------------------------------------------------------ levels and config
    def levels(self) -> list[ApprovalLevel]:
        return list(
            self._session.execute(select(ApprovalLevel).order_by(ApprovalLevel.level_no)).scalars()
        )

    def replace_levels(self, levels: list[ApprovalLevel]) -> None:
        existing = {lv.level_no: lv for lv in self.levels()}
        for level in levels:
            current = existing.get(level.level_no)
            if current is None:
                self._session.add(level)
            else:
                current.role = level.role
                current.min_amount_paise_exclusive = level.min_amount_paise_exclusive
                current.active = level.active
        self._session.flush()

    def config(self) -> dict[str, Any]:
        return {row.key: row.value for row in self._session.execute(select(AppConfig)).scalars()}

    def set_config(self, key: str, value: Any) -> None:
        self._session.merge(AppConfig(key=key, value=value))
        self._session.flush()
