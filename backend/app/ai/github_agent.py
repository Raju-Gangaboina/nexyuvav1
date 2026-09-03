"""
GitHub Intelligence Agent (Architecture.md §11). Fully real, ToS-compliant —
GitHub's public API is designed for exactly this kind of read access.

Two tiers of data:
  - Unauthenticated REST calls (60 req/hr): repos, languages, stars, README presence
  - Authenticated GraphQL call (needs GITHUB_TOKEN): contribution calendar

If GITHUB_TOKEN isn't configured, contribution-calendar scoring is skipped
gracefully (Rules.md §3) — the rest of the score still computes from REST data.
"""
import asyncio
import json
import logging

import httpx

from app.core.config import settings
from app.core.event_bus import get_redis_client

logger = logging.getLogger("nexyuva.github_agent")

GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"

# H2 fix: cache fetched profile/repo data so a repeat sync for the same
# username within the TTL costs zero GitHub API calls. 1 hour matches the
# per-user rate limit window (H1's 5/hour) -- a student re-syncing to
# refresh their score won't usually see new activity inside an hour anyway.
_CACHE_TTL_SECONDS = 3600
_CACHE_KEY_PREFIX = "nexyuva:github_profile_cache:"

# H2 fix: bound how many repos are fetched concurrently. Parallelizing
# doesn't reduce total call count against the quota, but it cuts wall-clock
# time from ~40 sequential round trips to a handful of concurrent batches,
# and a semaphore keeps this from bursting all 20 repos x 2 calls at once
# (impolite to GitHub, and more likely to trip abuse-detection than the
# same calls spread over a couple seconds).
_CONCURRENT_REPO_FETCHES = 5


class GitHubRateLimitError(Exception):
    """Raised when GitHub's rate limit is hit — callers should surface this
    as a clear, retryable error to the user, not a generic 500."""


async def _rest_get(client: httpx.AsyncClient, path: str) -> dict | list | None:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    resp = await client.get(f"{GITHUB_API}{path}", headers=headers, timeout=10.0)
    if resp.status_code == 404:
        return None
    if resp.status_code == 403 and "rate limit" in resp.text.lower():
        raise GitHubRateLimitError(
            "GitHub API rate limit exceeded. Unauthenticated requests are "
            "capped at 60/hr — set GITHUB_TOKEN in .env for 5,000/hr."
        )
    resp.raise_for_status()
    return resp.json()


def _cache_key(username: str) -> str:
    return f"{_CACHE_KEY_PREFIX}{username.lower()}"


async def _get_cached_profile(username: str) -> dict | None:
    redis = await get_redis_client()
    if redis is None:
        return None
    try:
        raw = await redis.get(_cache_key(username))
    except Exception:
        logger.exception("Redis GET failed for github profile cache (username=%s)", username)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("Corrupt github profile cache entry for %s — ignoring", username)
        return None


async def get_cached_languages(username: str) -> dict[str, int] | None:
    """
    Read-only cache lookup for a username's per-language byte counts — never
    triggers a live GitHub API call, unlike fetch_public_profile. Used by
    app/ai/skill_confidence.py to attach GitHub evidence to a Sourcing
    result for potentially dozens of candidates in one request; going
    through the real fetch path for that many candidates would risk
    exhausting the 60/hr unauthenticated GitHub quota (or even the 5,000/hr
    authenticated one, under enough concurrent sourcing requests) for
    nothing but a page of skill-confidence badges. A candidate who hasn't
    synced recently (cache expired) simply contributes no GitHub evidence
    for that request rather than forcing a live fetch — same
    graceful-degradation contract as the rest of this module.
    """
    profile = await _get_cached_profile(username)
    if profile is None:
        return None
    return profile.get("languages")


async def _set_cached_profile(username: str, profile: dict) -> None:
    redis = await get_redis_client()
    if redis is None:
        return
    try:
        await redis.set(_cache_key(username), json.dumps(profile), ex=_CACHE_TTL_SECONDS)
    except Exception:
        logger.exception("Redis SET failed for github profile cache (username=%s)", username)


async def _fetch_repo_signals(
    client: httpx.AsyncClient, semaphore: asyncio.Semaphore, username: str, repo: dict
) -> tuple[int, dict, bool, bool]:
    """Returns (stars, language_bytes_map, has_content, has_readme) for one repo."""
    stars = repo.get("stargazers_count", 0)
    async with semaphore:
        langs = await _rest_get(client, f"/repos/{username}/{repo['name']}/languages")
        readme = await _rest_get(client, f"/repos/{username}/{repo['name']}/readme")
    return stars, (langs or {}), bool(langs), readme is not None


