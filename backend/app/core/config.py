"""
Central configuration. All values come from environment variables — never
hardcode secrets. Copy .env.example to .env locally and fill in real values.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "NexYuva"
    ENV: str = "development"
    DEBUG: bool = True
    # Base URL of the deployed frontend-web app. Used only to redirect the
    # browser back into the app after a full-page OAuth round trip (Google
    # Calendar consent) where a JSON response would otherwise strand the
    # user on a blank API page.
    FRONTEND_URL: str = "http://localhost:3000"

    # Database (Neon Postgres, pgvector extension enabled)
    DATABASE_URL: str  # e.g. postgresql+asyncpg://user:pass@host/dbname

    # Auth
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h

    # External services (all optional at boot — AI module degrades gracefully
    # per Rules.md §3 if any of these are missing)
    GITHUB_TOKEN: str | None = None
    LINKEDIN_CLIENT_ID: str | None = None
    LINKEDIN_CLIENT_SECRET: str | None = None
    LINKEDIN_REDIRECT_URI: str | None = None
    GROQ_API_KEY: str | None = None
    # Groq decommissioned llama-3.1-8b-instant on 2026-08-16.
    # openai/gpt-oss-20b is Groq's recommended replacement (confirmed via
    # console.groq.com/docs/model/openai/gpt-oss-20b). Centralized here so a
    # future Groq model rotation is a one-line change instead of a grep.
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    GEMINI_API_KEY: str | None = None
    UPSTASH_REDIS_URL: str | None = None
    UPSTASH_REDIS_TOKEN: str | None = None

    # Smart Scheduling (Module 5.5) — Google Calendar OAuth. Optional at
    # boot like every other external service here (Rules.md §3): the
    # scheduling routes return a 503 with a clear message if these are
    # unset, rather than the app failing to start.
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: str | None = None
    GOOGLE_OAUTH_REDIRECT_URI: str | None = None
    # Symmetric key (Fernet, 32 url-safe base64 bytes) used to encrypt
    # stored Google refresh tokens at rest — generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    TOKEN_ENCRYPTION_KEY: str | None = None

    # Email (notification service, Phase 6) — e.g. a Gmail app password,
    # SendGrid SMTP relay, or Mailtrap for sandboxed testing
    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None

    # Email notifications (optional — degrades gracefully if unset, Rules.md §3)
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str | None = None

    # Embeddings
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"  # 384-dim, matches pgvector column


settings = Settings()
