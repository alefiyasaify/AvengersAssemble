"""Authentication (ADR-0006, ARD 8 and 11): password check, lockout, token issuing.

Failed sign-ins are returned as values (not raised) so the router can commit the audit event
for the failure: a raised error would roll it back with the request.
"""

import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import timedelta
from functools import cache

from app.core.config import Settings
from app.core.errors import (
    AppError,
    PermissionDeniedError,
    RateLimitedError,
    UnauthenticatedError,
)
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.modules.audit.service import AuditService
from app.modules.auth.schemas import RegisterRequest, RegisterResult
from app.modules.org.service import OrgService


@cache
def _dummy_hash() -> str:
    """A real Argon2 hash: an unknown email costs as much time as a wrong password."""
    return hash_password(secrets.token_urlsafe(32))


class LoginGuard:
    """Per-account lockout (N failures -> locked for M minutes) and a per-client rate limit.
    In-memory: valid because the API runs as a single instance (ADR-0003)."""

    def __init__(self, max_failures: int, lockout_seconds: float, per_client_per_minute: int = 30):
        self.max_failures = max_failures
        self.lockout_seconds = lockout_seconds
        self.per_client = per_client_per_minute
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._locked_until: dict[str, float] = {}
        self._client_hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, account: str, client: str, now: float | None = None) -> None:
        moment = time.monotonic() if now is None else now
        hits = self._client_hits[client]
        while hits and moment - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_client:
            raise RateLimitedError("Too many sign-in attempts. Try again in a minute.")
        hits.append(moment)
        if self._locked_until.get(account, 0) > moment:
            raise RateLimitedError(
                "This account is temporarily locked after repeated failed sign-ins.",
                code="ACCOUNT_LOCKED",
            )

    def failed(self, account: str, now: float | None = None) -> bool:
        """Record a failure; return True if the account is now locked."""
        moment = time.monotonic() if now is None else now
        window = self._failures[account]
        while window and moment - window[0] > self.lockout_seconds:
            window.popleft()
        window.append(moment)
        if len(window) >= self.max_failures:
            self._locked_until[account] = moment + self.lockout_seconds
            window.clear()
            return True
        return False

    def succeeded(self, account: str) -> None:
        self._failures.pop(account, None)
        self._locked_until.pop(account, None)


@dataclass(frozen=True)
class IssuedTokens:
    access: str
    refresh: str
    csrf: str
    access_max_age: int
    refresh_max_age: int


@dataclass(frozen=True)
class LoginResult:
    user_id: str | None
    tokens: IssuedTokens | None
    error: AppError | None


class AuthService:
    def __init__(
        self, org: OrgService, audit: AuditService, settings: Settings, guard: LoginGuard
    ) -> None:
        self._org = org
        self._audit = audit
        self._settings = settings
        self._guard = guard

    def login(self, email: str, password: str, client: str) -> LoginResult:
        account = email.strip().lower()
        self._guard.check(account, client)
        found = self._org.credentials(account)
        if found is None:
            verify_password(password, _dummy_hash())
            return self._fail(account, None)
        user_id, role, password_hash, is_active = found
        if not (verify_password(password, password_hash) and is_active):
            return self._fail(account, user_id)
        self._guard.succeeded(account)
        self._audit.record(
            actor_id=user_id, action="auth.login", entity_type="user", entity_id=user_id
        )
        return LoginResult(user_id, self._issue(user_id, role), None)

    def register(self, data: RegisterRequest, client: str) -> RegisterResult:
        """Public self-registration (inactive EMPLOYEE). Rate-limited per client like sign-in.
        The password is hashed even when the email is taken, so timing does not reveal it."""
        if not self._settings.self_registration_enabled:
            raise PermissionDeniedError(
                "Self-registration is turned off. Ask the finance team for an account.",
                code="REGISTRATION_DISABLED",
            )
        self._guard.check(f"register:{data.email.strip().lower()}", client)
        password_hash = hash_password(data.password)
        self._org.self_register(
            email=data.email,
            full_name=data.full_name,
            password_hash=password_hash,
            department_id=data.department_id,
            manager_id=data.manager_id,
            home_city_id=data.home_city_id,
        )
        return RegisterResult()

    def _fail(self, account: str, user_id: str | None) -> LoginResult:
        locked = self._guard.failed(account)
        # Never store the email or password; the user id is known only for existing accounts.
        self._audit.record(
            actor_id=None,
            action="auth.login_failed",
            entity_type="user",
            entity_id=user_id or "unknown",
            after={"locked": locked},
        )
        return LoginResult(
            None,
            None,
            UnauthenticatedError("Email or password is incorrect.", code="INVALID_CREDENTIALS"),
        )

    def refresh(self, refresh_token: str) -> tuple[str, IssuedTokens]:
        """Rotate tokens from a valid refresh token; the role is re-read from the database."""
        payload = decode_token(
            refresh_token,
            secret=self._settings.secret_key.get_secret_value(),
            expected_type="refresh",
        )
        person = self._org.person(payload.sub)
        if not person.is_active:
            raise UnauthenticatedError("Invalid or expired token.")
        return person.id, self._issue(person.id, person.role)

    def _issue(self, user_id: str, role: str) -> IssuedTokens:
        secret = self._settings.secret_key.get_secret_value()
        access_ttl = timedelta(minutes=self._settings.access_token_ttl_min)
        refresh_ttl = timedelta(hours=self._settings.refresh_token_ttl_hours)
        return IssuedTokens(
            access=create_token(
                user_id, "access", secret=secret, ttl=access_ttl, extra={"role": role}
            ),
            refresh=create_token(user_id, "refresh", secret=secret, ttl=refresh_ttl),
            csrf=secrets.token_urlsafe(32),
            access_max_age=int(access_ttl.total_seconds()),
            refresh_max_age=int(refresh_ttl.total_seconds()),
        )
