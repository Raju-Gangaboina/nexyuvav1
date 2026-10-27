"""
Production ATS (Applicant Tracking System) Analyzer -- M5 follow-up
(nexyuva_supplemental_audit.docx). Two layers, deliberately weighted
toward the deterministic layer:

  1. DETERMINISTIC layer (primary, no external dependency, always runs):
     real, documented parsing behaviors of the ATS platforms Indian and
     global companies actually run in production --
       - Workday          (TCS, Infosys-client MNCs, Accenture, most large
                            enterprise employers)
       - Greenhouse       (most funded startups, product companies)
       - iCIMS            (large enterprise / staffing-firm pipelines)
       - Oracle Taleo     (legacy enterprise -- PSU / large corporate)
       - SAP SuccessFactors (enterprise HRIS-integrated hiring)
       - LinkedIn Recruiter / Easy Apply (nearly universal secondary channel)
     These platforms' parsing quirks are well-documented in their own
     help-center docs and by career-services literature (multi-column
     layouts breaking field extraction, text-in-images being unreadable,
     keyword-literal matching, etc.) -- this module encodes those as
     concrete, checkable rules rather than a black-box "ATS score" claim.

  2. LLM layer (Groq, optional, additive only): a *small* qualitative pass
     that reads the actual resume text and the deterministic findings, and
     returns specific, quoted mistakes -- not generic advice. Degrades
     gracefully per Rules.md Section 3 if GROQ_API_KEY isn't configured or
     the call fails: the deterministic layer alone is still a complete,
     honest result, just without the recruiter-style qualitative notes.

Nothing here claims to replicate a specific company's actual proprietary
scoring algorithm (those are not public) -- it replicates their
*documented parsing behavior*, which is real and verifiable.
"""
import json
import logging
import re

from app.ai.groq_client import post_chat_completion
from app.ai.resume_parser import detect_sections, extract_links
from app.core.config import settings

logger = logging.getLogger("nexyuva.ats_analyzer")

# --- Real, documented ATS platform behaviors -------------------------------
ATS_PLATFORMS = {
    "workday": "Workday",
    "greenhouse": "Greenhouse",
    "icims": "iCIMS",
    "taleo": "Oracle Taleo",
    "successfactors": "SAP SuccessFactors",
    "linkedin": "LinkedIn Recruiter / Easy Apply",
}

WEAK_PHRASES = [
    "responsible for", "worked on", "helped with", "duties included",
    "involved in", "tasked with", "assisted in", "in charge of",
    "participated in", "was part of",
]
STRONG_VERB_RE = re.compile(
    r"\b(built|led|designed|architected|shipped|optimi[sz]ed|automated|"
    r"reduced|increased|improved|implemented|developed|launched|scaled|"
    r"migrated|refactored|deployed|engineered|created|delivered|drove)\b",
    re.IGNORECASE,
)
QUANTIFIER_RE = re.compile(r"(\d+(\.\d+)?\s*%|\b\d{2,}\b|\u20b9\s?\d|\$\s?\d)")
BULLET_LINE_RE = re.compile(r"^\s*[\u2022\u25CF\u25AA\u2023\-\*]\s+")


def _text_stats(text: str) -> dict:
    words = text.split()
    lines = [l for l in text.splitlines() if l.strip()]
    bullet_lines = [l for l in lines if BULLET_LINE_RE.match(l)]
    return {
        "word_count": len(words),
        "line_count": len(lines),
        "bullet_line_count": len(bullet_lines),
    }


def _detect_possible_multi_column(text: str) -> bool:
    """
    Heuristic, not certain -- text extraction from a real multi-column PDF
    often interleaves column content line-by-line in a way that produces
    many lines with large internal whitespace gaps (columns rendered
    side-by-side get flattened with big gaps between them) or very short,
    fragmented lines. This is exactly the layout Workday/Taleo are
    documented to mis-parse (they expect single-column, linear reading
    order). Flagged as a warning to verify manually, not a hard fail --
    a heuristic on extracted text can't be certain about visual layout.
    """
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        return False
    gap_lines = sum(1 for l in lines if re.search(r"\S {4,}\S", l))
    return len(lines) > 15 and (gap_lines / len(lines)) > 0.25


