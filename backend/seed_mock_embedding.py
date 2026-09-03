import asyncio
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.models import StudentProfile, User
from app.ai.embeddings import embed_text, build_student_profile_text

MOCK_EMAIL = "mock.passed.student@nexyuva.test"


async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == MOCK_EMAIL))
        user = res.scalar_one_or_none()
        if user is None:
            print("Mock user not found.")
            return
        res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
        profile = res.scalar_one()

        text = build_student_profile_text(
            full_name=profile.full_name,
            academic_background=profile.academic_background,
            skills=profile.skills or [],
        )
        vec = embed_text(text)
        if vec is None:
            print("Embedding service returned None -- falling back to zero vector.")
            vec = [0.0] * 384
        profile.profile_embedding = vec
        await db.commit()
        print(f"Set profile_embedding (dim={len(vec)}) for {profile.full_name}")


asyncio.run(main())
