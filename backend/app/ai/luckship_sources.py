"""
Luckship (student-side AI opportunity hunter): external source connectors.

Unlike recommendation_engine.py (which ranks NexYuva's own Internship rows),
Luckship goes OUTSIDE NexYuva -- it hunts public job/internship boards via
their APIs and normalizes whatever comes back into one common shape so the
scoring layer (luckship_scoring.py) never has to know which source an
opportunity came from.

Design mirrors the rest of the AI layer's graceful-degradation rule
(Rules.md Section 3): each source is independently try/excepted. If a source
is down, unreachable, or rate-limited, Luckship simply returns fewer results
instead of failing the whole hunt -- the student should never see a 500
because one external API had a bad day.

Sources wired up:
  - Remotive (https://remotive.com/api/remote-jobs): free, no API key,
    real remote jobs/internships with real employer/title/description/
    tags/location data. Good default source for a solo/contest build with
    zero external credentials configured yet.
  - Arbeitnow (https://www.arbeitnow.com/api/job-board-api): free, no API
    key. Mixed on-site + remote listings (mostly European market) -- we
    filter to remote-only client-side since Luckship is a remote-first hunt.
  - RemoteOK (https://remoteok.com/api): free, no API key, but requires a
    real User-Agent header or the API blocks the request. The first array
    element is a legal/attribution notice, not a job -- must be skipped.
  - Jobicy (https://jobicy.com/api/v2/remote-jobs): free, no API key,
    remote-only listings with structured salary fields when disclosed.

Adding a new source later = write one `_fetch_<name>` function returning
list[RawOpportunity] and add it to SOURCES below. Nothing else changes.
"""
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger("nexyuva.luckship")


@dataclass
class RawOpportunity:
    """Common shape every external source gets normalized into."""

    source: str
    external_id: str
    title: str
    company: str
    location: str | None
    remote: bool
    url: str
    description: str
    tags: list[str] = field(default_factory=list)
    posted_at: str | None = None


async def _fetch_remotive(query: str, limit: int = 40) -> list[RawOpportunity]:
    """
    Remotive's public API (no auth). `search` matches title/description/tags
    server-side; we still re-rank locally in luckship_scoring.py against the
    student's full profile -- this is just to keep the candidate pool
    relevant and small before that.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://remotive.com/api/remote-jobs",
                params={"search": query, "limit": limit},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("Remotive fetch failed for query=%r", query)
        return []

    results = []
    for job in data.get("jobs", []):
        results.append(
            RawOpportunity(
                source="remotive",
                external_id=str(job.get("id")),
                title=job.get("title", "Untitled role"),
                company=job.get("company_name", "Unknown company"),
                location=job.get("candidate_required_location"),
                remote=True,
                url=job.get("url", ""),
                description=job.get("description", ""),
                tags=job.get("tags", []) or [],
                posted_at=job.get("publication_date"),
            )
        )
    return results


async def _fetch_arbeitnow(query: str, limit: int = 40) -> list[RawOpportunity]:
    """
    Arbeitnow's public job-board API (no auth, no server-side search param).
    Its remote-job pool is small (mostly European market, only a handful of
    the ~175 listings per page are remote) -- filtering that pool further by
    a strict query match left almost nothing. Scoring already re-ranks every
    opportunity against the student's real skills (luckship_scoring.py), so
    this just returns every remote listing and lets that layer decide
    relevance, the same way a source with no query support should behave.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://www.arbeitnow.com/api/job-board-api")
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("Arbeitnow fetch failed for query=%r", query)
        return []

    results = []
    for job in data.get("data", []):
        if not job.get("remote"):
            continue
        results.append(
            RawOpportunity(
                source="arbeitnow",
                external_id=str(job.get("slug", job.get("url", ""))),
                title=job.get("title", "Untitled role"),
                company=job.get("company_name", "Unknown company"),
                location=job.get("location"),
                remote=True,
                url=job.get("url", ""),
                description=job.get("description", ""),
                tags=job.get("tags", []) or [],
                posted_at=str(job.get("created_at")) if job.get("created_at") else None,
            )
        )
        if len(results) >= limit:
            break
    return results


