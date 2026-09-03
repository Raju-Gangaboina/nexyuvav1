import asyncio, sys, os
sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with AsyncSession(engine) as session:
        res = await session.execute(text("SELECT id, name FROM organizations"))
        for r in res.all():
            print(r)
    await engine.dispose()

asyncio.run(main())
