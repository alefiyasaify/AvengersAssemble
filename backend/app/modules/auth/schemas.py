from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class RegisterRequest(BaseModel):
    """Self-registration. There is deliberately no `role` field: every self-registered account
    is an EMPLOYEE, and it stays inactive until the finance head activates it."""

    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=256)
    department_id: str = Field(max_length=36)
    manager_id: str | None = Field(default=None, max_length=36)
    home_city_id: str | None = Field(default=None, max_length=36)


class RegisterResult(BaseModel):
    """The same answer whether or not the email was already registered (no enumeration)."""

    status: Literal["PENDING_APPROVAL"] = "PENDING_APPROVAL"
    message: str = (
        "If this email can be registered, the account was created and is waiting for the "
        "finance team to activate it."
    )
