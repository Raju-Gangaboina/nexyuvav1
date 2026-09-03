# NexYuva Backend — How to Run It

Every step below was actually executed and verified in a real environment
while building this (real Postgres, real migration, real HTTP requests) —
not just written and assumed to work.

## 1. Prerequisites
- Python 3.12
- A Postgres 15+ database with the `pgvector` extension available
  (Neon supports this natively — see step 3)

## 2. Install dependencies
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Download the spaCy English model (needed for resume skill extraction)
pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl
```

## 3. Set up your database
1. Create a free Neon Postgres project at neon.tech (or use any Postgres 15+)
2. In Neon's SQL editor (or via `psql`), run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy your connection string — it looks like:
   `postgresql://user:pass@host/dbname`

## 4. Configure environment variables
Create `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://user:pass@host/dbname
JWT_SECRET_KEY=<generate a real random secret — do NOT reuse this example>
ENV=development
DEBUG=true
```
Generate a real secret with: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`

**Important:** the URL needs `+asyncpg` for the app to run, but Alembic
migrations use a separate sync connection (`psycopg2`) — this is handled
automatically in `alembic/env.py`, you don't need two different URLs.

## 5. Run the database migration
```bash
cd backend
alembic upgrade head
```
This creates all 5 tables (users, student_profiles, organizations,
internships, plus alembic's own version-tracking table).

## 6. Start the server
```bash
uvicorn app.main:app --reload --port 8000
```
Visit `http://localhost:8000/docs` for interactive API docs (Swagger UI) —
every route can be tried directly from there.

Check it's alive: `curl http://localhost:8000/health` should return
`{"status":"ok","app":"NexYuva"}`

## 7. Try the real flow
```bash
# Register a student
curl -X POST http://localhost:8000/api/v1/auth/register/student \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword","full_name":"Your Name"}'

# Copy the access_token from the response, then:
curl http://localhost:8000/api/v1/students/me \
  -H "Authorization: Bearer <paste_token_here>"
```

## Known first-run behavior
- The **first** call that touches embeddings (posting an internship, or
  updating a student profile with skills) will download the
  `all-MiniLM-L6-v2` model from Hugging Face — this needs real internet
  access and takes a few seconds the first time, then it's cached locally.
  If it fails (no internet), the request still succeeds — the embedding is
  just left null and logged as a warning, by design (see Rules.md §3).
- There's no admin self-registration endpoint yet (deliberate — a ministry
  contest demo has one admin, not open admin signup). Create one directly:
  ```bash
  python3 -c "
  import sys; sys.path.insert(0, '.')
  import asyncio, uuid
  from app.core.database import AsyncSessionLocal
  from app.core.models import User, UserRole
  from app.core.security import hash_password

  async def main():
      async with AsyncSessionLocal() as db:
          admin = User(id=uuid.uuid4(), email='admin@nexyuva.gov',
                       hashed_password=hash_password('changeme'), role=UserRole.ADMIN)
          db.add(admin)
          await db.commit()
          print('Admin created:', admin.email)

  asyncio.run(main())
  "
  ```
  Then log in via `/api/v1/auth/login` like any other user.

## Running tests
```bash
cd backend
pytest
```
(Test suite is still thin — smoke tests only, per Rules.md's "minimum smoke
tests, not full coverage given the timeline.")
