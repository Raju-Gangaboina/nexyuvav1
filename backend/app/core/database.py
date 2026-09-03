"""
Async DB engine + session dependency. One engine, one pool, shared across
every service module — this is what makes the modular monolith a monolith
at the data layer even though each service/ owns its own models/schemas.
"""
from collections.abc import AsyncGenerator
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


def _build_engine_args(raw_url: str) -> tuple[str, dict]:
    """
    Neon's dashboard hands out connection strings with `?sslmode=require&
    channel_binding=require` query params -- that's the libpq/psycopg2
    convention. The asyncpg driver (what `postgresql+asyncpg://` actually
    uses) does not accept `sslmode` or `channel_binding` as connect()
    kwargs at all -- passing them through raises `TypeError: connect() got
    an unexpected keyword argument 'sslmode'` at the first real connection
    attempt. Real bug hit while trying to actually connect to Postgres for
    the first time this session (every earlier phase entry logged "no real
    DB round-trip tested yet" -- this is why, once one was actually
    attempted). Fix: strip those two params from the URL and translate them
    into asyncpg's own `ssl` connect_arg instead, which achieves the same
    "encrypted connection required" behavior Neon needs.
    """
    parts = urlsplit(raw_url)
    query_pairs = parse_qsl(parts.query, keep_blank_values=True)
    ssl_required = any(
        k in ("sslmode", "channel_binding") and v in ("require", "true")
        for k, v in query_pairs
    )
    remaining = [(k, v) for k, v in query_pairs if k not in ("sslmode", "channel_binding")]
    clean_url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(remaining), parts.fragment))
    connect_args = {"ssl": "require"} if ssl_required else {}
    return clean_url, connect_args


_clean_db_url, _connect_args = _build_engine_args(settings.DATABASE_URL)

engine = create_async_engine(
    _clean_db_url, echo=settings.DEBUG, pool_pre_ping=True, connect_args=_connect_args
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
