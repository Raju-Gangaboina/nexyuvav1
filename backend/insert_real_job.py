import asyncio, sys, os, uuid
sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    new_id = uuid.uuid4()
    async with AsyncSession(engine) as session:
        await session.execute(text("""
            INSERT INTO internships
                (id, organization_id, title, domain, required_skills, description,
                 duration_weeks, stipend, location, work_mode, is_active, created_at)
            VALUES
                (:id, :org_id, :title, :domain, :skills, :description,
                 :weeks, :stipend, :location, :mode, true, now())
        """), {
            "id": new_id,
            "org_id": "82486382-81eb-4fe5-bbfd-416aaeadf1e9",
            "title": "python developer",
            "domain": "Information Technology",
            "skills": ["Python", "TypeScript", "JavaScript", "Machine Learning", "Deep Learning", "Django", "Flask", "FastAPI"],
            "description": "u need work so hard",
            "weeks": 13,
            "stipend": 9000,
            "location": "hyderabad",
            "mode": "hybrid",
        })
        await session.commit()
        print("inserted internship id:", new_id)
    await engine.dispose()

asyncio.run(main())
