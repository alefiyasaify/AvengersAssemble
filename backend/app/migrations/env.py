"""Alembic environment: app metadata, batch mode for SQLite, same engine/PRAGMAs as the app."""

import importlib
import pkgutil
from logging.config import fileConfig

from alembic import context

import app.modules
from app.core.config import DatabaseSettings
from app.core.db import Base, create_db_engine

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def _import_all_models() -> None:
    """Import every live module's `models` so autogenerate sees all tables.
    Packages starting with `_` (the template) are skipped."""
    for info in pkgutil.iter_modules(app.modules.__path__):
        if info.ispkg and not info.name.startswith("_"):
            try:
                importlib.import_module(f"app.modules.{info.name}.models")
            except ModuleNotFoundError as exc:
                if exc.name != f"app.modules.{info.name}.models":
                    raise


_import_all_models()
target_metadata = Base.metadata


def _database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or DatabaseSettings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        compare_type=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_db_engine(_database_url())
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
