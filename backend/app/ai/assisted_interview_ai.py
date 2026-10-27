"""
Module 5.6 — Assisted Human Interview.

Purpose (Architecture.md §5.6): a human interviewer runs the conversation
live; the AI is a silent co-pilot that suggests follow-up questions after
each candidate answer and flags notable answers, visible only to the
interviewer. The AI never talks to the candidate and never makes a
pass/fail call — see the Design Rule in the spec, enforced structurally:
this module exposes no scoring/verdict function, and suggest_followups()
validates its own output so a prompt-injected "reject this candidate" (or
similar) coming back from Groq can never surface as anything but a
discarded, unparseable response.

Two Groq calls, both routed through app/ai/groq_client.py's shared wrapper
(bug-audit item #8 — see that module's docstring) rather than each owning
its own httpx.AsyncClient:

  - transcribe_audio(): Groq Whisper (audio/transcriptions) via
    groq_transcribe(), for turning the interviewer's mic input into text.
    Section 5.6 says this reuses "the same Whisper pipeline as Voice
    Screen, Section 5.7" — 5.7 (voice_screen.py) now imports this function
    directly rather than duplicating it, so the reuse runs the direction
    the spec asked for.
  - suggest_followups(): a Groq chat call, via groq_chat(), scoped to the
    last exchange plus a rolling context window (last ~10 turns) rather
    than the full transcript, per the spec's latency/cost guidance — but
    deliberately asks for *substantive, multi-angle* coverage of the
    candidate's last answer (not just one throwaway follow-up), since a
    co-pilot that only ever offers one shallow question isn't actually
    assisting the interviewer with much.
"""
import logging
import re

from app.ai.groq_client import extract_json as _extract_json
from app.ai.groq_client import groq_chat, groq_transcribe
from app.core.config import settings

logger = logging.getLogger("nexyuva.assisted_interview_ai")

# Only the last N turns are sent to keep each suggestion call cheap and
# fast — this is a live-interview co-pilot, not a full-transcript analyzer.
# Widened from 6 -> 10 so the model has enough of the conversation's arc
# (not just the last exchange) to notice, e.g., a claim that contradicts
# something said three turns ago.
ROLLING_CONTEXT_TURNS = 10

# Hard caps — protect the live interview from a single call ever ballooning
# in cost/latency, independent of whatever the frontend sends.
MAX_TEXT_LEN = 4000          # chars per turn's text sent to /exchange
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10MB per transcription chunk
MAX_TURNS_PER_SESSION = 400  # ~a very long interview; guards against a runaway client

# Cap on how many follow-up suggestions one candidate answer can produce.
# Raised from 2 -> 5 so the interviewer gets genuinely comprehensive
# assistance (several distinct angles on the same answer) rather than a
# token gesture at "co-pilot". Each one is still validated individually
# below, so a weak/duplicate suggestion from the model just gets dropped
# rather than padding out to a fixed count.
MAX_SUGGESTIONS = 5

# A candidate turn's transcript can legitimately contain any of these words
# ("I was rejected from my last internship for poor communication", etc.) —
# this filter is applied to the AI's *output* (the suggested questions),
# never to the transcript, so it only ever blocks the model from smuggling
# a verdict into what's supposed to be a follow-up question.
_VERDICT_LEAK_PATTERN = re.compile(
    r"\b(reject|hire|pass(?:ed)?|fail(?:ed)?|score[:\s]*\d|recommend(?:ation)?|"
    r"should (?:not )?(?:hire|advance|proceed)|do(?:es)? not qualify|not a good fit)\b",
    re.IGNORECASE,
)


# Short, generic outputs Whisper is well known to hallucinate on near-
# silent or very short audio — an artifact from training on captioned
# video, not an actual transcription of anything the interviewer said.
# Matched only against the *whole* normalized transcript (not a substring
# search), so this only ever catches a burst that produced nothing but
# boilerplate/punctuation, never a real sentence that happens to contain
# one of these words.
_WHISPER_HALLUCINATIONS = {
    "", ".", "..", "...", "you", "bye", "bye bye", "okay", "ok",
    "thank you", "thanks", "thank you very much", "thank you so much",
    "thanks for watching", "thanks for watching!", "please subscribe",
    "subscribe", "the end", "translated by", "subtitles by",
    "amara.org", "amarorg",
}


