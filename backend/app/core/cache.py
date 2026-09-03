"""
Lightweight cache helper on top of the same Redis instance as event_bus.py
(Upstash in production, local redis:// in dev). Used to avoid re-fetching
data that barely changes between requests (e.g. the full internships list)
on every single API call.

Degrades gracefully: if Redis is unreachable, get_json() returns None and
set_json() is a no-op, so callers always fall back to hitting the DB
directly — caching is a speed optimization, never a hard dependency.
"""
import json
import logging

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("nexyuva.cache")

_redis_client: aioredis.Redis | None = None
_connection_failed = False  # avoid retrying a dead connection on every request


def _get_redis_url() -> str:
    if settings.UPSTASH_REDIS_URL:
        return settings.UPSTASH_REDIS_URL
    return "redis://localhost:6379"


async def _get_client() -> aioredis.Redis | None:
    global _redis_client, _connection_failed
    if _connection_failed:
        return None
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                _get_redis_url(), decode_responses=True, socket_timeout=3.0
            )
            await _redis_client.ping()
        except Exception:
            logger.exception("Could not connect to Redis cache")
            _redis_client = None
            _connection_failed = True
    return _redis_client


async def get_json(key: str):
    client = await _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception:
        logger.exception("Cache get failed for key %s", key)
        return None


async def set_json(key: str, value, ttl_seconds: int = 45) -> bool:
    client = await _get_client()
    if client is None:
        return False
    try:
        await client.set(key, json.dumps(value), ex=ttl_seconds)
        return True
    except Exception:
        logger.exception("Cache set failed for key %s", key)
        return False


async def delete(key: str) -> bool:
    client = await _get_client()
    if client is None:
        return False
    try:
        await client.delete(key)
        return True
    except Exception:
        logger.exception("Cache delete failed for key %s", key)
        return False
