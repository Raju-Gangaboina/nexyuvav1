"""
Resume Intelligence module (Architecture.md §4). Real pipeline, no placeholders:
  1. Extract raw text from PDF/DOCX
  2. Segment into sections via regex/heuristics on common headers
  3. Extract skills two ways and report them separately:
       a) CONFIRMED — exact spaCy PhraseMatcher hits against a curated,
          categorized skill taxonomy. Precise and auditable: if a skill is
          "confirmed", the resume literally contains that phrase (or a known
          variant of it). This is what silently gets written into the
          student's profile.
       b) SUGGESTED — a semantic pass using sentence-transformers embeddings
          (the same model app/ai/embeddings.py already uses for profile/
          internship matching) that catches skills phrased differently than
          the taxonomy expects (e.g. "built a RAG-based assistant" implying
          "llm"/"nlp" without ever saying those words). Suggestions are
          NEVER auto-merged into the profile — embeddings give a similarity
          score, not a fact, so the caller must let the student confirm
          each one explicitly.
  4. Extract structured facts the taxonomy pass doesn't touch: GitHub/
     LinkedIn links, degree/branch/CGPA/year (deterministic regex — as
     auditable as the confirmed-skill pass, so these are also safe to
     auto-fill), and PROJECTS/EXPERIENCE entries (surfaced for review; no
     profile column exists for these yet, see routes.py).

REAL-WORLD HARDENING NOTES (found via direct testing against an actual
resume, not assumed):
  - The original taxonomy was a flat list of single surface forms, so it
    missed extremely common variants: "GitHub" (only "git"/"github actions"
    existed), "REST APIs" (plural — only "rest api" singular existed),
    "HTML5"/"CSS3" (only "html"/"css" existed), and had no entries at all
    for several tools common on student resumes: VS Code, IntelliJ IDEA,
    n8n, NotebookLM, Canva, PowerPoint, Blender, RAG, Responsive Web Design,
    Workflow Automation, OOP. spaCy's PhraseMatcher only matches whole
    tokens against the exact forms you give it — no stemming, no fuzzy
    match — so every real phrasing has to be listed explicitly. Fixed by
    keying the taxonomy on canonical name -> list of surface-form variants.
  - Some PDF renderers insert a stray space around hyphens in justified/
    kerned text — "object-oriented" came out of PdfReader as
    "object -oriented", silently breaking the match. Fixed by collapsing
    whitespace around hyphens between word characters before matching.
    The same artifact shows up INSIDE URLs too (e.g.
    "linkedin.com/in/jane -doe"), so extract_links runs on the same
    normalized text rather than raw text.
  - spaCy's raw PhraseMatcher double-counts overlapping matches ("React
    Native" also matching bare "React", "C#" also matching bare "C").
    Fixed with spacy.util.filter_spans, keeping only the longest
    non-overlapping match per text position.
  - A resume's actual EDUCATION table can extract far away from its
    "EDUCATION" header — pypdf linearizes PDF table content in whatever
    order the PDF internally stores it, not visual reading order. On a
    real resume, the row ended up thirty lines later, embedded inside the
    certificates block. So extract_structured_education scans line-by-line
    across the WHOLE document for a degree keyword instead of trusting a
    header-bounded block (which is what guess_academic_background above
    already does, and why it can come back empty on a resume like this
    even though a real row exists).
  - The degree-pattern for M.E. ("m\\.?\\s*e\\.?\\b") had no LEADING word
    boundary, so it silently matched the "me" inside "Full Name:" (a
    boundary exists right after the "e", before the colon) and won over the
    real B.Sc row since M.E. outranks it. Fixed by wrapping every degree
    pattern in an outer \\b(?: ... )\\b.
  - SECTION_HEADERS only had "certifications"/"internships" (plural), but a
    real resume used "CERTIFICATES" and "INTERNSHIP" (singular) — the exact
    same class of miss as the skill-taxonomy variants above. Without the
    "certificates" header, the PROJECTS block never found its real end and
    ran on to swallow the rest of the document; without "internship", the
    experience section wasn't recognized at all. Fixed by adding both
    variants (plus a few other common ones: "career objective",
    "hobbies & interests", "personal details").
  - extract_structured_education's branch field broke on a compact
    single-line resume ("Education: B.Tech Computer Science, CGPA 8.5") —
    there's no multi-space column structure to separate the "Education:"
    label or the trailing CGPA from the branch name, so both ended up
    stuck inside branch ("Education:  Computer Science, CGPA 8.5"). Fixed
    by stripping a leading Education/Qualification label before matching,
    and cutting branch text off at the first comma/CGPA/percentage/year
    marker. A real multi-column row is unaffected since none of those
    markers land in its own degree column to begin with.
  - extract_experience originally treated every line in the section as its
    own entry, so a real bullet-pointed internship/experience block (title
    line + "• responsibility" lines beneath it) got split into several fake
    entries instead of one entry with a description. Fixed by only
    starting a new entry on a non-bullet line and folding bullet lines into
    the current entry's description — a resume with no bullets at all
    (a bare one-line internship title) still produces exactly one entry,
    same as before.
"""
import logging
import re
from pathlib import Path

import numpy as np
import spacy
from spacy.matcher import PhraseMatcher
from spacy.tokens import Span

from pypdf import PdfReader
from docx import Document as DocxDocument

from app.ai.embeddings import embed_batch
from app.services.lookup.routes import get_colleges_index

logger = logging.getLogger("nexyuva.resume_parser")

