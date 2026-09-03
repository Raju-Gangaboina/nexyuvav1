"""
Event Bus (Architecture.md §2). Real pub/sub via Redis Streams — works
against Upstash Redis in production or any Redis-protocol-compatible
instance locally. Uses XADD/XREAD, not a fake in-process queue.

Graceful degradation per Rules.md §3: if Redis is unreachable, publish()
logs a warning and returns False rather than crashing the calling request —
the event is lost in that case, which is an acceptable degradation for a
contest-scale demo (not acceptable at real production scale, noted here so
it isn't forgotten: a production deployment should alert on repeated publish
failures, not just log them silently).
"""
import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("nexyuva.event_bus")

_redis_client: aioredis.Redis | None = None


def _get_redis_url() -> str | None:
    """Prefers UPSTASH_REDIS_URL (production); falls back to a local
    redis:// URL for dev/sandbox testing when Upstash isn't configured."""
    if settings.UPSTASH_REDIS_URL:
        return settings.UPSTASH_REDIS_URL
    return "redis://localhost:6379"


async def get_redis_client() -> aioredis.Redis | None:
    """Public accessor so other modules (e.g. github_agent's H2 caching fix)
    can share this same Redis connection/config instead of each opening
    their own."""
    return await _get_client()


async def _get_client() -> aioredis.Redis | None:
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                _get_redis_url(), decode_responses=True, socket_timeout=10.0
            )
            await _redis_client.ping()
        except Exception:
            logger.exception("Could not connect to Redis event bus")
            _redis_client = None
    return _redis_client


async def publish(event_type: str, payload: dict) -> bool:
    """
    event_type examples: 'resume.uploaded', 'profile.updated',
    'recommendation.refreshed', 'notification.requested'
    Returns True if published, False if the bus is unavailable (caller
    should treat this as non-fatal — see module docstring).
    """
    client = await _get_client()
    if client is None:
        return False

    envelope = {
        "event_type": event_type,
        "payload": json.dumps(payload),
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await client.xadd(f"nexyuva:{event_type}", envelope)
        return True
    except Exception:
        logger.exception("Failed to publish event %s", event_type)
        return False


async def read_new_events(event_type: str, last_id: str = "$", count: int = 10, block_ms: int = 5000):
    """
    Blocking read for a consumer loop. last_id='$' means "only events after
    now" (used for the live consumer); pass '0' to replay from the start of
    the stream (useful for a one-off backfill or for testing).
    """
    client = await _get_client()
    if client is None:
        return []

    stream_key = f"nexyuva:{event_type}"
    try:
        result = await client.xread({stream_key: last_id}, count=count, block=block_ms)
        if not result:
            return []
        _, messages = result[0]
        return [
            {"id": msg_id, "payload": json.loads(fields["payload"]), "published_at": fields["published_at"]}
            for msg_id, fields in messages
        ]
    except Exception:
        logger.exception("Failed to read events for %s", event_type)
        return []
