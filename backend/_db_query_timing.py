import asyncio, time
from app.core.database import AsyncSessionLocal
from app.core.models import Internship, StudentProfile, Organization
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        s = time.perf_counter()
        r = await db.execute(select(StudentProfile))
        rows = r.scalars().all()
        print(f"select StudentProfile (all): {(time.perf_counter()-s)*1000:.0f} ms, rows={len(rows)}")

        s = time.perf_counter()
        r = await db.execute(select(Internship).where(Internship.is_active.is_(True)))
        rows = r.scalars().all()
        print(f"select Internship (active): {(time.perf_counter()-s)*1000:.0f} ms, rows={len(rows)}")

        s = time.perf_counter()
        r = await db.execute(select(Organization))
        rows = r.scalars().all()
        print(f"select Organization (all): {(time.perf_counter()-s)*1000:.0f} ms, rows={len(rows)}")

        # repeat once more warm
        s = time.perf_counter()
        r = await db.execute(select(StudentProfile))
        rows = r.scalars().all()
        print(f"select StudentProfile again (warm): {(time.perf_counter()-s)*1000:.0f} ms, rows={len(rows)}")

asyncio.run(main())
