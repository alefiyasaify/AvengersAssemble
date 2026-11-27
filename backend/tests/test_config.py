"""Settings fail fast and parse the env var contract (docs/05, docs/08)."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from conftest import TEST_SECRET, make_settings


def test_settings_fail_fast_when_secret_key_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError, match="secret_key"):
        Settings(_env_file=None)


def test_settings_reject_short_secret_key_when_given() -> None:
    with pytest.raises(ValidationError, match="secret_key"):
        make_settings("sqlite://", secret_key="too-short")


def test_settings_split_cors_origins_when_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SECRET_KEY", TEST_SECRET)
    monkeypatch.setenv("CORS_ORIGINS", "http://a.test, http://b.test,")
    get_settings.cache_clear()
    try:
        assert get_settings().cors_origins == ["http://a.test", "http://b.test"]
    finally:
        get_settings.cache_clear()


def test_settings_reject_wildcard_cors_when_given() -> None:
    with pytest.raises(ValidationError, match="explicit allow-list"):
        make_settings("sqlite://", cors_origins="*")


def test_settings_production_flag_when_env_production() -> None:
    assert make_settings("sqlite://", app_env="production").is_production
    assert not make_settings("sqlite://").is_production
