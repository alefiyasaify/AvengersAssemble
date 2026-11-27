from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import Role


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str


class CityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    tier: int


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str


class UserSummary(BaseModel):
    """Safe for any signed-in user (no email, no bank details)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    employee_code: str
    role: Role
    department_id: str


class UserRead(UserSummary):
    email: str
    manager_id: str | None
    home_city_id: str | None
    is_active: bool


class MeRead(UserRead):
    """`GET /me`: the UI shows or hides actions from `permissions`; the API still enforces."""

    has_reports: bool
    permissions: list[str]


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$")
    full_name: str = Field(min_length=1, max_length=120)
    employee_code: str = Field(min_length=1, max_length=16)
    role: Role
    department_id: str = Field(max_length=36)
    manager_id: str | None = Field(default=None, max_length=36)
    home_city_id: str | None = Field(default=None, max_length=36)
    password: str = Field(min_length=12, max_length=256)


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    department_id: str | None = Field(default=None, max_length=36)
    manager_id: str | None = Field(default=None, max_length=36)
    home_city_id: str | None = Field(default=None, max_length=36)
    is_active: bool | None = None