async def fetch_public_profile(username: str, *, force_refresh: bool = False) -> dict:
    """
    Returns a dict with raw signals — never raises past this function for a
    valid username; a missing/private profile raises ValueError with a clear
    message so the route layer can turn it into a proper 404.

    H2 fix: checks a Redis-backed cache first (TTL below), so a repeat sync
    for the same username within the window costs zero GitHub API calls.
    Pass force_refresh=True to bypass the cache (e.g. a manual "refresh now"
    action in the UI).
    """
    if not force_refresh:
        cached = await _get_cached_profile(username)
        if cached is not None:
            logger.info("github profile cache hit for %s", username)
            return cached

    async with httpx.AsyncClient() as client:
        user = await _rest_get(client, f"/users/{username}")
        if user is None:
            raise ValueError(f"GitHub user '{username}' not found")

        repos = await _rest_get(client, f"/users/{username}/repos?per_page=100&sort=updated")
        repos = repos or []

        # Filter out forks — forked repos shouldn't inflate a student's own
        # contribution signal
        own_repos = [r for r in repos if not r.get("fork")][:20]  # cap at 20 repos

        semaphore = asyncio.Semaphore(_CONCURRENT_REPO_FETCHES)
        per_repo_results = await asyncio.gather(
            *(_fetch_repo_signals(client, semaphore, username, repo) for repo in own_repos)
        )

        language_totals: dict[str, int] = {}
        total_stars = 0
        repos_with_readme = 0
        repos_with_content = 0  # repos with at least some detected code — see
        # compute_github_score's HARDENING NOTE for why this is tracked
        # separately from raw public_repos_count

        for stars, langs, has_content, has_readme in per_repo_results:
            total_stars += stars
            if has_content:
                repos_with_content += 1
            for lang, bytes_count in langs.items():
                language_totals[lang] = language_totals.get(lang, 0) + bytes_count
            if has_readme:
                repos_with_readme += 1

        contribution_total = await _fetch_contribution_count(username)

        profile = {
            "username": username,
            "public_repos_count": len(own_repos),
            "repos_with_content": repos_with_content,
            "total_stars": total_stars,
            "languages": language_totals,
            "repos_with_readme": repos_with_readme,
            "contribution_total_last_year": contribution_total,  # None if no token
            "account_created_at": user.get("created_at"),
        }

        await _set_cached_profile(username, profile)
        return profile


async def _fetch_contribution_count(username: str) -> int | None:
    if not settings.GITHUB_TOKEN:
        logger.info("GITHUB_TOKEN not set — skipping contribution calendar fetch")
        return None

    query = """
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
        }
      }
    }
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GITHUB_GRAPHQL,
                json={"query": query, "variables": {"login": username}},
                headers={"Authorization": f"Bearer {settings.GITHUB_TOKEN}"},
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["data"]["user"]["contributionsCollection"]["contributionCalendar"][
                "totalContributions"
            ]
    except Exception:
        logger.exception("GitHub GraphQL contribution fetch failed")
        return None


def compute_github_score(profile_data: dict) -> float:
    """
    Deterministic, explainable scoring (0-100) — every sub-score is itself
    the XAI explanation, no black box. Weights are a starting point, tune
    against real student data once you have some.

    HARDENING NOTES (found via edge-case testing, not assumed correct):
    - Originally used raw `public_repos_count` for the repo-count sub-score.
      Tested a profile with 50 completely empty repos (no code, no readmes,
      no stars) and it still scored 31.2/100 purely from repo quantity —
      a real gaming vector, since anyone can create empty repos for free.
      Fixed to use `repos_with_content` (repos where GitHub's languages API
      returned at least one language) instead, so quantity alone no longer
      buys score without actual code behind it.
    - `readme_ratio` wasn't clamped to [0,1]. Under a data inconsistency
      where repos_with_readme could exceed repo count (shouldn't happen
      from fetch_public_profile's own counting logic, but nothing enforced
      it), the readme sub-score could exceed its intended 15-point weight.
      Clamped defensively regardless of whether the inconsistency is
      reachable through the current call path.
    """
    repo_count = profile_data.get("repos_with_content", profile_data["public_repos_count"])
    repo_score = min(repo_count / 10, 1.0) * 25  # 10+ substantive repos = full marks

    lang_diversity = len(profile_data["languages"])
    diversity_score = min(lang_diversity / 5, 1.0) * 20  # 5+ languages = full marks

    stars = profile_data["total_stars"]
    stars_score = min(stars / 20, 1.0) * 20  # 20+ stars = full marks

    readme_ratio = (
        profile_data["repos_with_readme"] / repo_count if repo_count > 0 else 0
    )
    readme_ratio = min(readme_ratio, 1.0)  # defensive clamp — see hardening note above
    readme_score = readme_ratio * 15

    contributions = profile_data.get("contribution_total_last_year")
    if contributions is not None:
        contribution_score = min(contributions / 200, 1.0) * 20  # 200+ = full marks
    else:
        # No token configured — redistribute this weight across the other
        # signals rather than silently give a lower max score
        contribution_score = 0
        repo_score *= 1.25
        diversity_score *= 1.25
        stars_score *= 1.25
        readme_score *= 1.25

    total = repo_score + diversity_score + stars_score + readme_score + contribution_score
    return round(min(total, 100.0), 1)
