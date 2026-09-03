"""
Lookup service (colleges + cities) - Architecture.md.

Colleges: self-hosted, in-memory search over data/colleges.csv (~43k
Indian colleges, sourced from data.gov.in's AISHE survey via
github.com/PriyanKishoreMS/colleges-api's data dump - that project's own
live API is discontinued (README: "RDS instance is discontinued"), and no
other free public Indian-college API responded reliably when checked, so
we host the raw dataset ourselves instead of depending on a third party.
Loaded once at import time and searched in-process; no DB table needed
since this is static reference data, not user data.

Cities: proxied to India Post's official Pincode API
(api.postalpincode.in) - free, keyless, no rate-limit issues seen in
testing. Switched to this from countries.dev/cities (GeoNames-backed),
which turned out to have very thin India coverage in practice - it 404s
on most queries and only resolves a handful of major city names, so
students from smaller towns, Hyderabad localities (e.g. Suraram,
Kompally) or rural areas got nothing. India Post's post-office directory
covers villages and localities too, since it's built for mail delivery,
not just city listings - a much better fit for students outside major
metros.
"""
import csv
import logging
from pathlib import Path

from fastapi import APIRouter, Query
import httpx

logger = logging.getLogger("nexyuva.lookup")

router = APIRouter(prefix="/api/v1/lookup", tags=["lookup"])

_COLLEGES_CSV = Path(__file__).resolve().parents[3] / "data" / "colleges.csv"
_colleges: list[dict] = []


def _load_colleges() -> list[dict]:
    if not _COLLEGES_CSV.exists():
        logger.warning("colleges.csv not found at %s - college search will return no results", _COLLEGES_CSV)
        return []
    with open(_COLLEGES_CSV, encoding="utf-8", errors="replace") as f:
        rows = list(csv.DictReader(f))
    logger.info("Loaded %d colleges from %s", len(rows), _COLLEGES_CSV)
    return rows


_colleges = _load_colleges()


def get_colleges_index() -> list[dict]:
    """Public accessor for the in-memory colleges list, so other modules
    (resume_parser.py's institution-name extraction) can reuse the same
    already-loaded ~43k-row dataset instead of re-reading the CSV."""
    return _colleges


@router.get("/colleges")
async def search_colleges(q: str = Query(..., min_length=2), limit: int = Query(10, le=25)):
    """Substring match on college name, case-insensitive. Good enough for
    autocomplete - a full fuzzy/ranked search isn't worth the complexity
    for a dropdown of this size."""
    needle = q.strip().lower()
    if not needle:
        return {"results": []}

    matches = []
    for row in _colleges:
        name = row.get("name", "")
        if needle in name.lower():
            matches.append({
                "name": name,
                "city": row.get("city", ""),
                "state": row.get("state", ""),
            })
            if len(matches) >= limit:
                break
    return {"results": matches}


@router.get("/cities")
async def search_cities(q: str = Query(..., min_length=2), limit: int = Query(10, le=25)):
    """Proxies India Post's postoffice-by-name endpoint, which doubles as a
    town/locality/village search - proxied through our backend (rather than
    called directly from the browser) so the frontend doesn't hardcode a
    third-party domain and we have one place to swap providers if this one
    ever goes down.

    Results are deduped by (name, district, state) since the same locality
    name often has several post offices (one per pincode) - the frontend
    only needs one entry per place, not one per pincode."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"https://api.postalpincode.in/postoffice/{q.strip()}")
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("City lookup failed for query %r", q)
        return {"results": []}

    if not data or data[0].get("Status") != "Success":
        return {"results": []}

    seen = set()
    matches = []
    for po in data[0].get("PostOffice") or []:
        name = po.get("Name", "")
        district = po.get("District", "")
        state = po.get("State", "")
        key = (name, district, state)
        if not name or key in seen:
            continue
        seen.add(key)
        matches.append({"name": name, "district": district, "state": state})
        if len(matches) >= limit:
            break
    return {"results": matches}
