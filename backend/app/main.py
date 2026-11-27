"""Application factory. Run with: uvicorn --factory app.main:create_app"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.core.config import Settings, get_settings
from app.core.db import create_db_engine, create_session_factory
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware
from app.modules.approvals.router import router as approvals_router
from app.modules.auth.router import router as auth_router
from app.modules.claims.router import router as claims_router
from app.modules.health.router import router as health_router
from app.modules.org.router import router as org_router
from app.modules.payouts.router import router as payouts_router
from app.modules.policy.router import router as policy_router
from app.modules.receipts.router import router as receipts_router
from app.modules.reports.router import router as reports_router

API_PREFIX = "/api/v1"

# Register every module router here (modules/_template is intentionally absent).
MODULE_ROUTERS: tuple[APIRouter, ...] = (
    health_router,
    auth_router,
    org_router,
    policy_router,
    receipts_router,
    claims_router,
    approvals_router,
    payouts_router,
    reports_router,
)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    engine = create_db_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(
        title="Backend API",
        version=__version__,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    register_exception_handlers(app)

    # Middleware order: last added runs first. RequestContext must be outermost.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=[
            "Authorization",
            "X-CSRF-Token",
            "Content-Type",
            "If-Match",
            "Idempotency-Key",
            REQUEST_ID_HEADER,
        ],
        expose_headers=[REQUEST_ID_HEADER, "ETag", "Location"],
    )
    app.add_middleware(RequestContextMiddleware)

    api = APIRouter(prefix=API_PREFIX)
    for router in MODULE_ROUTERS:
        api.include_router(router)
    app.include_router(api)
    return app
