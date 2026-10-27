"""
Shared Groq API client (bug-audit item #8).

Architecture.md calls for a shared Groq wrapper so the 7 AI agents don't
each roll their own httpx client, retry loop, and duplicated
GROQ_API_URL/GROQ_MODEL constants -- flagged as low-priority ("worth doing
once 3+ agents exist") until now, when all 7 exist and this exact
boilerplate was duplicated near-verbatim across interview_ai.py (the most
hardened copy, with 429 retry-with-backoff and empty-content detection),
aptitude_engine.py (already imported interview_ai's version rather than
having its own), ats_analyzer.py, chatbot.py, screening_agent.py,
sourcing_pitch.py, luckship_explain.py, voice_screen.py, and
assisted_interview_ai.py.

This module centralizes exactly the mechanics that were byte-for-byte (or
near-byte-for-byte) identical across those files: the endpoint URLs, the
model constant, the request headers, the 429 rate-limit retry-with-backoff
loop, empty-content detection, JSON-fence extraction, and Whisper
transcription. It deliberately does NOT force every agent's higher-level
retry/fallback *strategy* into one shape -- screening_agent's "retry once
with a corrective follow-up message when the model returns invalid JSON"
is a different kind of retry (conversation-repair, not rate-limit backoff)
than this module's post_chat_completion loop, so screening_agent still
owns that loop itself, just calling post_chat_completion for the actual
wire-level request instead of building its own httpx.AsyncClient. Each
agent still owns its prompt, its parsing, and its fallback decision -- it
no longer owns the Groq HTTP mechanics.
"""
import asyncio
import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger("nexyuva.groq_client")

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = settings.GROQ_MODEL  # centralized in app/core/config.py; llama-3.1-8b-instant was decommissioned 2026-08-16
GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"  # Groq's fast, cheap Whisper variant

# Groq's free/on-demand tier enforces a tokens-per-minute budget (confirmed
# live: 6000 TPM measured on the previous model, llama-3.1-8b-instant,
# before its 2026-08-16 decommission -- re-verify this figure for
# GROQ_MODEL) that a handful of calls in quick succession can genuinely
# exhaust -- this is not a broken integration, it's an expected 429 under
# normal multi-student use. Bounded (3 retries, short waits) so a
# persistently-down Groq still fails fast rather than hanging the request.
MAX_RATE_LIMIT_RETRIES = 3

# GROQ_MODEL is a reasoning model: it spends part of max_tokens on a hidden
# chain-of-thought before writing the actual answer, and defaults to
# reasoning_effort="medium" if unset. Diagnosed live 2026-09-03: at "medium"
# the reasoning alone regularly ate the whole max_tokens budget on
# extraction/grading-shaped prompts, returning a 200 with an EMPTY content
# field. "low" cuts reasoning token usage sharply for these straightforward
# tasks. Kept as the shared default; a caller can pass reasoning_effort=None
# to omit the field entirely (screening_agent's original call never set it).
DEFAULT_REASONING_EFFORT = "low"


