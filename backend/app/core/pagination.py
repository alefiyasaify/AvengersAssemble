"""Cursor pagination (ARD section 8): `?limit=1..100 (default 50)&cursor=<opaque>` and
`{"items": [...], "next_cursor": str | null, "total_estimate": int}`.

The cursor is an opaque, signed-free token encoding a position; clients must not parse it.
"""

import base64
import binascii
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel, ConfigDict

from app.core.errors import ValidationFailed

MAX_LIMIT = 100
DEFAULT_LIMIT = 50


class PageParams(BaseModel):
    model_config = ConfigDict(frozen=True)

    limit: int = DEFAULT_LIMIT
    offset: int = 0


def encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(f"o:{offset}".encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> int:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        prefix, _, value = base64.urlsafe_b64decode(padded).decode().partition(":")
        offset = int(value)
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValidationFailed("The cursor is invalid.", code="INVALID_CURSOR") from exc
    if prefix != "o" or offset < 0:
        raise ValidationFailed("The cursor is invalid.", code="INVALID_CURSOR")
    return offset


def page_params(
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    cursor: Annotated[str | None, Query(max_length=64)] = None,
) -> PageParams:
    return PageParams(limit=limit, offset=decode_cursor(cursor) if cursor else 0)


class Page[T](BaseModel):
    """List response envelope."""

    items: list[T]
    next_cursor: str | None
    total_estimate: int

    @classmethod
    def of(cls, items: list[T], total: int, params: PageParams) -> "Page[T]":
        end = params.offset + len(items)
        return cls(
            items=items,
            next_cursor=encode_cursor(end) if end < total else None,
            total_estimate=total,
        )
