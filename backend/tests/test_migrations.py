"""Migrations upgrade from empty, downgrade, and keep a single head (docs/03, docs/09)."""

from pathlib import Path

from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

from conftest import alembic_config


def test_alembic_has_single_head_always(database_url: str) -> None:
    script = ScriptDirectory.from_config(alembic_config(database_url))
    assert len(script.get_heads()) == 1


def test_migrations_upgrade_downgrade_roundtrip_when_db_empty(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'roundtrip.db').as_posix()}"
    cfg = alembic_config(url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")

    engine = create_engine(url)
    try:
        assert "alembic_version" in inspect(engine).get_table_names()
    finally:
        engine.dispose()
