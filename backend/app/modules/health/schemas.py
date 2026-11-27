from typing import Literal

from pydantic import BaseModel

CheckStatus = Literal["ok", "fail"]


class LiveRead(BaseModel):
    status: Literal["ok"] = "ok"


class ReadyRead(BaseModel):
    status: Literal["ok"] = "ok"
    checks: dict[str, CheckStatus]


class VersionRead(BaseModel):
    version: str
    commit: str