def run_deterministic_checks(text: str, resume_path: str) -> tuple[list[dict], dict]:
    """Returns (checks, sub_scores). Each check: {id, label, status
    (pass/warn/fail), detail, platforms} -- platforms lists which real ATS
    this specific check maps to, so the UI can cite them concretely instead
    of a vague 'ATS compatibility' claim."""
    checks: list[dict] = []
    stats = _text_stats(text)
    sections = detect_sections(text)
    links = extract_links(text)

    if stats["word_count"] < 60:
        checks.append({
            "id": "extractability", "status": "fail",
            "label": "Resume text is not machine-readable",
            "detail": (
                f"Only {stats['word_count']} words could be extracted from this file. "
                "This usually means it's a scanned image or a design-heavy PDF with text "
                "rendered as graphics rather than real text -- an ATS parser sees a "
                "near-blank document."
            ),
            "platforms": ["workday", "taleo", "icims"],
        })
    else:
        checks.append({
            "id": "extractability", "status": "pass",
            "label": "Resume text is machine-readable",
            "detail": f"{stats['word_count']} words extracted cleanly as real text.",
            "platforms": ["workday", "taleo", "icims", "greenhouse", "linkedin"],
        })

    if links["email"] or links["phone"]:
        checks.append({
            "id": "contact_info", "status": "pass",
            "label": "Contact info detected in the body text",
            "detail": "Email/phone found in the main document text, not just an image or "
                      "a header/footer region a parser might skip.",
            "platforms": ["icims", "taleo"],
        })
    else:
        checks.append({
            "id": "contact_info", "status": "fail",
            "label": "No email or phone number detected",
            "detail": (
                "No parseable email/phone found. If it's actually on the resume, it's "
                "likely inside a header/footer or a text box -- iCIMS and Taleo are both "
                "documented to skip header/footer regions entirely when parsing contact "
                "fields."
            ),
            "platforms": ["icims", "taleo"],
        })

    if len(sections) >= 3:
        checks.append({
            "id": "section_headers", "status": "pass",
            "label": f"{len(sections)} standard section headers recognized",
            "detail": "Section headers use conventional wording (" + ", ".join(sections[:5]) + ").",
            "platforms": ["workday", "taleo", "icims", "successfactors"],
        })
    else:
        checks.append({
            "id": "section_headers", "status": "warn",
            "label": "Few standard section headers found",
            "detail": (
                f"Only {len(sections)} recognized section header(s). Field-based parsers "
                "(Workday, Taleo, SuccessFactors) map resume content to structured fields "
                "using header text like 'Experience', 'Education', 'Skills' -- unconventional "
                "or missing headers mean that content may land in the wrong field or get dropped."
            ),
            "platforms": ["workday", "taleo", "successfactors"],
        })

    if resume_path.lower().endswith(".pdf"):
        checks.append({
            "id": "file_format", "status": "warn",
            "label": "PDF format -- fine for modern ATS, riskier on legacy ones",
            "detail": (
                "Greenhouse, Workday, and LinkedIn parse PDFs reliably. Older iCIMS/Taleo "
                "deployments (common at PSUs and large legacy enterprises) have documented "
                "PDF-parsing inconsistencies -- a .docx is the safer choice if you know "
                "you're applying through one of those."
            ),
            "platforms": ["icims", "taleo"],
        })
    else:
        checks.append({
            "id": "file_format", "status": "pass",
            "label": ".docx format -- safest choice across all major ATS",
            "detail": ".docx is reliably parsed by every platform in this check, including legacy ones.",
            "platforms": ["workday", "taleo", "icims", "greenhouse", "successfactors"],
        })

    if _detect_possible_multi_column(text):
        checks.append({
            "id": "layout", "status": "warn",
            "label": "Possible multi-column layout detected",
            "detail": (
                "The extracted text shows a pattern consistent with a multi-column design "
                "(sidebar + main content). Workday and Taleo read PDFs in raw left-to-right, "
                "top-to-bottom order -- a sidebar can end up interleaved mid-sentence with "
                "your main content, scrambling dates and job titles. Verify this manually; "
                "a single-column, reverse-chronological layout is the safest format."
            ),
            "platforms": ["workday", "taleo"],
        })
    else:
        checks.append({
            "id": "layout", "status": "pass",
            "label": "No multi-column layout signal detected",
            "detail": "Text extracts in a clean, linear reading order.",
            "platforms": ["workday", "taleo"],
        })

    bullet_ratio = stats["bullet_line_count"] / stats["line_count"] if stats["line_count"] else 0
    if bullet_ratio < 0.15:
        checks.append({
            "id": "structure", "status": "warn",
            "label": "Experience section reads as dense paragraphs, not bullets",
            "detail": (
                f"Only {stats['bullet_line_count']} bulleted lines out of {stats['line_count']}. "
                "Greenhouse and Workday's parsing (and every human recruiter after it) both "
                "expect scannable bullet points under each role -- long paragraphs get "
                "skimmed or skipped."
            ),
            "platforms": ["greenhouse", "workday"],
        })
    else:
        checks.append({
            "id": "structure", "status": "pass",
            "label": "Bullet-driven structure",
            "detail": f"{stats['bullet_line_count']} bulleted lines -- scannable, parser-friendly structure.",
            "platforms": ["greenhouse", "workday"],
        })

    text_lower = text.lower()
    found_weak = sorted({p for p in WEAK_PHRASES if p in text_lower})
    strong_verb_count = len(STRONG_VERB_RE.findall(text))
    if found_weak:
        checks.append({
            "id": "action_verbs", "status": "warn",
            "label": "Weak/passive phrasing found",
            "detail": (
                "Found: " + ", ".join(f'"{p}"' for p in found_weak) + ". "
                f"Only {strong_verb_count} strong action verbs (built/led/designed/optimized/"
                "shipped/etc.) detected overall. Recruiters screening against Greenhouse/"
                "LinkedIn scorecards weight ownership language -- 'responsible for X' reads "
                "as a duty, 'built X' reads as an accomplishment."
            ),
            "platforms": ["greenhouse", "linkedin"],
        })
    else:
        checks.append({
            "id": "action_verbs", "status": "pass",
            "label": "Ownership-driven phrasing",
            "detail": f"{strong_verb_count} strong action verbs found, no weak/passive filler phrases detected.",
            "platforms": ["greenhouse", "linkedin"],
        })

    quant_hits = len(QUANTIFIER_RE.findall(text))
    if quant_hits < 2:
        checks.append({
            "id": "quantification", "status": "warn",
            "label": "Few quantifiable results",
            "detail": (
                f"Only {quant_hits} number/percentage/currency figure(s) found in the whole "
                "document. 'Improved load time' is a claim; 'improved load time by 40%' is "
                "evidence -- this is one of the most common gaps recruiters flag."
            ),
            "platforms": ["greenhouse", "linkedin"],
        })
    else:
        checks.append({
            "id": "quantification", "status": "pass",
            "label": "Quantifiable results present",
            "detail": f"{quant_hits} numeric/quantified results found across the resume.",
            "platforms": ["greenhouse", "linkedin"],
        })

    if stats["word_count"] < 150:
        checks.append({
            "id": "length", "status": "warn", "label": "Resume looks thin",
            "detail": f"{stats['word_count']} words total -- likely under half a page of real content.",
            "platforms": ["greenhouse", "linkedin"],
        })
    elif stats["word_count"] > 1200:
        checks.append({
            "id": "length", "status": "warn", "label": "Resume looks long for an internship application",
            "detail": f"{stats['word_count']} words -- likely 2+ pages. For an internship-level "
                      "candidate, one focused page is standard.",
            "platforms": ["greenhouse", "linkedin"],
        })
    else:
        checks.append({
            "id": "length", "status": "pass", "label": "Length is appropriate",
            "detail": f"{stats['word_count']} words -- a reasonable single-page length.",
            "platforms": ["greenhouse", "linkedin"],
        })

    def _cat_score(ids: list[str]) -> int:
        relevant = [c for c in checks if c["id"] in ids]
        if not relevant:
            return 100
        points = {"pass": 100, "warn": 50, "fail": 0}
        return round(sum(points[c["status"]] for c in relevant) / len(relevant))

    sub_scores = {
        "parseability": _cat_score(["extractability", "contact_info", "file_format", "layout"]),
        "structure": _cat_score(["section_headers", "structure", "length"]),
        "content_quality": _cat_score(["action_verbs", "quantification"]),
    }

    return checks, sub_scores


