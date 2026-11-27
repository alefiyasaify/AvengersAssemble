"""Security-critical helpers: 100% coverage required (docs/05)."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.errors import UnauthenticatedError
from app.core.security import (
    JWT_ALGORITHM,
    create_token,
    decode_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)

SECRET = "unit-test-signing-secret-0123456789abcdef"
PASSWORD = "correct horse battery staple"


def test_hash_password_uses_argon2id_when_valid() -> None:
    hashed = hash_password(PASSWORD)
    assert hashed.startswith("$argon2id$")
    assert PASSWORD not in hashed
    assert not password_needs_rehash(hashed)


def test_hash_password_rejects_short_password_when_under_minimum() -> None:
    with pytest.raises(ValueError, match="at least 12"):
        hash_password("short")


def test_verify_password_true_when_correct() -> None:
    assert verify_password(PASSWORD, hash_password(PASSWORD))


def test_verify_password_false_when_wrong() -> None:
    assert not verify_password("wrong password!!", hash_password(PASSWORD))


def test_verify_password_false_when_hash_malformed() -> None:
    assert not verify_password(PASSWORD, "not-a-hash")


def test_decode_token_returns_payload_when_valid() -> None:
    token = create_token("user-1", "access", secret=SECRET, ttl=timedelta(minutes=15))
    payload = decode_token(token, secret=SECRET, expected_type="access")
    assert payload.sub == "user-1"
    assert payload.type == "access"
    assert payload.exp - payload.iat == 15 * 60


def test_decode_token_rejects_when_expired() -> None:
    past = datetime.now(UTC) - timedelta(hours=1)
    token = create_token("user-1", "access", secret=SECRET, ttl=timedelta(minutes=15), now=past)
    with pytest.raises(UnauthenticatedError):
        decode_token(token, secret=SECRET, expected_type="access")


def test_decode_token_rejects_when_signed_with_other_secret() -> None:
    token = create_token(
        "user-1", "access", secret="another-secret-0123456789abcdefghij", ttl=timedelta(minutes=15)
    )
    with pytest.raises(UnauthenticatedError):
        decode_token(token, secret=SECRET, expected_type="access")


def test_decode_token_rejects_when_type_mismatched() -> None:
    token = create_token("user-1", "refresh", secret=SECRET, ttl=timedelta(days=1))
    with pytest.raises(UnauthenticatedError):
        decode_token(token, secret=SECRET, expected_type="access")


def test_decode_token_rejects_when_claims_missing() -> None:
    token = jwt.encode({"sub": "user-1"}, SECRET, algorithm=JWT_ALGORITHM)
    with pytest.raises(UnauthenticatedError):
        decode_token(token, secret=SECRET, expected_type="access")


def test_decode_token_rejects_when_claim_invalid() -> None:
    now = int(datetime.now(UTC).timestamp())
    claims = {"sub": "u", "type": "admin", "iat": now, "exp": now + 60, "jti": "x"}
    token = jwt.encode(claims, SECRET, algorithm=JWT_ALGORITHM)
    with pytest.raises(UnauthenticatedError):
        decode_token(token, secret=SECRET, expected_type="access")


def test_decode_token_rejects_when_alg_none() -> None:
    token = jwt.encode({"sub": "u"}, key=None, algorithm="none")
    with pytest.raises(UnauthenticatedError):
        decode_token(token, secret=SECRET, expected_type="access")
