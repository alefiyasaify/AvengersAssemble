"""Password hashing (Argon2id) and JWT helpers. Auth transport decision: ADR-0006.

Security-critical: 100% test coverage required (docs/05).
"""

import uuid
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from pydantic import BaseModel, ValidationError

from app.core.errors import UnauthenticatedError

TokenType = Literal["access", "refresh"]
JWT_ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 12

_hasher = PasswordHasher()  # argon2id with library defaults (OWASP-recommended parameters)


# ------------------------------------------------------------------ passwords
def hash_password(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        msg = f"password must be at least {MIN_PASSWORD_LENGTH} characters"
        raise ValueError(msg)
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time verification. Never raises for a wrong password or a malformed hash."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# ------------------------------------------------------------------ tokens
class TokenPayload(BaseModel):
    sub: str
    type: TokenType
    iat: int
    exp: int
    jti: str
    role: str | None = None


def create_token(
    subject: str,
    token_type: TokenType,
    *,
    secret: str,
    ttl: timedelta,
    now: datetime | None = None,
    extra: Mapping[str, str] | None = None,
) -> str:
    """Sign a JWT. `extra` adds non-sensitive claims (e.g. role); never secrets or PII."""
    issued = now or datetime.now(UTC)
    claims: dict[str, str | int] = {
        **(extra or {}),
        "sub": subject,
        "type": token_type,
        "iat": int(issued.timestamp()),
        "exp": int((issued + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, *, secret: str, expected_type: TokenType) -> TokenPayload:
    """Validate signature, expiry, required claims and token type.

    Raises UnauthenticatedError with a generic message on any failure (no oracle for attackers).
    """
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "type", "iat", "exp", "jti"]},
        )
        payload = TokenPayload.model_validate(claims)
    except (jwt.PyJWTError, ValidationError) as exc:
        raise UnauthenticatedError("Invalid or expired token.") from exc
    if payload.type != expected_type:
        raise UnauthenticatedError("Invalid or expired token.")
    return payload
