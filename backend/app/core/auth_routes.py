"""
Registration + login. Every route returns structured JSON errors
({"detail": "..."}) with correct status codes, per Rules.md §3 — FastAPI's
HTTPException already gives us this shape for free, so no custom exception
handler is strictly needed here, but we add one in main.py to catch anything
unhandled and stop raw tracebacks reaching the frontend.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.models import Organization, StudentProfile, User, UserRole
from app.core.security import (
    create_access_token,
    generate_reset_token,
    hash_password,
    verify_password,
)
from datetime import datetime, timezone

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class RegisterStudentRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class RegisterOrganizationRequest(BaseModel):
    email: EmailStr
    password: str
    organization_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


async def _email_taken(db: AsyncSession, email: str) -> bool:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none() is not None


@router.post("/register/student", response_model=TokenResponse, status_code=201)
async def register_student(payload: RegisterStudentRequest, db: AsyncSession = Depends(get_db)):
    if await _email_taken(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.STUDENT,
    )
    db.add(user)
    await db.flush()  # get user.id before creating dependent row

    profile = StudentProfile(user_id=user.id, full_name=payload.full_name)
    db.add(profile)
    await db.commit()

    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, role=user.role.value)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Always return the same generic response, even if the email doesn't
    # exist, to avoid leaking which emails are registered.
    if user is not None:
        token, expiry = generate_reset_token()
        user.reset_token = token
        user.reset_token_expires = expiry
        await db.commit()
        if settings.ENV == "development":
            return {"message": "If that email exists, a reset link was sent.", "dev_reset_token": token}

    return {"message": "If that email exists, a reset link was sent."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.reset_token == payload.token))
    user = result.scalar_one_or_none()

    if user is None or user.reset_token_expires is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires = user.reset_token_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Match login()'s check — a deactivated account shouldn't be able to
    # refresh its own credentials via a reset token either, for consistency
    # with the intent behind deactivation.
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()

    return {"message": "Password has been reset successfully."}


@router.post("/register/organization", response_model=TokenResponse, status_code=201)
async def register_organization(
    payload: RegisterOrganizationRequest, db: AsyncSession = Depends(get_db)
):
    if await _email_taken(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=UserRole.ORGANIZATION,
    )
    db.add(user)
    await db.flush()

    # Deliberately NOT auto-verified anymore (previously
    # `is_verified=settings.ENV == "development"`). A fresh org now always
    # starts UNSUBMITTED/unverified — real access requires uploading a
    # verification document (POST /organizations/verification-document)
    # and an admin approving it (POST /admin/organizations/{id}/verify).
    # This was a deliberate dev-only shortcut before; it's removed because
    # it silently bypassed the exact verification flow this endpoint is
    # supposed to gate, which made the flow untestable in dev.
    org = Organization(user_id=user.id, name=payload.organization_name)
    db.add(org)
    await db.commit()

    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, role=user.role.value)


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, role=user.role.value)
