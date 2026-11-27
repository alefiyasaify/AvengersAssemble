"""Application settings. The ONLY place that reads environment variables (12-factor)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

AppEnv = Literal["local", "test", "ci", "staging", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class DatabaseSettings(BaseSettings):
    """Settings needed to reach the database. Used on its own by Alembic (no secrets required)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"


class Settings(DatabaseSettings):
    """Full application settings. Missing or invalid required values fail fast at startup."""

    app_env: AppEnv = "local"
    secret_key: SecretStr = Field(min_length=32)
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    log_level: LogLevel = "INFO"
    access_token_ttl_min: int = Field(default=15, ge=1, le=60)
    refresh_token_ttl_hours: int = Field(default=8, ge=1, le=72)
    login_max_failures: int = Field(default=5, ge=1, le=20)
    login_lockout_minutes: int = Field(default=15, ge=1, le=1440)
    git_sha: str = "unknown"
    receipts_dir: str = "./data/receipts"
    max_receipt_bytes: int = Field(default=5 * 1024 * 1024, ge=1024, le=20 * 1024 * 1024)
    # Public self-registration (POST /auth/register). Accounts are created inactive as EMPLOYEE
    # and need finance-head activation; set false to allow only admin-created users.
    self_registration_enabled: bool = True
    # Shared password for seeded demo users (make seed). Only used by the seed command; never
    # needed in production. Leave unset outside local/demo environments.
    demo_password: SecretStr | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a comma-separated string (`a,b`) as well as a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard(cls, value: list[str]) -> list[str]:
        if "*" in value:
            msg = "CORS_ORIGINS must be an explicit allow-list; '*' is not allowed"
            raise ValueError(msg)
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    """Settings loaded once per process from the environment / `.env`."""
    return Settings()  # secret_key is read from the environment (required)
