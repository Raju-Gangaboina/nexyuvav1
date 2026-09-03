"""
One-off data migration: copies every row from the old Neon project (Ohio)
to the new Neon project (Singapore) in FK-safe order.

Run this AFTER `alembic upgrade head` has already created the schema on
the new (Singapore) database.
"""
import asyncio
import asyncpg

OLD_DB_URL = "postgresql://neondb_owner:npg_Gnq5QzK1wBgf@ep-square-fog-axinfhfd-pooler.c-4.us-east-2.aws.neon.tech/neondb?ssl=require"
NEW_DB_URL = "postgresql://neondb_owner:npg_qoFfV0kjiAP7@ep-cold-forest-az9dn7vz-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?ssl=require"

# Order matters: parents before children (matches models.py FK graph)
TABLES_IN_ORDER = [
    "users",
    "organizations",
    "student_profiles",
    "internships",
    "applications",
    "assessment_attempts",
    "badges",
    "interview_attempts",
    "feedback",
]


async def copy_table(old: asyncpg.Connection, new: asyncpg.Connection, table: str):
    rows = await old.fetch(f'SELECT * FROM "{table}"')
    if not rows:
        print(f"{table}: 0 rows, skipping")
        return

    columns = list(rows[0].keys())
    col_list = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(f"${i+1}" for i in range(len(columns)))
    insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

    values = [tuple(r[c] for c in columns) for r in rows]
    await new.executemany(insert_sql, values)
    print(f"{table}: copied {len(rows)} rows")


async def main():
    old = await asyncpg.connect(OLD_DB_URL)
    new = await asyncpg.connect(NEW_DB_URL)
    try:
        for table in TABLES_IN_ORDER:
            await copy_table(old, new, table)
    finally:
        await old.close()
        await new.close()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