def compute_keyword_gap(confirmed_skill_names: list[str], required_skills: list[str]) -> dict:
    """
    Literal, case-insensitive keyword matching -- exactly how Taleo and
    iCIMS actually rank candidates (exact-phrase matching against the job
    requisition, not semantic understanding). This is deliberately the
    crude, literal version rather than reusing the embeddings-based
    similarity elsewhere in this codebase, because that's the honest thing
    a real keyword-matching ATS does.
    """
    have = {s.lower() for s in confirmed_skill_names}
    matched = [s for s in required_skills if s.lower() in have]
    missing = [s for s in required_skills if s.lower() not in have]
    return {"matched": matched, "missing": missing}


async def call_groq_for_mistakes(
    text: str, checks: list[dict], required_skills: list[str] | None
) -> tuple[list[dict], bool]:
    """
    Additive qualitative layer. Returns (mistakes, ai_reviewed). Degrades to
    ([], False) on any failure -- the deterministic checks above are a
    complete result on their own, per Rules.md Section 3 graceful-degradation.
    """
    if not settings.GROQ_API_KEY:
        logger.info("GROQ_API_KEY not configured -- ATS analysis is deterministic-only")
        return [], False

    warn_fail = [c for c in checks if c["status"] != "pass"]
    findings_block = "\n".join(f"- {c['label']}: {c['detail']}" for c in warn_fail) or "None -- all deterministic checks passed."
    jd_block = f"\nTarget role requires these skills: {', '.join(required_skills)}." if required_skills else ""

    system_prompt = (
        "You are a senior technical recruiter who screens resumes the way real ATS "
        "platforms (Workday, Greenhouse, iCIMS, Taleo) and human reviewers actually do. "
        "Given a resume's text and a list of rule-based findings already detected, identify "
        "up to 5 SPECIFIC, GENUINE mistakes in THIS resume -- not generic resume advice. "
        "Each mistake must quote the exact offending text from the resume (verbatim, "
        "under 15 words) so the candidate can find it -- if you cannot find a real "
        "verbatim quote for an issue, do not include that issue at all; never write "
        "'None' or a paraphrase as the quote. "
        "Do not flag stylistic non-issues like alphabetical ordering of a skills list -- "
        "that is not something any real ATS or recruiter cares about. "
        "Do not raise the same underlying problem twice under different issue titles -- "
        "each of the up-to-5 mistakes must be about a genuinely distinct part of the resume. "
        "Respond ONLY with valid JSON: "
        '{"mistakes": [{"issue": "...", "quote": "...", "why_it_matters": "...", "fix": "..."}]}. '
        "If the resume is genuinely strong, or you only find 1-2 real issues, return just "
        "those 1-2 (or zero) rather than inventing filler ones to reach 5."
    )
    user_prompt = f"Rule-based findings so far:\n{findings_block}{jd_block}\n\nResume text:\n{text[:6000]}"

    try:
        data = await post_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=900,
            temperature=0.3,
            reasoning_effort=None,  # original call never set this
            response_format={"type": "json_object"},
            timeout=20.0,
        )
        if data is None:
            return [], False
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        mistakes = parsed.get("mistakes", [])
        if not isinstance(mistakes, list):
            return [], False

        # Enforce, in code, what the prompt asks for but a fast small model
        # won't reliably obey: every quote must be a real, verbatim,
        # findable substring of the actual resume text (case-insensitive,
        # whitespace-normalized). Anything else -- an invented quote, the
        # literal string "None", or a paraphrase -- gets dropped rather
        # than shown to the candidate as if it were grounded. Also collapse
        # near-duplicate issues (same quote reused across entries), which
        # is the other failure mode observed: the model padding toward 5
        # by re-describing the same spot under a different issue title.
        norm_text = re.sub(r"\s+", " ", text).lower()
        verified: list[dict] = []
        seen_quotes: set[str] = set()
        for m in mistakes:
            quote = (m.get("quote") or "").strip()
            norm_quote = re.sub(r"\s+", " ", quote).lower()
            if not norm_quote or norm_quote == "none":
                continue
            if norm_quote in seen_quotes:
                continue
            if norm_quote not in norm_text:
                continue
            if not all(k in m for k in ("issue", "why_it_matters", "fix")):
                continue
            seen_quotes.add(norm_quote)
            verified.append(m)

        return verified[:5], True
    except Exception:
        logger.exception("Groq ATS review call failed -- falling back to deterministic-only result")
        return [], False


