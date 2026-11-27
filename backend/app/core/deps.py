"""Shared FastAPI dependencies. Inject these; never use globals."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import get_db
from app.core.pagination import PageParams, page_params


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DbSession = Annotated[Session, Depends(get_db, scope="function")]
PageDep = Annotated[PageParams, Depends(page_params)]