# Canonical skill name -> {category, variants}. Extend freely — add a new
# key for a new skill, or append a variant to an existing key's list if you
# find another real phrasing that doesn't match.
#
# Categories exist so "skills" and "tools" (and everything else) don't get
# dumped into one undifferentiated bucket — a recruiter filtering for
# "knows Java" shouldn't get diluted results just because a candidate also
# listed PowerPoint. Categories used: language, framework, mobile, database,
# cloud_devops, ai_ml, frontend_web, cs_fundamentals, testing, tool,
# soft_skill.
SKILL_TAXONOMY: dict[str, dict] = {
    # Languages
    "python": {"category": "language", "variants": ["python"]},
    "java": {"category": "language", "variants": ["java"]},
    "javascript": {"category": "language", "variants": ["javascript", "js"]},
    "typescript": {"category": "language", "variants": ["typescript", "ts"]},
    "c++": {"category": "language", "variants": ["c++"]},
    "c": {"category": "language", "variants": ["c"]},
    "c#": {"category": "language", "variants": ["c#"]},
    "sql": {"category": "language", "variants": ["sql"]},
    "r": {"category": "language", "variants": ["r"]},
    "go": {"category": "language", "variants": ["go", "golang"]},
    "rust": {"category": "language", "variants": ["rust"]},
    "php": {"category": "language", "variants": ["php"]},
    "ruby": {"category": "language", "variants": ["ruby"]},
    "kotlin": {"category": "language", "variants": ["kotlin"]},
    "swift": {"category": "language", "variants": ["swift"]},
    "dart": {"category": "language", "variants": ["dart"]},
    "scala": {"category": "language", "variants": ["scala"]},
    # Backend frameworks
    "fastapi": {"category": "framework", "variants": ["fastapi"]},
    "django": {"category": "framework", "variants": ["django"]},
    "flask": {"category": "framework", "variants": ["flask"]},
    "spring boot": {"category": "framework", "variants": ["spring boot"]},
    "spring mvc": {"category": "framework", "variants": ["spring mvc"]},
    "express": {"category": "framework", "variants": ["express", "express.js"]},
    "node.js": {"category": "framework", "variants": ["node.js", "nodejs", "node js"]},
    "next.js": {"category": "framework", "variants": ["next.js", "nextjs"]},
    "nestjs": {"category": "framework", "variants": ["nestjs"]},
    "laravel": {"category": "framework", "variants": ["laravel"]},
    "ruby on rails": {"category": "framework", "variants": ["ruby on rails"]},
    "hibernate": {"category": "framework", "variants": ["hibernate"]},
    ".net": {"category": "framework", "variants": [".net"]},
    "asp.net": {"category": "framework", "variants": ["asp.net"]},
    # Frontend frameworks
    "react": {"category": "framework", "variants": ["react", "react.js", "reactjs"]},
    "vue": {"category": "framework", "variants": ["vue", "vue.js"]},
    "angular": {"category": "framework", "variants": ["angular"]},
    "svelte": {"category": "framework", "variants": ["svelte"]},
    "jquery": {"category": "framework", "variants": ["jquery"]},
    # Mobile
    "flutter": {"category": "mobile", "variants": ["flutter"]},
    "react native": {"category": "mobile", "variants": ["react native"]},
    "android": {"category": "mobile", "variants": ["android"]},
    "ios development": {"category": "mobile", "variants": ["ios development", "ios"]},
    "swiftui": {"category": "mobile", "variants": ["swiftui"]},
    # Databases
    "postgresql": {"category": "database", "variants": ["postgresql", "postgres"]},
    "mysql": {"category": "database", "variants": ["mysql"]},
    "mongodb": {"category": "database", "variants": ["mongodb", "mongo"]},
    "redis": {"category": "database", "variants": ["redis"]},
    "sqlite": {"category": "database", "variants": ["sqlite"]},
    "oracle": {"category": "database", "variants": ["oracle"]},
    "ms sql server": {"category": "database", "variants": ["ms sql server", "sql server"]},
    "cassandra": {"category": "database", "variants": ["cassandra"]},
    "dynamodb": {"category": "database", "variants": ["dynamodb"]},
    "firebase": {"category": "database", "variants": ["firebase"]},
    "elasticsearch": {"category": "database", "variants": ["elasticsearch"]},
    # Cloud / DevOps
    "docker": {"category": "cloud_devops", "variants": ["docker"]},
    "kubernetes": {"category": "cloud_devops", "variants": ["kubernetes", "k8s"]},
    "git": {"category": "cloud_devops", "variants": ["git"]},
    "github": {"category": "cloud_devops", "variants": ["github"]},
    "github actions": {"category": "cloud_devops", "variants": ["github actions"]},
    "ci/cd": {"category": "cloud_devops", "variants": ["ci/cd", "ci cd"]},
    "linux": {"category": "cloud_devops", "variants": ["linux"]},
    "jenkins": {"category": "cloud_devops", "variants": ["jenkins"]},
    "terraform": {"category": "cloud_devops", "variants": ["terraform"]},
    "ansible": {"category": "cloud_devops", "variants": ["ansible"]},
    "circleci": {"category": "cloud_devops", "variants": ["circleci"]},
    "gitlab ci": {"category": "cloud_devops", "variants": ["gitlab ci", "gitlab"]},
    "nginx": {"category": "cloud_devops", "variants": ["nginx"]},
    "aws": {"category": "cloud_devops", "variants": ["aws"]},
    "gcp": {"category": "cloud_devops", "variants": ["gcp"]},
    "azure": {"category": "cloud_devops", "variants": ["azure"]},
    "vercel": {"category": "cloud_devops", "variants": ["vercel"]},
    "render": {"category": "cloud_devops", "variants": ["render"]},
    "heroku": {"category": "cloud_devops", "variants": ["heroku"]},
    "digitalocean": {"category": "cloud_devops", "variants": ["digitalocean"]},
    "aws lambda": {"category": "cloud_devops", "variants": ["aws lambda"]},
    "s3": {"category": "cloud_devops", "variants": ["s3"]},
    "ec2": {"category": "cloud_devops", "variants": ["ec2"]},
    # AI / ML / Data skills
    "machine learning": {"category": "ai_ml", "variants": ["machine learning"]},
    "deep learning": {"category": "ai_ml", "variants": ["deep learning"]},
    "nlp": {"category": "ai_ml", "variants": ["nlp", "natural language processing"]},
    "computer vision": {"category": "ai_ml", "variants": ["computer vision"]},
    "scikit-learn": {"category": "ai_ml", "variants": ["scikit-learn", "sklearn"]},
    "tensorflow": {"category": "ai_ml", "variants": ["tensorflow"]},
    "pytorch": {"category": "ai_ml", "variants": ["pytorch"]},
    "keras": {"category": "ai_ml", "variants": ["keras"]},
    "pandas": {"category": "ai_ml", "variants": ["pandas"]},
    "numpy": {"category": "ai_ml", "variants": ["numpy"]},
    "sentence-transformers": {"category": "ai_ml", "variants": ["sentence-transformers"]},
    "spacy": {"category": "ai_ml", "variants": ["spacy"]},
    "hugging face": {"category": "ai_ml", "variants": ["hugging face", "huggingface"]},
    "opencv": {"category": "ai_ml", "variants": ["opencv"]},
    "matplotlib": {"category": "ai_ml", "variants": ["matplotlib"]},
    "seaborn": {"category": "ai_ml", "variants": ["seaborn"]},
    "jupyter": {"category": "ai_ml", "variants": ["jupyter"]},
    "apache spark": {"category": "ai_ml", "variants": ["apache spark", "spark"]},
    "hadoop": {"category": "ai_ml", "variants": ["hadoop"]},
    "airflow": {"category": "ai_ml", "variants": ["airflow"]},
    "etl": {"category": "ai_ml", "variants": ["etl"]},
    "llm": {"category": "ai_ml", "variants": ["llm", "llms", "large language model", "large language models"]},
    "langchain": {"category": "ai_ml", "variants": ["langchain"]},
    "prompt engineering": {"category": "ai_ml", "variants": ["prompt engineering"]},
    "rag": {"category": "ai_ml", "variants": ["rag", "retrieval augmented generation", "retrieval-augmented generation"]},
    "data analysis": {"category": "ai_ml", "variants": ["data analysis"]},
    "data visualization": {"category": "ai_ml", "variants": ["data visualization"]},
    # Frontend/web general
    "html": {"category": "frontend_web", "variants": ["html", "html5"]},
    "css": {"category": "frontend_web", "variants": ["css", "css3"]},
    "tailwind css": {"category": "frontend_web", "variants": ["tailwind css", "tailwind"]},
    "bootstrap": {"category": "frontend_web", "variants": ["bootstrap"]},
    "sass": {"category": "frontend_web", "variants": ["sass"]},
    "rest api": {"category": "frontend_web", "variants": ["rest api", "rest apis", "restful api", "restful apis"]},
    "graphql": {"category": "frontend_web", "variants": ["graphql"]},
    "webpack": {"category": "frontend_web", "variants": ["webpack"]},
    "vite": {"category": "frontend_web", "variants": ["vite"]},
    "responsive web design": {"category": "frontend_web", "variants": ["responsive web design", "responsive design"]},
    # CS fundamentals
    "data structures": {"category": "cs_fundamentals", "variants": ["data structures"]},
    "algorithms": {"category": "cs_fundamentals", "variants": ["algorithms"]},
    "object-oriented programming": {"category": "cs_fundamentals", "variants": ["object-oriented programming", "oop", "oops"]},
    # Testing
    "pytest": {"category": "testing", "variants": ["pytest"]},
    "jest": {"category": "testing", "variants": ["jest"]},
    "selenium": {"category": "testing", "variants": ["selenium"]},
    "junit": {"category": "testing", "variants": ["junit"]},
    "mocha": {"category": "testing", "variants": ["mocha"]},
    "cypress": {"category": "testing", "variants": ["cypress"]},
    "unit testing": {"category": "testing", "variants": ["unit testing"]},
    # Tools / IDEs / design / productivity software
    "visual studio code": {"category": "tool", "variants": ["visual studio code", "vs code", "vscode"]},
    "intellij idea": {"category": "tool", "variants": ["intellij idea", "intellij"]},
    "jira": {"category": "tool", "variants": ["jira"]},
    "confluence": {"category": "tool", "variants": ["confluence"]},
    "postman": {"category": "tool", "variants": ["postman"]},
    "figma": {"category": "tool", "variants": ["figma"]},
    "maven": {"category": "tool", "variants": ["maven"]},
    "gradle": {"category": "tool", "variants": ["gradle"]},
    "canva": {"category": "tool", "variants": ["canva"]},
    "blender": {"category": "tool", "variants": ["blender"]},
    "powerpoint": {"category": "tool", "variants": ["powerpoint", "microsoft powerpoint", "ms powerpoint"]},
    "excel": {"category": "tool", "variants": ["excel", "microsoft excel", "ms excel"]},
    "power bi": {"category": "tool", "variants": ["power bi"]},
    "tableau": {"category": "tool", "variants": ["tableau"]},
    "n8n": {"category": "tool", "variants": ["n8n"]},
    "notebooklm": {"category": "tool", "variants": ["notebooklm"]},
    "workflow automation": {"category": "tool", "variants": ["workflow automation"]},
    # Soft skills / process
    "project management": {"category": "soft_skill", "variants": ["project management"]},
    "agile": {"category": "soft_skill", "variants": ["agile"]},
    "scrum": {"category": "soft_skill", "variants": ["scrum"]},
    "communication": {"category": "soft_skill", "variants": ["communication"]},
    "leadership": {"category": "soft_skill", "variants": ["leadership"]},
    "teamwork": {"category": "soft_skill", "variants": ["teamwork"]},
    "problem solving": {"category": "soft_skill", "variants": ["problem solving"]},
    "time management": {"category": "soft_skill", "variants": ["time management"]},
    "critical thinking": {"category": "soft_skill", "variants": ["critical thinking"]},
}

