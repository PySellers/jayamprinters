from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # staff stay signed in for 3 hours (client request); the sign-in page appears again after that.
    # (its own setting, so an older ACCESS_TOKEN_EXPIRE_MINUTES left in an .env file / environment cannot shorten it)
    SESSION_MINUTES: int = 180
    # Optional: lets the Purchases screen read a supplier's bill (photo / PDF). Set it as an environment variable.
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-sonnet-5-5"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
