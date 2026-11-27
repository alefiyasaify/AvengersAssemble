"""Pydantic request/response models: this IS the contract. No business logic here."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ExampleStatus = Literal["active", "archived"]


class ExampleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)


class ExampleUpdate(BaseModel):
    """PATCH body: all fields optional; `version` required for optimistic locking."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: ExampleStatus | None = None
    version: int = Field(ge=1)


class ExampleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: ExampleStatus
    version: int
    created_at: datetime
    updated_at: datetime