# --- Free-text skill normalization (bug-audit item #6) ----------------------
# The taxonomy above only gets applied automatically inside the resume-parse
# pipeline (extract_skills_confirmed). Two other write paths accept skills as
# free text and previously bypassed it entirely:
#   - student manual skill entry (PATCH /me, services/student/routes.py)
#   - recruiter-entered internship.required_skills / preferred_skills
#     (POST /organization/internships, services/organization/routes.py)
# Every downstream match (screening_agent, recommendation_engine, the
# enterprise score breakdown in organization/routes.py) compares skill
# strings with a bare .lower() — so "JS" typed on one side and "JavaScript"
# typed on the other never match, even though extract_skills_confirmed would
# have resolved both to the same canonical "javascript". Fixing this at the
# two write sites (normalize once, on save) is more robust than patching
# every comparison site, and mirrors the existing normalize_domain_label
# pattern in app/core/domains.py: known variants resolve to the canonical
# taxonomy name; anything not recognized passes through unchanged (trimmed)
# rather than being force-fitted or dropped, since a genuinely new skill not
# yet in SKILL_TAXONOMY is still valid free text, not an error.
_SKILL_VARIANT_LOOKUP: dict[str, str] | None = None


def _get_skill_variant_lookup() -> dict[str, str]:
    """Lazily inverts SKILL_TAXONOMY into normalized-variant -> canonical
    name, built once per process. Also maps the canonical name itself
    (lowercased) to itself, so an already-canonical entry round-trips
    unchanged."""
    global _SKILL_VARIANT_LOOKUP
    if _SKILL_VARIANT_LOOKUP is None:
        lookup: dict[str, str] = {}
        for canonical, info in SKILL_TAXONOMY.items():
            lookup[canonical.lower()] = canonical
            for variant in info["variants"]:
                lookup[variant.lower()] = canonical
        _SKILL_VARIANT_LOOKUP = lookup
    return _SKILL_VARIANT_LOOKUP