async def _fetch_remoteok(query: str, limit: int = 40) -> list[RawOpportunity]:
    """
    RemoteOK's public API (no auth, but requires a real User-Agent or the
    request gets blocked). It has no server-side search and only ever
    returns the latest ~100 jobs across every category, not just tech --
    a strict local keyword match against that small, mixed batch routinely
    finds zero results for a specific query. Same reasoning as Arbeitnow:
    return the batch as-is and let scoring (luckship_scoring.py) rank by
    actual skill overlap against the student's profile.
    The first element of the response array is a legal notice, not a job.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://remoteok.com/api",
                headers={"User-Agent": "Mozilla/5.0 (compatible; NexYuvaLuckship/1.0)"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("RemoteOK fetch failed for query=%r", query)
        return []

    results = []
    for job in data[1:]:  # skip legal-notice first element
        title = job.get("position") or job.get("title", "")
        results.append(
            RawOpportunity(
                source="remoteok",
                external_id=str(job.get("id", job.get("slug", ""))),
                title=title or "Untitled role",
                company=job.get("company", "Unknown company"),
                location=job.get("location") or None,
                remote=True,
                url=job.get("url", ""),
                description=job.get("description", ""),
                tags=job.get("tags", []) or [],
                posted_at=job.get("date"),
            )
        )
        if len(results) >= limit:
            break
    return results


async def _fetch_jobicy(query: str, limit: int = 40) -> list[RawOpportunity]:
    """
    Jobicy's public v2 API (no auth). `tag` searches title/description
    server-side like Remotive's `search`, so no local filtering needed here.

    NOTE: despite Jobicy's own docs describing `jobIndustry` as a single
    string, the live API actually returns it as a list[str] (e.g.
    ["Software Engineering"]). Wrapping that directly in another list here
    used to produce a list-of-lists in `tags`, which crashed skill scoring
    downstream (luckship_scoring.py does `' '.join(opp.tags)`) for every
    Jobicy result -- silently killing the whole hunt request, not just
    Jobicy's share of it. Normalize defensively so a future API shape
    change degrades gracefully instead of taking the endpoint down again.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://jobicy.com/api/v2/remote-jobs",
                params={"count": min(limit, 50), "tag": query},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("Jobicy fetch failed for query=%r", query)
        return []

    results = []
    for job in data.get("jobs", []):
        industry = job.get("jobIndustry")
        if isinstance(industry, list):
            tags = [str(t) for t in industry if t]
        elif industry:
            tags = [str(industry)]
        else:
            tags = []

        results.append(
            RawOpportunity(
                source="jobicy",
                external_id=str(job.get("id")),
                title=job.get("jobTitle", "Untitled role"),
                company=job.get("companyName", "Unknown company"),
                location=job.get("jobGeo"),
                remote=True,
                url=job.get("url", ""),
                description=job.get("jobDescription", "") or job.get("jobExcerpt", ""),
                tags=tags,
                posted_at=job.get("pubDate"),
            )
        )
    return results


# Registry of live sources. Each entry: (name, async fn(query, limit) -> list[RawOpportunity])
SOURCES = [
    ("remotive", _fetch_remotive),
    ("arbeitnow", _fetch_arbeitnow),
    ("remoteok", _fetch_remoteok),
    ("jobicy", _fetch_jobicy),
]


async def hunt_external_opportunities(
    queries: list[str], limit_per_query: int = 25
) -> list[RawOpportunity]:
    """
    Runs every registered source against every query, dedupes by
    (source, external_id), and returns the merged pool. Queries are derived
    from the student's profile (preferred_domains, top skills) upstream in
    luckship_scoring.py -- this function stays source-plumbing only.

    The pool is interleaved round-robin across sources rather than appended
    source-by-source. rank_matches() sorts by (has_skills, score), and a lot
    of external postings tie at the same score (e.g. 0.0 when nothing
    taxonomy-recognizable overlaps) -- Python's sort is stable, so ties keep
    whatever order they arrived in. Appending source blocks meant the last
    registered source (originally Jobicy) could get shut out of every
    top_k cut entirely once earlier sources alone filled it, no matter how
    good Jobicy's own matches were. Interleaving means a tie is decided by
    "first per source, round-robin" instead of "which source got fetched
    first", so every source gets a fair shot at the top_k cut.
    """
    seen: set[tuple[str, str]] = set()
    per_source: dict[str, list[RawOpportunity]] = {}

    for query in queries:
        for source_name, fetch_fn in SOURCES:
            try:
                raw_results = await fetch_fn(query, limit_per_query)
            except Exception:
                logger.exception("Source %s errored on query=%r", source_name, query)
                continue
            for opp in raw_results:
                key = (opp.source, opp.external_id)
                if key not in seen:
                    seen.add(key)
                    per_source.setdefault(opp.source, []).append(opp)

    pool: list[RawOpportunity] = []
    buckets = list(per_source.values())
    i = 0
    while buckets:
        if i >= len(buckets):
            i = 0
        bucket = buckets[i]
        pool.append(bucket.pop(0))
        if not bucket:
            buckets.pop(i)
        else:
            i += 1

    return pool