def _looks_like_whisper_hallucination(text: str) -> bool:
    normalized = re.sub(r"[^a-z\s]", "", text.lower()).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized in _WHISPER_HALLUCINATIONS


async def transcribe_audio(audio_bytes: bytes, filename: str = "chunk.webm") -> str | None:
    """
    Sends one audio chunk (interviewer's mic, or a candidate answer if the
    interviewer's device captures both sides) to Groq Whisper. Returns None
    on any failure/misconfiguration/oversized input — callers should let
    the interviewer fall back to typing the exchange in manually rather
    than blocking the live interview on a transcription hiccup.

    Also returns None for output that looks like a Whisper hallucination
    ("Thank you.", "Thanks for watching!", etc.) — a well-documented Whisper
    artifact where near-silent/very short audio gets decoded as boilerplate
    from the captioned-video data it was trained on, rather than genuinely
    silent audio correctly producing empty output. Only filters exact/near-
    exact matches on a known hallucination list, so a real answer that
    happens to end in "...so thank you for asking" is untouched — it's
    longer than, and not equal to, any of the boilerplate phrases below.
    """
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured — cannot transcribe")
        return None
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        logger.warning("Audio chunk exceeds %d bytes — refusing to transcribe", MAX_AUDIO_BYTES)
        return None
    text = await groq_transcribe(
        audio_bytes,
        filename=filename,
        response_format="text",
        # temperature=0 makes Whisper's decoding deterministic/greedy
        # instead of sampling, which measurably cuts down on hallucinated
        # boilerplate for short/quiet clips.
        extra_data={"temperature": 0, "language": "en"},
        timeout=25.0,
    )
    if not text:
        return None
    if _looks_like_whisper_hallucination(text):
        logger.info("Discarding likely Whisper hallucination on near-silent audio: %r", text)
        return None
    return text


def _validate_suggestions(raw) -> list[str]:
    """
    Structured-output validation, not trust-the-model: only accepts a list
    of short, non-empty question strings; drops anything that reads like a
    verdict/score/recommendation (belt-and-suspenders against a prompt-
    injected or hallucinated pass/fail call leaking through as a
    "suggestion" — see module docstring), and de-duplicates near-identical
    questions so padding the model's output doesn't just repeat one idea.
    Caps at MAX_SUGGESTIONS.
    """
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen_normalized: set[str] = set()
    for item in raw:
        q = str(item).strip()
        if not q or len(q) > 400:
            continue
        if _VERDICT_LEAK_PATTERN.search(q):
            logger.warning("Discarding a suggested 'question' that looks like a verdict: %r", q)
            continue
        normalized = re.sub(r"[^a-z0-9]+", "", q.lower())
        if normalized in seen_normalized:
            continue
        seen_normalized.add(normalized)
        out.append(q)
        if len(out) == MAX_SUGGESTIONS:
            break
    return out