def normalize_skill_name(raw: str) -> str:
    """Resolves one free-text skill entry to its canonical taxonomy name
    when it's a recognized variant (case/whitespace-insensitive) — e.g.
    "JS", "Js", " js " all resolve to "javascript". Unrecognized input is
    returned trimmed but otherwise unchanged."""
    if not raw:
        return raw
    key = " ".join(raw.strip().lower().split())
    return _get_skill_variant_lookup().get(key, raw.strip())


def normalize_skill_list(raw_list: list[str] | None) -> list[str]:
    """Applies normalize_skill_name across a list (student profile.skills,
    internship.required_skills/preferred_skills), de-duplicating case-
    insensitively so "JS" + "JavaScript" entered side by side collapse into
    one canonical entry instead of appearing as two distinct skills.
    Preserves input order of first occurrence. Returns [] for None/empty
    input rather than raising, so callers can pass an optional field
    through unconditionally."""
    if not raw_list:
        return []
    seen: set[str] = set()
    result: list[str] = []
    for raw in raw_list:
        name = normalize_skill_name(raw)
        key = name.lower()
        if key and key not in seen:
            seen.add(key)
            result.append(name)
    return result


SECTION_HEADERS = [
    "education", "experience", "work experience", "projects",
    "skills", "technical skills", "certifications", "certificates",
    "achievements", "summary", "objective", "career objective",
    "internships", "internship", "extracurricular", "hobbies",
    "hobbies & interests", "personal details",
]

# Semantic-suggestion tuning. Threshold picked via direct testing against a
# real resume with all-MiniLM-L6-v2 (the same model app/ai/embeddings.py
# uses): below ~0.5 the model starts surfacing only loosely-related noise,
# so 0.55 is a reasonably conservative cutoff that still catches genuine
# paraphrases. MAX_SUGGESTIONS caps noise on long/rambling resumes.
SUGGESTION_THRESHOLD = 0.65  # raised from 0.55 after direct testing showed false hits (e.g. a bare 'PROJECTS' header suggesting 'project management' at 0.73 was noise, but genuine hits like 'github actions' at 0.74 still clear 0.65)
MAX_SUGGESTIONS = 12

