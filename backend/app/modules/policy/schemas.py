"""Policy configuration (ARD section 5) and policy API schemas.

Rule *types* are code (engine registry); rule *instances*, approval levels and scalar settings
are data. `PolicySnapshot` is everything the pure engine needs, loaded from the database (or,
for tests and the seed, from `app/seeds/reference_data.json`).
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

RuleType = Literal[
    "daily_cap",
    "per_unit_cap_by_tier",
    "per_line_cap",
    "receipt_required_above",
    "duplicate",
    "weekend_flag",
    "split_window",
    "max_age_days",
]
Outcome = Literal["REJECT", "ROUTE", "FLAG"]
Severity = Literal["low", "medium", "high"]
LevelRole = Literal["MANAGER", "AUDITOR", "FINANCE_HEAD"]
PolicyStatus = Literal["DRAFT", "ACTIVE", "RETIRED"]

SEED_PATH = Path(__file__).resolve().parents[2] / "seeds" / "reference_data.json"

# Required params per rule type: name -> (type, must be positive)
_PARAMS: dict[str, dict[str, type]] = {
    "daily_cap": {"cap": int},
    "per_unit_cap_by_tier": {"cap_by_tier": dict},
    "per_line_cap": {"cap": int},
    "receipt_required_above": {"threshold": int},
    "duplicate": {},
    "weekend_flag": {"weekend_days": list},
    "split_window": {"window_days": int, "threshold_level": int},
    "max_age_days": {"max_age_days": int},
}
_NEEDS_CATEGORY = {"daily_cap", "per_unit_cap_by_tier", "per_line_cap"}


class PolicyRuleConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Z][A-Z0-9_]*$")
    type: RuleType
    category: str | None = Field(default=None, max_length=16)
    params: dict[str, Any] = Field(default_factory=dict)
    outcome: Outcome
    severity: Severity = "medium"
    force_level: int | None = Field(default=None, ge=1, le=10)
    message_template: str = Field(min_length=1, max_length=300)
    active: bool = True

    @model_validator(mode="after")
    def _validate_params(self) -> "PolicyRuleConfig":
        for name, kind in _PARAMS[self.type].items():
            value = self.params.get(name)
            if not isinstance(value, kind) or isinstance(value, bool):
                msg = f"rule {self.code}: param '{name}' must be a {kind.__name__}"
                raise ValueError(msg)
            if kind is int and value < 0:
                msg = f"rule {self.code}: param '{name}' must not be negative"
                raise ValueError(msg)
        if self.type in _NEEDS_CATEGORY and not self.category:
            msg = f"rule {self.code}: a category is required for {self.type}"
            raise ValueError(msg)
        if self.type == "per_unit_cap_by_tier" and "default" not in self.params["cap_by_tier"]:
            msg = f"rule {self.code}: cap_by_tier needs a 'default' entry"
            raise ValueError(msg)
        return self


class ApprovalLevelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    level_no: int = Field(ge=1, le=10)
    role: LevelRole
    min_amount_paise_exclusive: int = Field(ge=0)
    active: bool = True


class PolicySnapshot(BaseModel):
    """Everything the engine needs for one evaluation."""

    version_id: str | None = None
    rules: list[PolicyRuleConfig]
    levels: list[ApprovalLevelConfig]
    auto_approve_max_total_paise: int = Field(ge=0)
    sample_audit_rate: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def _unique_codes(self) -> "PolicySnapshot":
        codes = [r.code for r in self.rules]
        if len(codes) != len(set(codes)):
            msg = "rule codes must be unique within a policy version"
            raise ValueError(msg)
        return self

    def level_threshold(self, level_no: int) -> int | None:
        for level in self.levels:
            if level.level_no == level_no and level.active:
                return level.min_amount_paise_exclusive
        return None


def load_reference_data() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return data


def load_seed_snapshot() -> PolicySnapshot:
    data = load_reference_data()
    return PolicySnapshot(
        rules=[PolicyRuleConfig.model_validate(r) for r in data["policy_rules"]],
        levels=[ApprovalLevelConfig.model_validate(lv) for lv in data["approval_levels"]],
        auto_approve_max_total_paise=data["app_config"]["auto_approve_max_total_paise"],
        sample_audit_rate=data["app_config"]["sample_audit_rate"],
    )


# ------------------------------------------------------------------ API schemas
class PolicyVersionRead(BaseModel):
    id: str
    version_no: int
    status: PolicyStatus
    notes: str | None
    created_at: datetime
    published_at: datetime | None
    published_by_id: str | None
    rules: list[PolicyRuleConfig]


class PolicyVersionCreate(BaseModel):
    """Start a DRAFT version, copied from the active one unless rules are given."""

    model_config = ConfigDict(extra="forbid")

    notes: str | None = Field(default=None, max_length=500)
    rules: list[PolicyRuleConfig] | None = Field(default=None, max_length=50)


class PolicyVersionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str | None = Field(default=None, max_length=500)
    rules: list[PolicyRuleConfig] = Field(max_length=50)


class ApprovalLevelsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    levels: list[ApprovalLevelConfig] = Field(min_length=1, max_length=10)


class AppConfigRead(BaseModel):
    auto_approve_max_total_paise: int
    sample_audit_rate: float
    timezone: str
    imps_max_paise: int
    delegation_max_days: int


class AppConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    auto_approve_max_total_paise: int | None = Field(default=None, ge=0)
    sample_audit_rate: float | None = Field(default=None, ge=0, le=1)
    imps_max_paise: int | None = Field(default=None, ge=0)
    delegation_max_days: int | None = Field(default=None, ge=1, le=90)