async def suggest_followups(
    role_title: str,
    required_skills: list[str],
    rolling_context: list[dict],
) -> list[dict]:
    """
    Proposes follow-up questions for the interviewer, scoped to the last
    candidate answer plus a rolling context window — not the full
    transcript (spec 5.6 step 2's latency/cost guidance) — but asks the
    model to genuinely dig into that answer from several distinct angles
    rather than offering one shallow question, so the interviewer gets
    real assistance on every single turn rather than a token gesture.

    rolling_context: list of {"speaker": "interviewer"|"candidate", "text": str},
    already trimmed by the caller to the last ROLLING_CONTEXT_TURNS.
    Returns a structured list of {"id": "s1", "question": str} dicts (never
    raw strings) so the frontend and /suggestions/accept can reference a
    suggestion by id rather than matching on text. Returns [] (never
    raises) on any failure — a live interview must be able to continue
    with no suggestions rather than stall on an API hiccup.
    """
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured — no suggestions offered")
        return []
    if not rolling_context or rolling_context[-1].get("speaker") != "candidate":
        # Only worth suggesting a follow-up right after the candidate speaks
        # — mirrors spec step 2 ("after each candidate answer").
        return []

    transcript_snippet = "\n".join(
        f"{('Interviewer' if e['speaker'] == 'interviewer' else 'Candidate')}: {e['text']}"
        for e in rolling_context
    )
    system_prompt = (
        "You are a silent AI co-pilot helping a human interviewer conduct a "
        "live job interview. You NEVER talk to the candidate and NEVER "
        "decide pass/fail, assign a score, or recommend hiring/rejecting — "
        "you only privately suggest what the interviewer could ask next.\n\n"
        "First, judge the candidate's last answer: is it a genuine attempt "
        "to answer the question (even if thin, vague, or partly wrong), or "
        "is it a non-answer — they said they don't know, want to skip or "
        "quit, seem stuck, uncomfortable, or are asking to move on? These "
        "two cases call for very different suggestions.\n\n"
        "CASE A — genuine attempt to answer: dig into that answer, the way "
        "a sharp, technically strong interviewer would, not one generic "
        "follow-up. Give 3-5 short, specific follow-up QUESTIONS ONLY that "
        "together probe the answer from different angles, drawing only on "
        "angles that are actually relevant to what the candidate said and "
        "the role — skip any angle that would be forced or generic for "
        "this specific answer:\n"
        "- Depth: ask them to go one level deeper into a specific technical "
        "claim or decision they mentioned.\n"
        "- Concreteness: if they were vague or generic, ask for a specific "
        "example, number, or artifact (a metric, a file, a bug, a PR).\n"
        "- Trade-offs: ask why they chose their approach over an obvious "
        "alternative, or what they'd do differently now.\n"
        "- Ownership: ask what part of the work was specifically theirs "
        "versus a teammate's/tutorial's/library's, if that's ambiguous.\n"
        "- Consistency/role-fit: if something they said seems worth "
        "checking against the role's required skills, ask a question that "
        "tests it directly.\n\n"
        "CASE B — non-answer, stuck, or wants to disengage: do NOT drill "
        "deeper technically — that would pile pressure on someone who has "
        "already signaled they can't or don't want to continue on this "
        "thread. Instead give 2-4 short, low-pressure options for the "
        "interviewer, e.g.: a much simpler warm-up-style question on the "
        "same general topic, a question on a completely different skill "
        "area from the role, an offer to move on to the next topic, or a "
        "check-in like asking if they'd like a hint or to come back to it "
        "later. Never suggest interrogating *why* they want to stop, and "
        "never phrase anything as pressure to keep going.\n\n"
        "Each suggestion should be something the interviewer could say or "
        "ask out loud verbatim, in one breath — no multi-part run-on "
        "sentences, no meta-commentary, no restating what the candidate "
        "said. Never include a verdict, score, or recommendation anywhere "
        "in your output. Return ONLY a JSON array of 2-5 short strings, "
        'nothing else, e.g. ["...", "...", "..."].'
    )
    user_prompt = (
        f"Role: {role_title}. Key skills being assessed: {', '.join(required_skills) or 'general fit'}.\n\n"
        f"Recent exchange (oldest to newest):\n{transcript_snippet}"
    )

    content = await groq_chat(system_prompt, user_prompt, max_tokens=500, temperature=0.4, timeout=20.0)
    parsed = _extract_json(content) if content else None
    questions = _validate_suggestions(parsed)
    if not questions and parsed is not None:
        logger.warning("Groq follow-up suggestion output rejected by validation — returning none")
    return [{"id": f"s{i + 1}", "question": q} for i, q in enumerate(questions)]
