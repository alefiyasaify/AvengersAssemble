"""Domain exceptions and the standard error envelope (docs/02, ARD section 8).

Codes are UPPER_SNAKE and stable; `details` is an object (validation puts field issues under
`details.fields`). Validation is HTTP 400; another user's data is 404, never 403.
"""

import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ envelope schemas (contract)
class ErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: dict[str, Any] = {}
    request_id: str | None = None


class ErrorResponse(BaseModel):
    """Body of every non-2xx response."""

    model_config = ConfigDict(extra="forbid")

    error: ErrorBody


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI `responses=` entries documenting the error envelope for the given statuses."""
    return {
        code: {"model": ErrorResponse, "description": HTTPStatus(code).phrase}
        for code in status_codes
    }


# ------------------------------------------------------------------ domain exceptions
class AppError(Exception):
    """Base class for expected, client-facing errors."""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(
        self, message: str, *, code: str | None = None, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        self.details = details or {}


class ValidationFailed(AppError):  # 400 per the ARD
    status_code = 400
    code = "VALIDATION_FAILED"


class UnauthenticatedError(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "FORBIDDEN"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"


# ------------------------------------------------------------------ rendering
def request_id_of(request: Request) -> str | None:
    value = getattr(request.state, "request_id", None)
    return value if isinstance(value, str) else None


def error_json(
    status_code: int,
    code: str,
    message: str,
    request_id: str | None,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(code=code, message=message, details=details or {}, request_id=request_id)
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


_HTTP_CODES: dict[int, str] = {
    400: "VALIDATION_FAILED",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
}


async def _app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)  # noqa: S101 - registered for AppError only
    return error_json(exc.status_code, exc.code, exc.message, request_id_of(request), exc.details)


async def _validation_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    fields = [
        {
            "field": ".".join(str(part) for part in err.get("loc", ()) if part != "body") or None,
            "issue": str(err.get("msg", "invalid value")),
        }
        for err in exc.errors()
    ]
    return error_json(
        400,
        "VALIDATION_FAILED",
        "The request is invalid.",
        request_id_of(request),
        {"fields": fields},
    )


async def _http_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
    message = HTTPStatus(exc.status_code).phrase if exc.status_code >= 500 else str(exc.detail)
    response = error_json(exc.status_code, code, message, request_id_of(request))
    if exc.headers:
        response.headers.update(exc.headers)
    return response


def register_exception_handlers(app: FastAPI) -> None:
    """Map known exceptions to the envelope. Unexpected errors are handled (500, generic message,
    details only in logs) by `RequestContextMiddleware` so the response still carries the
    request id."""
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