async def post_chat_completion(
    messages: list[dict],
    max_tokens: int = 500,
    temperature: float = 0.3,
    reasoning_effort: str | None = DEFAULT_REASONING_EFFORT,
    response_format: dict | None = None,
    timeout: float = 25.0,
) -> dict | None:
    """Raw Groq chat-completions call with the 429 retry-with-backoff loop
    every agent previously copy-pasted (or, for screening_agent/
    sourcing_pitch/etc., simply didn't have). Returns the parsed response
    JSON dict on success, or None if GROQ_API_KEY is unset, retries are
    exhausted, or the call otherwise fails -- this function never raises;
    callers decide what "no result" means for their own fallback path.
    response_format is passed through unchanged when given (e.g.
    {"type": "json_object"}, used by ats_analyzer's structured-output call)."""
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured")
        return None

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if reasoning_effort:
        payload["reasoning_effort"] = reasoning_effort
    if response_format:
        payload["response_format"] = response_format

    for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    GROQ_CHAT_URL,
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                    json=payload,
                    timeout=timeout,
                )
                if resp.status_code == 429 and attempt < MAX_RATE_LIMIT_RETRIES:
                    # Groq's error body includes its own suggested wait time
                    # (e.g. "Please try again in 1.3s") -- prefer that over a
                    # fixed guess, falling back to a short default if it's
                    # ever missing/unparseable.
                    wait_seconds = 2.0
                    try:
                        detail = resp.json().get("error", {}).get("message", "")
                        match = re.search(r"try again in ([\d.]+)s", detail)
                        if match:
                            wait_seconds = min(float(match.group(1)) + 0.2, 8.0)
                    except Exception:
                        pass
                    logger.warning(
                        "Groq rate-limited (attempt %d/%d) -- retrying in %.1fs",
                        attempt + 1, MAX_RATE_LIMIT_RETRIES, wait_seconds,
                    )
                    await asyncio.sleep(wait_seconds)
                    continue
                resp.raise_for_status()
                return resp.json()
        except Exception:
            logger.exception("Groq call failed")
            return None
    return None


async def groq_chat(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 500,
    temperature: float = 0.3,
    reasoning_effort: str | None = DEFAULT_REASONING_EFFORT,
    timeout: float = 25.0,
) -> str | None:
    """High-level convenience for the common single system+user turn case
    (interview_ai, aptitude_engine, ats_analyzer, chatbot, sourcing_pitch,
    luckship_explain all just want the message content string back).
    Returns None -- same as post_chat_completion -- on any failure, or if
    the model returned a 200 with empty content (a reasoning model can
    spend its whole max_tokens budget on hidden chain-of-thought and write
    nothing; every caller should treat that identically to "no result"
    rather than each re-implementing this check, or worse, silently
    JSON-parsing an empty string)."""
    data = await post_chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        reasoning_effort=reasoning_effort,
        timeout=timeout,
    )
    if data is None:
        return None
    content = data["choices"][0]["message"]["content"]
    if not content:
        logger.warning("Groq returned empty content (reasoning likely exhausted max_tokens)")
        return None
    return content


async def groq_transcribe(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    response_format: str = "json",
    extra_data: dict | None = None,
    timeout: float = 30.0,
) -> str | None:
    """Shared Whisper transcription call -- previously duplicated between
    assisted_interview_ai.py and voice_screen.py, each with its own
    httpx.AsyncClient. Returns the transcript text, or None on any failure
    (missing key, network error, malformed response). response_format
    "text" returns the raw response body (assisted_interview_ai.py's
    original call used this, plus temperature=0/language=en passed via
    extra_data for deterministic decoding); "json" (default, matching
    voice_screen.py's original call) reads the "text" field of the JSON
    body instead."""
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured -- cannot transcribe")
        return None
    data = {"model": GROQ_WHISPER_MODEL, "response_format": response_format}
    if extra_data:
        data.update(extra_data)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                files={"file": (filename, audio_bytes)},
                data=data,
                timeout=timeout,
            )
            resp.raise_for_status()
            if response_format == "text":
                return resp.text.strip()
            return resp.json().get("text")
    except Exception:
        logger.exception("Groq Whisper transcription failed")
        return None


def extract_json(text: str | None):
    """Groq sometimes wraps JSON in prose/fences -- pull out the first {..}
    or [..] block. Verbatim logic from interview_ai._extract_json (also
    imported by aptitude_engine) -- moved here since it's Groq
    response-parsing, not interview-specific."""
    if not text:
        return None
    text = text.strip()
    for fence in ("```json", "```"):
        if text.startswith(fence):
            text = text[len(fence):]
    text = text.strip("` \n")
    start_chars = "[{"
    for i, ch in enumerate(text):
        if ch in start_chars:
            try:
                return json.loads(text[i:])
            except json.JSONDecodeError:
                continue
    return None
