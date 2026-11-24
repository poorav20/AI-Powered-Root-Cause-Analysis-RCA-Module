from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional
import logging

logger = logging.getLogger(__name__)

_INSECURE_SECRET = "your-secret-key-change-in-production"


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/rca_db"
    # Connection pool tuning (tune via env vars for production)
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # Groq API
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    # OpenAI API (optional - enables OpenAI models for form filling)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Anthropic API (optional - enables Claude models for form filling)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-haiku-20240307"

    # LLM provider selection: groq, openai, anthropic, or auto (tries all available in order)
    LLM_PROVIDER: str = "auto"
    # Fallback chain when primary provider fails (comma-separated: provider:model)
    LLM_FALLBACKS: str = "groq:openai/gpt-oss-120b,openai:gpt-4o-mini,anthropic:claude-3-haiku-20240307"

    # App
    APP_NAME: str = "AI-Powered RCA Module"
    DEBUG: bool = True
    SECRET_KEY: str = _INSECURE_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    BACKEND_CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:5173"]

    # File upload
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_DIR: str = "uploads"

    # Redis (for Celery)
    REDIS_URL: str = "redis://localhost:6379/0"

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_set_in_production(cls, v: str, info) -> str:
        """Raise at startup if the insecure placeholder key is used outside DEBUG mode."""
        debug = info.data.get("DEBUG", True)
        if not debug and v == _INSECURE_SECRET:
            raise ValueError(
                "SECRET_KEY must be changed from the default placeholder value "
                "before running in production (DEBUG=False)."
            )
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Configure root logging once; all modules inherit the handler
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