async def analyze_resume_ats(
    text: str,
    resume_path: str,
    confirmed_skill_names: list[str],
    required_skills: list[str] | None = None,
    include_ai: bool = True,
) -> dict:
    """
    include_ai=False skips the Groq qualitative pass entirely (no network
    call at all) and returns the deterministic-only result immediately --
    used for the cheap, instant per-card ATS percentage badge on Live
    Internships, where firing a real LLM call for every internship in the
    list on every page load would be slow and wasteful for a number that's
    ~always going to be near-identical anyway (parseability/structure/
    content_quality only depend on the resume file, not the job -- see the
    Profile ATS Score tab, which uses the same include_ai=False style call
    for the same reason). The real Groq-reviewed analysis still runs, same
    as before, when the student actually clicks through for the full
    breakdown (include_ai=True, the default).
    """
    checks, sub_scores = run_deterministic_checks(text, resume_path)

    keyword_gap = None
    if required_skills:
        keyword_gap = compute_keyword_gap(confirmed_skill_names, required_skills)
        total = len(required_skills)
        matched = len(keyword_gap["matched"])
        sub_scores["keyword_match"] = round((matched / total) * 100) if total else 100

    if include_ai:
        mistakes, ai_reviewed = await call_groq_for_mistakes(text, checks, required_skills)
    else:
        mistakes, ai_reviewed = [], False

    overall_score = round(sum(sub_scores.values()) / len(sub_scores))

    framework_notes = [
        {"platform": ATS_PLATFORMS[c["platforms"][0]], "note": c["detail"]}
        for c in checks if c["status"] != "pass"
    ][:4]

    return {
        "overall_score": overall_score,
        "category_scores": sub_scores,
        "checks": checks,
        "genuine_mistakes": mistakes,
        "ai_reviewed": ai_reviewed,
        "framework_notes": framework_notes,
        "keyword_gap": keyword_gap,
    }
