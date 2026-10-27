import pathlib
f = pathlib.Path(r"C:\Users\rajuy\Downloads\nexyuva_complete_v1\nexyuva\backend\app\ai\assisted_interview_ai.py")
c = f.read_text(encoding="utf-8")

old_imports = '''import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger("nexyuva.assisted_interview_ai")

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = settings.GROQ_MODEL
# Groq's fast, cheap Whisper variant — same tier the doc calls for in 5.7's
# latency budget (<2-3s round trip); we don't need the full whisper-large-v3
# here since this is text-suggestion support, not a scored transcript.
GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"

# Same reasoning-model caveat as app/ai/interview_ai.py (GROQ_MODEL is a
# reasoning model that can burn its whole max_tokens budget on hidden
# chain-of-thought at the default effort level) — "low" keeps this call
# fast and reliably non-empty even with the larger output below.
GROQ_REASONING_EFFORT = "low"
'''

new_imports = '''import logging
import re

from app.ai.groq_client import extract_json as _extract_json
from app.ai.groq_client import groq_chat, groq_transcribe
from app.core.config import settings

logger = logging.getLogger("nexyuva.assisted_interview_ai")
'''

assert c.count(old_imports) == 1, "imports:" + str(c.count(old_imports))
c = c.replace(old_imports, new_imports)

old_extract = '''def _extract_json(text: str):
    if not text:
        return None
    text = text.strip()
    for fence in ("```json", "```"):
        if text.startswith(fence):
            text = text[len(fence):]
    text = text.strip("` \\n")
    for i, ch in enumerate(text):
        if ch in "[{":
            try:
                return json.loads(text[i:])
            except json.JSONDecodeError:
                continue
    return None


'''
assert c.count(old_extract) == 1, "extract:" + str(c.count(old_extract))
c = c.replace(old_extract, "")

old_transcribe = '''    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured — cannot transcribe")
        return None
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        logger.warning("Audio chunk exceeds %d bytes — refusing to transcribe", MAX_AUDIO_BYTES)
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                files={"file": (filename, audio_bytes)},
                data={
                    "model": GROQ_WHISPER_MODEL,
                    "response_format": "text",
                    # temperature=0 makes Whisper's decoding deterministic/
                    # greedy instead of sampling, which measurably cuts down
                    # on hallucinated boilerplate for short/quiet clips.
                    "temperature": 0,
                    "language": "en",
                },
                timeout=25.0,
            )
            resp.raise_for_status()
            text = resp.text.strip()
            if not text:
                return None
            if _looks_like_whisper_hallucination(text):
                logger.info("Discarding likely Whisper hallucination on near-silent audio: %r", text)
                return None
            return text
    except Exception:
        logger.exception("Groq Whisper transcription failed")
        return None'''

new_transcribe = '''    if len(audio_bytes) > MAX_AUDIO_BYTES:
        logger.warning("Audio chunk exceeds %d bytes — refusing to transcribe", MAX_AUDIO_BYTES)
        return None
    # temperature=0 makes Whisper's decoding deterministic/greedy instead of
    # sampling, which measurably cuts down on hallucinated boilerplate for
    # short/quiet clips.
    text = await groq_transcribe(
        audio_bytes, filename=filename, response_format="text",
        extra_data={"temperature": 0, "language": "en"}, timeout=25.0,
    )
    if not text:
        return None
    if _looks_like_whisper_hallucination(text):
        logger.info("Discarding likely Whisper hallucination on near-silent audio: %r", text)
        return None
    return text'''

assert c.count(old_transcribe) == 1, "transcribe:" + str(c.count(old_transcribe))
c = c.replace(old_transcribe, new_transcribe)

old_suggest = '''    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GROQ_CHAT_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 500,
                    "temperature": 0.4,
                    "reasoning_effort": GROQ_REASONING_EFFORT,
                },
                timeout=20.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            parsed = _extract_json(content) if content else None
            questions = _validate_suggestions(parsed)
            if not questions and parsed is not None:
                logger.warning("Groq follow-up suggestion output rejected by validation — returning none")
            return [{"id": f"s{i + 1}", "question": q} for i, q in enumerate(questions)]
    except Exception:
        logger.exception("Groq follow-up suggestion call failed")
        return []'''

new_suggest = '''    content = await groq_chat(system_prompt, user_prompt, max_tokens=500, temperature=0.4, timeout=20.0)
    parsed = _extract_json(content) if content else None
    questions = _validate_suggestions(parsed)
    if not questions and parsed is not None:
        logger.warning("Groq follow-up suggestion output rejected by validation — returning none")
    return [{"id": f"s{i + 1}", "question": q} for i, q in enumerate(questions)]'''

assert c.count(old_suggest) == 1, "suggest:" + str(c.count(old_suggest))
c = c.replace(old_suggest, new_suggest)

f.write_text(c, encoding="utf-8")
print("ok")