# --- Contact-link extraction -------------------------------------------------
# Captures a GitHub handle / LinkedIn slug directly out of a profile URL.
# Deliberately doesn't try to parse bare "github.com/org/repo" links as a
# personal profile — the capture group excludes "/", so a repo link simply
# won't match here, which is the correct behavior (a repo link isn't the
# candidate's profile).
GITHUB_URL_RE = re.compile(r"github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)", re.IGNORECASE)
LINKEDIN_URL_RE = re.compile(r"linkedin\.com/in/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)", re.IGNORECASE)
# Standard email/phone patterns — a resume's contact line is one of the
# highest-value fields to get right (it's how a recruiter actually reaches
# someone) but has no dedicated profile column yet, so it's surfaced in the
# response only (see parse_resume/routes.py), same treatment as
# projects/experience.
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Deliberately permissive on formatting (spaces/dashes/dots/parens, optional
# country code) since resumes are inconsistent about this, but validated by
# digit count after the fact — a bare 10-13 digit run is treated as a phone
# number, anything shorter/longer (e.g. an 8-digit year range like
# "2024-2027" or a 4-digit CGPA-adjacent number) is rejected as a false hit.
PHONE_CANDIDATE_RE = re.compile(r"(?:\+\d{1,3}[\s.-]?)?\(?\d{2,5}\)?[\s.-]?\d{3,5}[\s.-]?\d{0,5}[\s.-]?\d{0,5}")

# --- Structured-education extraction -----------------------------------------
# (pattern, canonical display name, rank). Rank picks which single row wins
# when a resume lists multiple qualifications (e.g. a bachelor's row and a
# 10th/12th row) — highest rank found anywhere in the document wins.
DEGREE_PATTERNS: list[tuple[str, str, int]] = [
    (r"ph\.?\s*d\.?|doctor of philosophy", "PhD", 6),
    (r"m\.?\s*tech\.?|master of technology", "M.Tech", 5),
    (r"m\.?\s*e\.?\b|master of engineering", "M.E.", 5),
    (r"m\.?\s*sc\.?|master of science", "M.Sc", 5),
    (r"m\.?\s*c\.?\s*a\.?\b|master of computer applications", "MCA", 5),
    (r"\bmba\b|master of business administration", "MBA", 5),
    (r"b\.?\s*tech\.?|bachelor of technology", "B.Tech", 4),
    (r"b\.?\s*e\.?\b|bachelor of engineering", "B.E.", 4),
    (r"b\.?\s*sc\.?|bachelor of science", "B.Sc", 4),
    (r"b\.?\s*c\.?\s*a\.?\b|bachelor of computer applications", "BCA", 4),
    (r"b\.?\s*com\.?|bachelor of commerce", "B.Com", 4),
    (r"b\.?\s*a\.?\b|bachelor of arts", "B.A.", 4),
    (r"\bdiploma\b", "Diploma", 3),
    (r"intermediate|higher secondary|\b12th\b|\bhsc\b", "12th / Intermediate", 2),
    (r"\b10th\b|\bcbse\b|\bicse\b|matriculation|\bssc\b", "10th / Matriculation", 1),
]
# Wrapped in an outer \b(?: ... )\b — found via direct testing that the bare
# M.E. alternative ("m\.?\s*e\.?\b") has no LEADING boundary, so it silently
# matched the "me" inside "Full Name:" (word boundary right after the "e",
# before the colon) and won outright since M.E. outranks B.Sc — a false
# "M.E." degree instead of the resume's actual B.Sc row. The outer boundary
# requires a non-word character (or start of line) immediately before the
# match too, which "Full Na|me|:" doesn't have (preceded by "a").
_COMPILED_DEGREE_PATTERNS = [
    (re.compile(r"\b(?:" + pattern + r")\b", re.IGNORECASE), name, rank)
    for pattern, name, rank in DEGREE_PATTERNS
]

CGPA_RE = re.compile(r"cgpa\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)", re.IGNORECASE)
YEAR_RANGE_RE = re.compile(r"(20\d{2})\s*[-\u2013\u2014]\s*(20\d{2})")
YEAR_SINGLE_RE = re.compile(r"\b(20\d{2})\b")

# Matches a real-resume project-title line: "Name - Short Description (Tech, Stack)".
# Testing against an actual resume found every project titled this way, with
# no blank line separating consecutive projects — so this shape is what
# extract_projects splits entries on, not blank lines.
PROJECT_TITLE_RE = re.compile(
    r"^(?P<title>.{2,90}?)\s*[-\u2013\u2014]\s*(?P<subtitle>.{2,90}?)\s*\((?P<stack>[^()]+)\)\s*$"
)

# A line starting with a bullet glyph is a description line for the entry
# above it, not a new experience/project entry of its own.
BULLET_LINE_RE = re.compile(r"^[•\-*\u2022\u25CF\u25AA\u2023]\s*")

_nlp = None
_matcher = None
_skill_embedding_matrix: np.ndarray | None = None
_skill_embedding_names: list[str] | None = None


def _get_nlp():
    """Lazy-load spaCy model — avoids paying the load cost at import time."""
    global _nlp, _matcher
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Graceful degradation per Rules.md §3 — falls back to a blank
            # English pipeline (tokenizer only) so skill matching still works
            # even if the model download failed, instead of crashing the call.
            _nlp = spacy.blank("en")
        _matcher = PhraseMatcher(_nlp.vocab, attr="LOWER")
        # Each canonical skill gets its own match rule (keyed by its own
        # name), so the match_id resolves straight back to the canonical
        # name — matching on any of its variants still reports one skill.
        for canonical, info in SKILL_TAXONOMY.items():
            patterns = [_nlp.make_doc(variant) for variant in info["variants"]]
            _matcher.add(canonical, patterns)
    return _nlp, _matcher


def _get_skill_embeddings() -> tuple[list[str], np.ndarray] | None:
    """Lazily embeds every canonical skill name once and caches the matrix
    for the lifetime of the process — this is what the semantic-suggestion
    pass compares resume text against. Returns None if embedding fails
    (e.g. model unavailable), so callers can degrade to confirmed-only
    results instead of crashing."""
    global _skill_embedding_matrix, _skill_embedding_names
    if _skill_embedding_matrix is None:
        names = sorted(SKILL_TAXONOMY.keys())
        vectors = embed_batch(names)
        if vectors is None:
            return None
        _skill_embedding_names = names
        _skill_embedding_matrix = np.array(vectors)
    return _skill_embedding_names, _skill_embedding_matrix


def extract_text(file_path: str) -> str:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    elif suffix == ".docx":
        doc = DocxDocument(file_path)
        return "\n".join(p.text for p in doc.paragraphs)
    else:
        raise ValueError(f"Unsupported resume format: {suffix}")


def detect_sections(text: str) -> list[str]:
    found = []
    lower_text = text.lower()
    for header in SECTION_HEADERS:
        # Match header at start of a line (typical resume formatting)
        if re.search(rf"^\s*{re.escape(header)}\s*:?\s*$", lower_text, re.MULTILINE):
            found.append(header)
    return found


def _normalize_hyphens(text: str) -> str:
    """See module docstring hardening note — collapses stray whitespace a
    PDF renderer can introduce around a hyphen in a hyphenated word (and,
    just as often, inside a URL slug)."""
    return re.sub(r"(?<=\w)\s*-\s*(?=\w)", "-", text)


def extract_skills_confirmed(text: str) -> list[dict]:
    """Exact taxonomy matches via spaCy PhraseMatcher. See module docstring
    for the filter_spans / hyphen-normalization hardening notes. Returns
    a list of {"name": canonical, "category": ...} dicts, sorted by
    category then name — this is what gets auto-merged into the profile."""
    normalized = _normalize_hyphens(text)
    nlp, matcher = _get_nlp()
    doc = nlp(normalized)
    matches = matcher(doc)

    spans = [Span(doc, start, end, label=match_id) for match_id, start, end in matches]
    non_overlapping_spans = spacy.util.filter_spans(spans)

    names = {nlp.vocab.strings[span.label] for span in non_overlapping_spans}
    return sorted(
        ({"name": name, "category": SKILL_TAXONOMY[name]["category"]} for name in names),
        key=lambda s: (s["category"], s["name"]),
    )


def _candidate_chunks(text: str) -> list[str]:
    """Splits resume text into short phrase-level chunks to embed and
    compare against skill embeddings — a whole-document embedding would
    blur together dozens of unrelated skills into one vague vector, so
    each chunk (roughly a comma-separated item, bullet, or clause) gets
    its own embedding instead."""
    raw_chunks = re.split(r"[\n,;•]|(?<=[a-z0-9])\.\s+(?=[A-Z])", text)
    seen: set[str] = set()
    chunks: list[str] = []
    for chunk in raw_chunks:
        cleaned = chunk.strip(" \t-:").strip()
        key = cleaned.lower()
        # Skip bare section-header words ("PROJECTS", "SKILLS", etc.) as chunks —
        # found via direct testing that a lone header like "PROJECTS" semantically
        # matches "project management" closely enough to clear the threshold,
        # which is a false hit on formatting, not real resume content.
        if len(cleaned) < 4 or key in seen or key in SECTION_HEADERS:
            continue
        seen.add(key)
        chunks.append(cleaned)
    return chunks[:200]  # bound compute on very long/rambling resumes


def suggest_skills_semantic(text: str, exclude: set[str]) -> list[dict]:
    """Semantic pass — catches skills phrased differently than the
    taxonomy's exact variants (see module docstring). Compares embeddings
    of resume phrase-chunks against embeddings of every canonical skill
    name and reports any skill (not already confirmed) whose best-matching
    chunk clears SUGGESTION_THRESHOLD. Returns [] on embedding failure or
    when no chunks clear the bar — never raises, since this is inherently
    a "maybe" signal the caller must let the student confirm, not treat as
    fact. Each result includes the chunk that triggered it, so a reviewer
    can see *why* it was suggested instead of trusting a bare score."""
    skill_embeddings = _get_skill_embeddings()
    if skill_embeddings is None:
        return []
    skill_names, skill_matrix = skill_embeddings

    chunks = _candidate_chunks(text)
    if not chunks:
        return []

    chunk_vectors = embed_batch(chunks)
    if chunk_vectors is None:
        return []
    chunk_matrix = np.array(chunk_vectors)

    # Both matrices are L2-normalized (embed_batch uses normalize_embeddings=True),
    # so a plain dot product IS cosine similarity here.
    similarity = chunk_matrix @ skill_matrix.T  # (num_chunks, num_skills)
    best_chunk_idx = similarity.argmax(axis=0)  # per skill, index of best chunk
    best_score = similarity.max(axis=0)  # per skill, that chunk's score

    suggestions = []
    for skill_idx, name in enumerate(skill_names):
        if name in exclude:
            continue
        score = float(best_score[skill_idx])
        if score >= SUGGESTION_THRESHOLD:
            suggestions.append({
                "name": name,
                "category": SKILL_TAXONOMY[name]["category"],
                "confidence": round(score, 2),
                "matched_text": chunks[int(best_chunk_idx[skill_idx])][:120],
            })

    suggestions.sort(key=lambda s: s["confidence"], reverse=True)
    return suggestions[:MAX_SUGGESTIONS]


def guess_academic_background(text: str, sections_found: list[str]) -> str | None:
    """Pull the block of text between an 'Education' header and the next
    recognized section header (or blank line), instead of a fixed line count —
    a fixed count bleeds into whatever section follows on short resumes.

    NOTE: on a real resume this can legitimately come back None even though
    the person clearly has an education section — see extract_structured_
    education's docstring for why (the actual table can extract far from its
    header). That function is the more reliable source for degree/branch/
    CGPA/year; this one stays as a free-text fallback."""
    if "education" not in sections_found:
        return None
    lines = text.splitlines()
    other_headers = {h for h in SECTION_HEADERS if h != "education"}

    for i, line in enumerate(lines):
        if line.strip().lower().startswith("education"):
            block: list[str] = []
            for next_line in lines[i + 1 :]:
                stripped = next_line.strip()
                if not stripped:
                    if block:
                        break
                    continue
                if stripped.lower().rstrip(":") in other_headers:
                    break
                block.append(stripped)
            return " ".join(block) or None
    return None


def extract_links(text: str) -> dict:
    """Pulls a GitHub username, LinkedIn profile URL, email, and phone
    number directly off the resume text, if present. Runs on
    hyphen-normalized text (see _normalize_hyphens) because the same
    stray-space-around-hyphen PDF artifact that breaks skill matching also
    breaks URL slugs — e.g. "linkedin.com/in/jane -doe" — which would
    otherwise truncate the captured slug at the first space.

    Phone extraction validates candidates by digit count (10-13 digits)
    rather than trusting the loose format regex alone — a resume's
    "2024 - 2027" year range or "CGPA: 9.31" would otherwise get matched
    as a plausible-looking phone-shaped string. Email/phone have no
    profile column yet (see routes.py), so they're only ever surfaced in
    the response, never auto-persisted."""
    normalized = _normalize_hyphens(text)
    github_match = GITHUB_URL_RE.search(normalized)
    linkedin_match = LINKEDIN_URL_RE.search(normalized)
    github_username = github_match.group(1).rstrip(".-") if github_match else None
    linkedin_slug = linkedin_match.group(1).rstrip(".-") if linkedin_match else None

    email_match = EMAIL_RE.search(normalized)
    email = email_match.group(0) if email_match else None

    phone = None
    for candidate in PHONE_CANDIDATE_RE.finditer(normalized):
        digits = re.sub(r"\D", "", candidate.group())
        if 10 <= len(digits) <= 13:
            phone = candidate.group().strip()
            break

    return {
        "github_username": github_username,
        "linkedin_url": f"https://www.linkedin.com/in/{linkedin_slug}" if linkedin_slug else None,
        "email": email,
        "phone": phone,
    }


_INSTITUTION_KEYWORDS_RE = re.compile(
    r"\b(college|university|institute|polytechnic|vidyalaya|vidyapeeth|"
    r"academy|iit|nit|iiit|school of engineering)\b",
    re.IGNORECASE,
)


def _match_college(candidate_columns: list[str]) -> dict | None:
    """Looks for an institution-name-shaped column (contains 'college',
    'university', 'institute', etc.) among a degree line's space-split
    columns, then tries to verify it against the same self-hosted AISHE
    dataset the /lookup/colleges autocomplete searches (see
    services/lookup/routes.py) — reusing that in-memory index rather than
    re-reading the CSV.

    Verification is intentionally lenient (substring containment, not exact
    match) since resumes abbreviate/format institution names inconsistently
    ("JNTU Hyderabad" vs "Jawaharlal Nehru Technological University,
    Hyderabad"). If nothing in the dataset matches, the raw extracted text
    is still returned with verified=False rather than dropped — a smaller
    or rural college that isn't in the ~43k-row dataset is exactly the case
    where the student's own resume text is the best information available,
    not a reason to discard it."""
    raw_candidate = None
    for col in candidate_columns:
        col = col.strip()
        if col and _INSTITUTION_KEYWORDS_RE.search(col):
            raw_candidate = col
            break
    if not raw_candidate:
        return None

    needle = raw_candidate.lower()
    for row in get_colleges_index():
        name = row.get("name", "")
        name_lower = name.lower()
        if name_lower and (name_lower in needle or needle in name_lower):
            return {
                "name": name,
                "location": row.get("city", ""),
                "verified": True,
            }
    return {"name": raw_candidate, "location": None, "verified": False}

def extract_structured_education(text: str) -> dict:
    """Finds the highest education level mentioned anywhere in the document
    and pulls degree/branch/CGPA/year out of that specific line — see
    module docstring for why this scans the whole document rather than a
    header-bounded block.

    Real resume rows export as space-padded columns (e.g. "B.Sc (Hons)
    Computer Science  Siva Sivani Degree College  CGPA: 9.31/10
    2024 - 2027"), so each candidate line is split on 2+-space runs into
    columns rather than pattern-matching the whole line at once. Only the
    single highest-ranked row is returned: a resume listing a bachelor's
    degree alongside 12th and 10th marks should surface the bachelor's as
    the current qualification, not all three."""
    best: dict | None = None
    best_rank = -1
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # Strip a leading "Education:"/"Qualification:" label before
        # anything else — see module docstring hardening note. A compact
        # single-line resume ("Education: B.Tech Computer Science, CGPA
        # 8.5") has no multi-space column structure to separate the header
        # from the degree row, so without this the label itself ended up
        # prepended onto the branch text below. Multi-line resumes with the
        # header on its own line are unaffected since this only strips a
        # line-leading match.
        stripped = re.sub(r"^(education|qualification)\s*:?\s*", "", stripped, flags=re.IGNORECASE)
        for pattern, canonical, rank in _COMPILED_DEGREE_PATTERNS:
            if rank <= best_rank:
                continue
            match = pattern.search(stripped)
            if not match:
                continue

            columns = re.split(r"\s{2,}", stripped)
            degree_col = columns[0] if columns else stripped

            # Branch = whatever's left of the degree column once the matched
            # degree phrase and any "(Hons)"/"(H)" honors tag are stripped.
            branch_text = pattern.sub("", degree_col, count=1)
            branch_text = re.sub(r"\(.*?\)", "", branch_text)
            # Cut off at the first comma / CGPA / percentage / year marker —
            # see module docstring hardening note. On a single-line resume
            # the degree column isn't cleanly separated from what follows
            # (CGPA, year) by 2+ spaces the way a real multi-column table
            # row is, so without this cutoff "Computer Science, CGPA 8.5"
            # ended up entirely inside branch instead of stopping at
            # "Computer Science". A real multi-column row never has these
            # markers in its own column, so this is a no-op there.
            branch_text = re.split(
                r",|\bcgpa\b|%|\b20\d{2}\b", branch_text, maxsplit=1, flags=re.IGNORECASE
            )[0]
            branch_text = re.sub(r"\s{2,}", " ", branch_text).strip(" -,:")
            branch = branch_text if rank >= 3 and branch_text else None

            cgpa_match = CGPA_RE.search(stripped)
            cgpa = float(cgpa_match.group(1)) if cgpa_match else None

            range_match = YEAR_RANGE_RE.search(stripped)
            if range_match:
                year = int(range_match.group(2))
            else:
                single_match = YEAR_SINGLE_RE.search(stripped)
                year = int(single_match.group(1)) if single_match else None

            college_match = _match_college(columns)
            best = {
                "degree": canonical,
                "branch": branch,
                "cgpa": cgpa,
                "year": year,
                "college": college_match["name"] if college_match else None,
                "college_location": college_match["location"] if college_match else None,
                "college_verified": college_match["verified"] if college_match else False,
            }
            best_rank = rank
            break  # one degree match per line is enough
    return best or {
        "degree": None, "branch": None, "cgpa": None, "year": None,
        "college": None, "college_location": None, "college_verified": False,
    }


def _section_lines(text: str, header: str) -> list[str]:
    """Raw non-empty lines between `header` (matched as a standalone line,
    same as detect_sections) and the next recognized section header, or
    end of document."""
    lines = text.splitlines()
    other_headers = {h for h in SECTION_HEADERS if h != header}
    collecting = False
    block: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not collecting:
            if stripped.lower().rstrip(":") == header:
                collecting = True
            continue
        if not stripped:
            continue
        if stripped.lower().rstrip(":") in other_headers:
            break
        block.append(stripped)
    return block


def extract_projects(text: str) -> list[dict]:
    """Splits the PROJECTS section into individual entries. See module
    docstring / PROJECT_TITLE_RE comment: direct testing against a real
    resume found every project titled "Name - Description (Tech, Stack)"
    on its own line, immediately followed by description lines with no
    blank line before the next project — so a title line is what entries
    split on, not blank lines (this resume format doesn't have any).

    Falls back to bullet-grouping (same approach as extract_experience) for
    projects that don't follow the "(Tech, Stack)" title convention — e.g.
    a bolded/plain project name line followed by "• built X" bullets —
    since not every resume format uses parenthesized tech stacks."""
    lines = _section_lines(text, "projects")
    entries: list[dict] = []
    current: dict | None = None
    for line in lines:
        title_match = PROJECT_TITLE_RE.match(line)
        if title_match:
            if current:
                entries.append(current)
            stack = [s.strip() for s in title_match.group("stack").split(",") if s.strip()]
            current = {
                "title": f"{title_match.group('title').strip()} - {title_match.group('subtitle').strip()}",
                "tech_stack": stack,
                "description": "",
            }
            continue

        bullet_match = BULLET_LINE_RE.match(line)
        line_text = line[bullet_match.end():].strip() if bullet_match else line
        if current is None:
            # No title-shaped line seen yet — start a bare entry so project
            # formats that skip the "(Tech, Stack)" suffix still surface
            # for review instead of being silently dropped.
            current = {"title": line_text, "tech_stack": [], "description": ""}
        else:
            current["description"] = (current["description"] + " " + line_text).strip()
    if current:
        entries.append(current)
    return entries


def extract_certifications(text: str) -> list[str]:
    """Pulls one-line entries out of the CERTIFICATIONS/CERTIFICATES section.
    Real resumes format this section far too inconsistently to reliably
    split into structured issuer/date fields (unlike PROJECT_TITLE_RE's
    fairly consistent "Name - Description (Stack)" shape) -- so this
    deliberately returns raw lines rather than fabricating a structured
    breakdown the source text doesn't actually support. Bullet prefixes are
    stripped since they're formatting, not content; a bullet line is folded
    into the previous entry only when it's clearly a continuation (rare for
    this section, but mirrors extract_experience's bullet handling for
    consistency) -- otherwise each non-empty line is its own entry.
    """
    entries: list[str] = []
    for header in ("certifications", "certificates"):
        lines = _section_lines(text, header)
        if not lines:
            continue
        for line in lines:
            bullet_match = BULLET_LINE_RE.match(line)
            line_text = line[bullet_match.end():].strip() if bullet_match else line.strip()
            if line_text:
                entries.append(line_text)
        return entries
    return entries


def extract_experience(text: str) -> list[dict]:
    """Groups an EXPERIENCE/INTERNSHIPS section into entries. A line is
    treated as the start of a new entry unless it's a bullet point
    (•, -, *, etc.) describing the entry above it — see module docstring
    hardening note: real resumes commonly list a company/role/date title
    line followed by bullet-point responsibilities, so a flat
    one-entry-per-line approach (the previous behavior) split those
    bullets into separate fake entries instead of folding them into a
    description. A resume with no bullets at all (a bare one-line
    internship title) still produces exactly one entry with an empty
    description, same as before."""
    for header in ("internship", "internships", "experience", "work experience"):
        lines = _section_lines(text, header)
        if not lines:
            continue
        entries: list[dict] = []
        current: dict | None = None
        for line in lines:
            bullet_match = BULLET_LINE_RE.match(line)
            if bullet_match and current:
                bullet_text = line[bullet_match.end():].strip()
                current["description"] = (current["description"] + " " + bullet_text).strip()
            else:
                if current:
                    entries.append(current)
                current = {"title": BULLET_LINE_RE.sub("", line).strip(), "description": ""}
        if current:
            entries.append(current)
        return entries
    return []


def compute_profile_completeness_score(profile) -> int:
    """
    Replaces the frontend's previously hardcoded `resumeScore: 0` (M5 audit
    fix -- see nexyuva_supplemental_audit.docx). This is deliberately a
    *completeness/readiness* signal built from fields we can actually
    verify are present on the profile, not a semantic judgment of resume
    quality (that would need a much larger scoring model and real labeled
    data neither of which exist here -- see Rules.md Section3, don't fabricate
    a number to look sophisticated).

    Weighted out of 100:
      - resume file uploaded at all: 20
      - skills present (scales up to 10 skills, then caps): 25
      - bio present: 10
      - GitHub linked: 10, plus up to 10 more scaled from github_score
        (real signal computed by app/ai/github_agent.py, see H2 fix)
      - LinkedIn linked: 10
      - education complete (degree + branch + cgpa + year all present): 15

    Recomputed fresh on every profile read rather than persisted, so it's
    never stale -- the moment a resume upload fills in skills/degree/
    branch/cgpa/github/linkedin (see upload_resume in
    services/student/routes.py), the very next profile fetch reflects it
    with no separate write path to keep in sync.
    """
    score = 0.0

    if profile.resume_path:
        score += 20

    skills_count = len(profile.skills or [])
    score += min(skills_count / 10, 1.0) * 25

    if profile.bio:
        score += 10

    if profile.github_username:
        score += 10
        if profile.github_score is not None:
            score += min(profile.github_score / 100, 1.0) * 10

    if profile.linkedin_url or profile.linkedin_verified:
        score += 10

    education_fields = (profile.degree, profile.branch, profile.cgpa, profile.year)
    if all(f is not None and f != "" for f in education_fields):
        score += 15

    return round(min(score, 100))


def parse_resume(file_path: str) -> dict:
    """Full pipeline. Never raises past this point without a clear message —
    callers should catch and degrade to manual-entry mode per Rules.md §3.

    The semantic-suggestion pass is best-effort on top of the confirmed
    pass: if embeddings fail for any reason, confirmed results are still
    returned in full and suggested_skills is simply empty, rather than
    failing the whole request. links/education/projects/experience are all
    deterministic regex passes (same reliability class as confirmed_skills)
    and don't depend on embeddings at all."""
    text = extract_text(file_path)
    sections = detect_sections(text)
    confirmed = extract_skills_confirmed(text)
    confirmed_names = {s["name"] for s in confirmed}

    try:
        suggested = suggest_skills_semantic(text, exclude=confirmed_names)
    except Exception:
        logger.exception("Semantic skill suggestion failed — continuing with confirmed skills only")
        suggested = []

    academic_guess = guess_academic_background(text, sections)
    links = extract_links(text)
    education = extract_structured_education(text)
    projects = extract_projects(text)
    experience = extract_experience(text)
    certifications = extract_certifications(text)

    return {
        "confirmed_skills": confirmed,
        "suggested_skills": suggested,
        "academic_background_guess": academic_guess,
        "raw_sections_found": sections,
        "links": links,
        "education": education,
        "projects": projects,
        "experience": experience,
        "certifications": certifications,
    }
