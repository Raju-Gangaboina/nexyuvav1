"""
One-off CLI to create an admin (ADMIN role) user account.

There is deliberately no public /register/admin HTTP endpoint — letting
anyone hit an API route to mint themselves an admin account would defeat
the whole point of the organization-verification gate this account is
meant to review. Ministry/Admin accounts are provisioned out-of-band by
whoever controls the server, which for this project is this script.

Usage (from backend/, with the venv active):
    python create_admin.py admin@nexyuva.gov.in "SomeStrongPassword123"
"""
import asyncio
import sys
import uuid

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.models import User, UserRole
from app.core.security import hash_password


async def create_admin(email: str, password: str) -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none() is not None:
            print(f"A user with email '{email}' already exists — nothing created.")
            return

        user = User(
            id=uuid.uuid4(),
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.ADMIN,
        )
        db.add(user)
        await db.commit()
        print(f"Admin account created: {email}")
        print("Sign in at /login with the 'Ministry/Admin' tab using this email + password.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print('Usage: python create_admin.py <email> <password>')
        sys.exit(1)
    asyncio.run(create_admin(sys.argv[1], sys.argv[2]))
