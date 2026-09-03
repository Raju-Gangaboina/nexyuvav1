"""
Symmetric encryption for secrets we must store at rest — currently just
Google Calendar OAuth refresh tokens (Smart Scheduling, Module 5.5). Uses
Fernet (AES-128-CBC + HMAC) from the `cryptography` package, which is
already a transitive dependency of python-jose[cryptography] so this adds
no new dependency.

Deliberately lazy: TOKEN_ENCRYPTION_KEY is optional at boot like every
other external-service credential in this codebase (Rules.md §3) — the app
still starts with it unset, and only the Smart Scheduling routes that
actually need it raise a clear 503 at call time.
"""
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from app.core.config import settings


def _get_fernet() -> Fernet:
    if not settings.TOKEN_ENCRYPTION_KEY:
        raise HTTPException(
            status_code=503,
            detail="Smart Scheduling is not configured on this server yet (missing TOKEN_ENCRYPTION_KEY).",
        )
    try:
        return Fernet(settings.TOKEN_ENCRYPTION_KEY.encode())
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="TOKEN_ENCRYPTION_KEY is misconfigured (must be a 32-byte urlsafe-base64 Fernet key).",
        ) from exc


def encrypt_token(raw_token: str) -> str:
    return _get_fernet().encrypt(raw_token.encode()).decode()


def decrypt_token(encrypted_token: str) -> str:
    try:
        return _get_fernet().decrypt(encrypted_token.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(
            status_code=500,
            detail="Stored calendar token could not be decrypted — the org will need to reconnect Google Calendar.",
        ) from exc
