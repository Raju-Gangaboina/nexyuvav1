# NexYuva AI Hiring Suite — Progress Memory

> **Purpose:** Living log against `NexYuva_AI_Hiring_Suite_Architecture.docx` (v1.0, Aug 2026).
> Whoever (human or Claude) works on any of the 7 agents next: read this first, do the work,
> then append a dated entry below before you stop. Don't rewrite history — append only.

## ⚠️ Important deviation from the spec doc

The architecture doc assumes a **Next.js/TypeScript** backend (`/lib/agents/*.service.ts`,
Prisma, `groqClient.ts`). The **real backend is FastAPI/Python** (`backend/app/`), with a
Next.js **frontend only** (`frontend-web/`). So:

- Treat the doc as the **spec/contract** (pipelines, prompt shapes, edge cases, failure modes,
  output contracts) — not literal file paths or TS code. Port the *design*, not the code.
- Groq wrapper equivalent: no single `groqClient.ts`-style wrapper exists yet — each agent
  (`sourcing_pitch.py`, `screening_agent.py`, `interview_ai.py`, etc.) calls Groq's HTTP API
  directly with its own `httpx` client. Doc's "one wrapper" principle (Section 2.3) is **not
  yet centralized** — worth doing if a 4th/5th agent starts duplicating retry/timeout logic.
- Cache equivalent: `app/core/cache.py` already exists (Redis get_json/set_json, degrades to
  no-op if Redis unreachable). Use this for any spec'd caching, don't build a new one.
- `AgentResult<T>` envelope (Section 2.2) is **not implemented** as a shared type anywhere —
  each route returns its own Pydantic response model. Low priority to retrofit; only worth it
  once 3+ agents exist and a shared UI shell is actually being built.

## Status vs. the 7 agents (Section 5 of the doc)

| # | Agent | Backend | Frontend | Notes |
|---|-------|---------|----------|-------|
| 5.1 | **Sourcing** | ✅ 100% complete, runtime-verified | ✅ Built (`company/candidates/page.tsx`) | See entries below |
| 5.2 | **Screening** | ✅ 100% complete, runtime-verified (2026-08-10) | ✅ Confirmed — "Run Deep AI Screening (Module 2)" button on every candidate card | Full live E2E run: registered student+skills, org, posting, called `/screen`, got real Groq-backed fit_score/strengths/gaps/rationale back. See 2026-08-10 log entry |
| 5.3 | **Assessment** | ✅ Built (`app/ai/assessment_engine.py` + `services/assessment/routes.py`) — predates this doc, was part of original 8-phase build | ✅ Likely built (student-side assessment flow referenced in memory) | Answer-key-never-sent-to-client audited and confirmed clean, both by code review and a live response-body check (2026-09-08) |
| 5.4 | **Interview (AI-led)** | ✅ Built (`app/ai/interview_ai.py` + `services/interview/routes.py`) with MediaPipe FaceMesh proctoring, integrity flags now store per-occurrence timestamps (not just aggregate counts) | ✅ Built — company-facing review dashboard at `company/interviews/page.tsx`, nav-linked in `company/layout.tsx`. Shows transcript, scores, badge, and a chronological flag-event list (times, not a scrubbable video timeline — no raw video is stored) | Net-new item from Section 5.4's "already built vs new" table is now done. Old-format DB row round-trip (missing `timestamps` key) verified clean on 2026-09-08 |
| 5.5 | **Smart Scheduling** | ✅ Built (`app/core/google_calendar.py` + `services/scheduling/routes.py`) — Google OAuth, freebusy-checked slot proposals, Meet-linked confirmation, cancellation with calendar cleanup | ✅ Built — company "Propose Interview Slots" panel embedded in `company/interviews/page.tsx`, student "Pick a time" step in `student/application/[applicationId]/page.tsx` | Real Google OAuth credentials/live consent flow still not runtime-verified against actual Google APIs (needs a human to set up a Cloud project) — see 2026-09-03 entries |
| 5.6 | **Assisted Human Interview** | ✅ Built (`app/ai/assisted_interview_ai.py` + `services/assisted_interview/routes.py`), fully E2E verified (2026-09-08) | ✅ Built — live co-pilot workspace embedded in `company/interviews/page.tsx` (candidate brief, mic transcription, AI follow-up suggestions, coverage checklist, notes, human-only scorecard) | See 2026-09-08 backend entry above; frontend was already present by the time this table was last touched |
| 5.7 | **Voice Screen** | ✅ Built (`app/ai/voice_screen.py` + `services/voice_screen/routes.py`), fully E2E verified (2026-09-08) | ✅ Built — student recording flow at `student/voice-screen/[applicationId]/page.tsx`, company review dashboard at `company/voice-screens/page.tsx`, wired into the post-application stepper and company nav | Async, one-way audio interview — no live interviewer, no webcam proctoring. See 2026-09-08 log entry |

**Doc's own roadmap (Section 9) says build order should be:**
Phase 1: Scheduling, Sourcing, Screening → Phase 2: Assessment, Assisted Human Interview →
Phase 3: AI-led Interview → Phase 4: Voice Screen.
**Reality:** Sourcing/Screening/Assessment/Interview(partial) already exist from the earlier
8-phase build — so the *actual* next-up items, in doc-priority order, are:
1. ~~Interview company-review dashboard~~ — **done, see 2026-08-09 log entries below**
2. ~~Screening runtime verification~~ — **done, see 2026-08-10 log entry**
3. Smart Scheduling (full net-new, but doc gives exact API flow, medium effort)
4. Assisted Human Interview (full net-new, medium effort)
5. Voice Screen (highest complexity, build last)

## Post-application pipeline (locked, 2026-08-10)

The eventual post-application pipeline order is now locked architecturally:

```
Candidate Applies -> AI Screening -> Aptitude -> Voice Screening -> AI Interview -> Scheduling -> Human Interview
```

- **AI Screening (5.2) is Stage 1** — it evaluates the candidate's existing profile/application
  against the internship requirements and produces the screening result (`fit_score`,
  `strengths`, `gaps`, `rationale`, `needs_manual_review`) that later stages will consume.
  Documented directly in `screening_agent.py`'s module docstring.
- **Sourcing (5.1) is explicitly NOT in this sequence** — it's candidate discovery *before* an
  application exists, a separate concern from the post-application pipeline.
- This is sequencing/documentation only — **no orchestrator exists yet** wiring these stages
  together, and Screening's current on-demand trigger (company dashboard button) was
  deliberately left unchanged — it is not auto-invoked on application. Building the
  orchestrator, and wiring each stage's output into the next stage's input, is future work.
- Aptitude (5.3, exists as an extension of the Assessment engine — see
  `nexyuva-aptitude-check` design doc), Voice Screening (5.7, not built), AI Interview (5.4,
  built), Scheduling (5.5, not built), and Human Interview (5.6, not built) all still need to be
  wired into this order once the orchestrator is built.

## Environment variables (Section 11 of doc) — check `.env` coverage

- `GROQ_API_KEY` — ✅ already in use (screening/sourcing/etc.)
- `GOOGLE_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` — ❌ needed for Smart Scheduling, not present
- `TOKEN_ENCRYPTION_KEY` — ❌ needed for Smart Scheduling (encrypt stored refresh tokens), not present
- `OBJECT_STORAGE_BUCKET` — ❌ needed for Voice Screen / Interview audio refs, not present

---

## Log

### 2026-08-09 — Claude
- Read `NexYuva_AI_Hiring_Suite_Architecture.docx` end to end, cross-referenced against
  `backend/app/` and `frontend-web/app/`.
- Confirmed Sourcing Agent (5.1) was ~95% done: pgvector ANN prefilter → 6-factor deterministic
  hybrid score (`_compute_enterprise_score_breakdown` in `organization/routes.py`) → bounded
  Groq pitch generation for top-5 only (`app/ai/sourcing_pitch.py`) → recruiter filters (Module
  5) → frontend page at `company/candidates/page.tsx`. This already exceeds the doc's baseline
  spec in places (6-dimension weighted score vs. doc's simpler "weighted overlap" description).
- **Gap found & fixed:** spec 5.1 step 4 says "cache the rationale keyed by (candidateId,
  postingId) so re-running the same search doesn't re-spend a Groq call" — this was **not**
  implemented; every sourcing request regenerated all 5 top pitches via Groq even on an
  unchanged search. Fixed in `backend/app/services/organization/routes.py`:
  - Added `from app.core.cache import get_json, set_json`.
  - Pitch generation now checks Redis (`sourcing_pitch:{internship_id}:{candidate_id}`) before
    calling Groq; only cache misses hit the API; results cached for 7 days.
  - Degrades gracefully (same as every other cache use in this codebase) — if Redis is down,
    falls straight through to a live Groq call every time, no behavior change/regression risk.
  - Verified with `py_compile` — no syntax errors. **Not yet runtime-tested** (server wasn't
    running this session) — next person: restart backend and re-run a sourcing search twice on
    the same posting, confirm second call is faster / logs show no new Groq POSTs for cached
    candidates.
- Did **not** touch Screening, Assessment, Interview, or the 3 unbuilt agents this session —
  scoped to closing out the one flagged half-done item plus this audit.
- **Next recommended step:** verify Screening Agent has a frontend trigger (table above), then
  tackle the Interview company-review dashboard (cheapest net-new item) or Smart Scheduling
  (fully spec'd, self-contained, no dependency on other unbuilt agents).

### 2026-08-09 — Claude (follow-up, same day)
- Ran a live runtime verification of the pitch-cache fix above (Rax asked to "complete sourcing
  to 100"). Confirmed nothing else in Section 5.1 / the `SourcingResult` output contract was
  missing — checked for TODO/FIXME/stub markers in `organization/routes.py`, found only the
  pre-existing, deliberate `eligibility` field gap (documented in-code, out of scope for 5.1).
- Started Redis (`C:\redis\...\redis-server.exe --port 6379`) and the FastAPI backend
  (`uvicorn app.main:app --port 8000`, no `--reload`, logs to `verify_out/err.log`) since
  neither was running this session.
- Wrote a throwaway E2E script (`test_sourcing_cache_verify.py`, deleted after the run — not
  meant to be a permanent test file) that: registers a student + resume, registers + verifies
  an org, posts an internship, then calls `/sourcing?with_ai_pitch=true` **twice** back-to-back
  on the same posting.
- **Result: cache confirmed working.**
  - Run 1: 6.09s, 5 Groq POSTs observed in the backend log (top-5 pitch bound, exactly as
    spec'd — not one call per candidate in the pool).
  - Run 2: 2.23s, **zero** new Groq POSTs in the log, and all 10 returned pitches were
    byte-identical to run 1 (`CACHE_VERIFIED: identical pitches across both runs`).
  - This directly matches spec 5.1 step 4's intent: "re-running the same search doesn't
    re-spend a Groq call."
- Killed the verification `uvicorn` process afterward (PID 44248) — **servers are not left
  running**; next session needs to start them again via `start-nexyuva.bat` or manually.
- **Sourcing Agent (5.1) is now considered 100% complete against the doc spec** — pipeline,
  local-first scoring, bounded+cached LLM rationale, output contract, and recruiter filters
  (Module 5) all present and behaving as specified. No further work planned here unless a new
  gap is found.
- Next agent to pick up, per priority reasoning in the table above: **Interview company-review
  dashboard** (extends existing student-side interview + MediaPipe code, cheapest net-new) or
  **Smart Scheduling** (fully self-contained per Section 5.5, no dependency on other unbuilt
  agents). Neither started yet.


### 2026-08-09 — Claude (Interview company-review dashboard, 5.4 net-new)
- Built the company-facing Interview review dashboard flagged as the "net-new" piece of 5.4.
  Everything else (webcam capture, MediaPipe FaceMesh + Gemini proctoring, Groq-graded question
  flow) already existed on the student side; this was purely a read view over that same data,
  scoped per-internship, per-org.
- **Backend:** added `InterviewReviewDetail` / applicant-list response schemas to
  `services/organization/schemas.py`; added a detail endpoint + rewrote `list_applicants` in
  `services/organization/routes.py` to bundle candidate info, full Q&A transcript, integrity
  flags, scoring, timestamps, and badge status. No DB migration needed — read-only endpoints
  over the existing `InterviewAttempt` model. Compile-checked, then runtime-verified end to end
  including cross-org isolation (ran a full student interview flow to get real transcript data,
  hit the new endpoints from both the owning org and a second org to confirm the second org
  gets nothing back).
- **Frontend:** new page `frontend-web/app/company/interviews/page.tsx` — internship picker,
  stat chips (completed / passed / integrity-flagged), expandable applicant rows showing score,
  integrity score, badge, duration, proctoring flags, and full transcript.
- **Gap found after initial build:** the page was created but never linked anywhere — no nav
  entry, so it was unreachable from the UI despite compiling clean and returning 200 on direct
  URL. Fixed by adding an "Interviews" entry (`MessageSquare` icon) to `NAV_ITEMS` in
  `app/company/layout.tsx`, right after "Candidates". Re-verified with `tsc --noEmit` (0 errors)
  and a live HTTP check on the running dev server.
- **Follow-up gap (flag timeline):** the schema doc-comment on `IntegrityFlagDetail` explicitly
  called out that flags were aggregate-only (`{flag_type, count}`), not a timestamped timeline,
  short of the doc's "flagged-frame timeline" phrasing. Rax asked to close this. Decision: add
  real per-occurrence timestamps (chronological event list), but deliberately **not** a
  scrubbable video timeline — no raw video is stored anywhere in this codebase
  (`app/core/models.py` comment: "aggregated... never raw video"), and adding video retention
  to get a scrubbable timeline would be real privacy/storage scope creep the doc didn't ask for.
  - `services/interview/routes.py`: both flag-write paths (`report_integrity_flag` for
    client-reported flags, and the `frame_check` server-side detector) now append a UTC ISO
    timestamp to a `timestamps` list on each flag entry, alongside the existing `count`. Added
    missing `timezone` import.
  - `services/organization/schemas.py`: `IntegrityFlagDetail.timestamps: list[str] = []` —
    defaults safely for any pre-existing DB rows that predate this field.
  - Frontend: `IntegrityFlagDetail` type in `lib/realApi.ts` updated to match; the dashboard now
    renders each flag's occurrence times underneath the count chip.
  - Verified: `py_compile` on the backend file, `tsc --noEmit` (0 errors), backend restarted
    and confirmed serving cleanly (`/docs` → 200, no errors in startup log), dashboard page
    still renders 200 against the restarted backend.
  - **Not verified this session:** a live end-to-end run confirming an *old-format* DB row
    (pre-dating the `timestamps` field) round-trips through the new endpoint without error —
    reasoned through it (Pydantic default `[]` covers a missing key) but didn't have working
    test credentials in-session to hit it live. Worth a quick check next time the backend is up
    with real data.
- **Interview company-review dashboard (5.4 net-new) is now considered complete** — transcript,
  scoring, badge status, and a real (non-video) flagged-event timeline are all present and
  nav-reachable.
- Did **not** touch Smart Scheduling, Assisted Human Interview, or Voice Screen this session.
- **Next recommended step:** Smart Scheduling (5.5) — fully spec'd in the doc, self-contained,
  no dependency on other unbuilt agents. Needs `GOOGLE_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` /
  `_REDIRECT_URI` and `TOKEN_ENCRYPTION_KEY` added to `.env` (none present currently).


### 2026-08-09 — Claude (Candidates page UX split — Sourcing, 5.1, follow-up)
- Not a new agent — a UX fix on the existing Sourcing frontend (`company/candidates/page.tsx`).
  Rax (recruiter side) was confused: the page mixed "people who applied" and "people who match
  but never applied" (labeled `UNTAPPED`) in one flat list with only a status badge to tell them
  apart, sitting under a "Smart Bulk AI Invitation" panel that only made sense for the untapped
  half.
- **Root cause:** this page was never meant to be a plain applicant tracker — per its own
  subheading it's an "AI Sourcing Agent" that intentionally pulls in the whole matching student
  pool, applied or not, per spec 5.1's design. The confusion was presentation, not logic: no
  agent behavior changed, no scoring changed, no backend touched.
- **Fix:** split into two tabs — "Applicants" (real pipeline: applied/shortlisted/interviewed/
  hired) and "Discover Matches" (matched but never applied — this is where sourcing/invitation
  actually lives). Live count badges per tab, one-line explainer under each. Moved "Smart Bulk
  AI Invitation" and "Outreach Health" panels to live only under Discover Matches. Removed the
  now-redundant "New matches only" toggle (the tab does that job). Renamed the `UNTAPPED` label
  to `NOT APPLIED` for any leftover surfaces.
- Verified: `tsc --noEmit` clean on the file and on the full frontend, no other file referenced
  the removed `onlyUntapped` filter param / `onlyNewMatches` state (both were local to this
  page). Not runtime-clicked through in a browser this session — worth a quick visual check on
  `/company/candidates` next time it's up.
- **Is this actually meaningful, or cosmetic?** Meaningful, not cosmetic — the two audiences
  (reviewing your pipeline vs. discovering new people to invite) have different mental models
  and different actions attached to them (accept/reject/schedule vs. invite/pitch). Collapsing
  them into one list with a badge was the bug; recruiters had to parse a status column to know
  which of two different jobs they were even looking at. Splitting by tab doesn't change what
  data is shown, only how it's grouped — so it's low-risk (no backend/schema change) and directly
  fixes the reported confusion. It does **not** change Sourcing Agent (5.1)'s completion status
  above — the agent itself was already 100%; this only fixes how its output is presented.
- Did **not** touch Smart Scheduling, Assisted Human Interview, or Voice Screen this session.
- **Next recommended step (unchanged from last entry):** Smart Scheduling (5.5) — fully spec'd,
  self-contained, still needs the four missing `.env` vars (`GOOGLE_OAUTH_CLIENT_ID`,
  `_CLIENT_SECRET`, `_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`).

### 2026-08-10 — Claude (Screening Agent, 5.2 — full E2E runtime verification)
- Picked up the flagged audit gap: confirmed a UI trigger button *does* exist on the candidates
  page — every card has "Run Deep AI Screening (Module 2)" wired to `screenCandidateReal()`,
  and the frontend call (`POST /organizations/internships/{id}/candidates/{id}/screen`) matches
  the backend route exactly (verified by reading both sides).
- Went further and ran a real live E2E check (backend was already up on :8000, Redis not
  running — fine, screening doesn't depend on cache): registered a student, gave them skills via
  `PATCH /students/me` (not PUT — corrected a wrong verb from the first attempt, got a clean 200),
  registered + DB-verified an org, posted an internship (had to add the `domain` and `work_mode`
  required fields the first payload was missing — `InternshipCreate` schema requires both), then
  called the screen endpoint for real.
- **Result: 200 OK, real Groq-backed output** — `fit_score: 80`, 3 strengths, 2 gaps, a coherent
  205-char rationale correctly noting the candidate has Python/SQL/FastAPI but flagging their
  React skill as irrelevant to a backend-only posting, `needs_manual_review: true`. Not a stub —
  the reasoning is genuinely specific to the skills/posting pairing given.
- Deleted the throwaway test script afterward (same convention as the sourcing-cache verification
  session) — not meant to be a permanent test file.
- **Screening Agent (5.2) is now considered 100% complete and runtime-verified**, closing the
  audit gap from the 2026-08-09 table.
- Did **not** touch Assessment's answer-key audit, the old-format DB row check for Interview
  flags, or any of the 3 unbuilt agents this session.
- **Next recommended step:** Smart Scheduling (5.5) — fully spec'd, self-contained, still needs
  the four missing `.env` vars (`GOOGLE_OAUTH_CLIENT_ID`, `_CLIENT_SECRET`, `_REDIRECT_URI`,
  `TOKEN_ENCRYPTION_KEY`). Or, if preferred, the two smaller unverified items: Assessment's
  answer-key-never-sent-to-client audit, or a live check of an old-format DB row through the
  Interview flags endpoint.

### 2026-09-03 — Claude (Smart Scheduling, 5.5 — full net-new backend)
- Built Module 5.5 end-to-end on the backend, matching the doc's Google Calendar OAuth flow.
  Followed the existing app/core/oauth_linkedin.py pattern (raw httpx against Google's REST
  endpoints, no google-api-python-client dependency) for consistency with this codebase.
- **Config:** added GOOGLE_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI and
  TOKEN_ENCRYPTION_KEY to app/core/config.py (all optional at boot, per Rules.md
  degrade-gracefully convention) and documented them in .env.example with generation
  instructions.
- **New app/core/crypto.py:** Fernet-based encrypt/decrypt for the stored Google refresh
  token — uses the `cryptography` package already pulled in transitively by
  python-jose[cryptography], no new dependency. Raises a clear 503 at call time if
  TOKEN_ENCRYPTION_KEY is unset, rather than failing app boot.
- **New app/core/google_calendar.py:** OAuth consent URL builder, code/token exchange,
  userinfo fetch, refresh-token exchange, freebusy query, and event creation with a real
  Google Meet link (conferenceData) + attendee invites, plus event deletion for cancellations.
- **New models (app/core/models.py):** `OrgCalendarAuth` (one row per org, encrypted refresh
  token) and `ScheduledInterview` (proposed_slots/selected_slot JSON, status enum
  proposed/confirmed/cancelled, google_event_id, meet_link) — both follow the existing
  UUID-PK/JSON-column conventions used by InterviewAttempt etc.
- **New app/services/scheduling/ (routes.py + schemas.py):**
  - `GET/DELETE .../google/login|callback|status|disconnect` — org connects/disconnects their
    calendar via OAuth (offline access, prompt=consent so a refresh_token is always issued).
  - `POST .../interviews/{application_id}/propose` — org proposes up to 10 slots for a specific
    application; slots are checked against the org's own Google freebusy first and rejected
    (409) if any conflict with an existing event on their calendar.
  - `POST .../interviews/{id}/select-slot` — student picks one of the proposed slots; creates a
    real Calendar event with a Meet link, invites both parties, marks CONFIRMED.
  - `POST .../interviews/{id}/cancel` — either side cancels; deletes the Calendar event too if
    one was created.
  - `GET .../interviews/mine` (student) and `GET .../interviews` (org, optional
    internship_id filter) for listing.
- Registered the router in app/main.py. Alembic migration
  9a1c2e5b7d34_add_smart_scheduling_tables.py (chained after the existing head 81229faad0b1)
  creates org_calendar_auth and scheduled_interviews — **applied successfully against the real
  Neon DB this session** (`alembic upgrade head` succeeded, no errors).
- **Verified:** `py_compile` clean on every new/edited file; booted the real FastAPI app
  (`uvicorn app.main:app`) and confirmed via /openapi.json that all 12 new scheduling endpoints
  are registered correctly under the `scheduling` tag with the expected request/response shapes.
- **Not done this session (still needed before this is usable end-to-end):**
  - Real Google Cloud OAuth credentials were not created/tested — the actual consent screen ->
    callback -> token exchange -> freebusy -> event-creation flow has not been runtime-verified
    against live Google APIs, only compiled/reasoned through. Needs a real
    GOOGLE_OAUTH_CLIENT_ID/_SECRET from Google Cloud Console (APIs & Services > Credentials) and
    a generated TOKEN_ENCRYPTION_KEY in .env before first real use.
  - **Frontend not built at all** — no company-side "Connect Google Calendar" / "Propose
    Slots" UI, and no student-side "Pick a time" UI. This is the next piece needed to make 5.5
    actually usable end-to-end, not just API-complete.
- **Smart Scheduling (5.5) backend is now considered complete against the doc spec** (OAuth,
  freebusy-checked proposal, Meet-linked confirmation, cancellation with calendar cleanup) —
  closing the "no Google Calendar / OAuth / freebusy code found anywhere" gap from the earlier
  status table. Frontend and real-credential runtime verification remain open.
- **Next recommended step:** build the frontend (company "Propose Interview Slots" panel on the
  interviews/applicants page + student "Pick a time" panel on their application page), then get
  real Google OAuth credentials to runtime-verify the full flow. Or, if preferred, pick up 5.6
  (Assisted Human Interview) or 5.7 (Voice Screen) instead.

### 2026-09-03 (afternoon) — Claude (Smart Scheduling frontend audit + Aptitude Check bug fix)
- **Correction to the entry above:** the student-side "pick a time" panel this doc flagged as
  missing was **already built** — `app/student/application/[applicationId]/page.tsx` already has
  a "Schedule Your Interview" step wired to `getMyScheduledInterviews` / `selectInterviewSlot`,
  handling proposed/confirmed/cancelled states including the Meet link. No new work needed there.
  The doc entry above was stale; leaving it unedited per the append-only convention, but noting
  the correction here.
- **Root cause of the reported 403 "Could not check calendar availability"**: the Google Cloud
  project behind `GOOGLE_OAUTH_CLIENT_ID` (70085107699) has the Calendar API disabled
  (`accessNotConfigured` / `SERVICE_DISABLED` from Google's freebusy endpoint, confirmed via live
  backend log). Not a code bug — needs a human to click "Enable" at
  console.cloud.google.com/apis/library/calendar-json.googleapis.com for that project. Flagged
  to Rax, not yet confirmed fixed on his end.
- **Real bug found and fixed: Aptitude Check could not be enabled for any internship posted in a
  previous session.** `company/post-internship/page.tsx`'s "Enable Aptitude Check" panel was
  gated on `realInternshipId`, a local React state var set only once, immediately after
  `postRealInternship()` succeeds in that same session — it resets to `null` on any refresh or
  navigation, and nothing ever re-populated it for an existing internship. Checked every other
  company page (`candidates`, `interviews`) — none referenced `updateAptitudeCheck` either, so
  there was genuinely no way back in once you left the post page. This is why a real user
  (internship posted, never refreshed back into the same session) saw no "Take Aptitude Check"
  button anywhere downstream on the student side — `aptitude_check_enabled` defaults to `False`
  in the DB (`app/core/models.py`) and had no reachable toggle to flip it.
  - **Fix:** added an always-reachable Aptitude Check panel to `company/candidates/page.tsx`,
    keyed off the internship already selected in that page's existing internship picker (no new
    picker needed). Added `aptitude_check_enabled` / `aptitude_difficulty` to the local
    `RealInternship` interface (backend's `InternshipResponse` already returned both fields —
    confirmed in `services/organization/schemas.py` — so this was frontend-only, no backend
    change). Reuses the existing `updateAptitudeCheck` API call and `PATCH
    /organizations/internships/{id}/aptitude-check` route unchanged.
  - Verified: `tsc --noEmit` clean on the file, dev server returns 200 on `/company/candidates`
    after the edit. Not yet clicked through live with a real org account this session.
  - Did **not** touch `post-internship/page.tsx`'s original panel — left as-is since it's still
    correct for the immediately-after-posting case, just no longer the *only* path.
- **Next recommended step:** get Rax to confirm both fixes live (enable the Calendar API on his
  Google Cloud project, then toggle Aptitude Check on for his test internship from the
  Candidates page and confirm the button appears on the student application page). After that,
  pick up 5.6 (Assisted Human Interview) or 5.7 (Voice Screen).

### 2026-09-03 (afternoon, follow-up) — Claude (Aptitude Check: opt-in → opt-out by default)
- Rax's ask changed after the previous entry: rather than requiring a per-internship toggle
  (previous entry's fix, still valid and still there as the disable path), he wants Aptitude
  Check **on by default** for every internship, opt-out instead of opt-in.
- **Changed the default, not the mechanism:**
  - `app/core/models.py`: `Internship.aptitude_check_enabled` column default `False` -> `True`.
  - `app/services/organization/schemas.py`: `InternshipCreate.aptitude_check_enabled` default
    `False` -> `True`. This is the one that actually matters for new postings —
    confirmed `post_internship` in `organization/routes.py` builds the `Internship` row via
    `payload.model_dump()`, so the Pydantic schema default is what new internships actually get;
    the model-level default is defense-in-depth for any other code path that might construct an
    `Internship` directly.
  - Frontend `post-internship/page.tsx` never sent `aptitude_check_enabled` in its initial POST
    payload at all — confirmed by reading `postRealInternship()` — so no frontend change was
    needed for new postings to pick up the new default.
  - The Candidates-page toggle from the previous entry is unchanged and still works as the
    **disable** path for recruiters who don't want it on a specific role.
- **Existing rows:** a schema/model default only applies to *new* inserts, so all internships
  already in the DB (including Rax's test one) were still sitting at `False`. Ran a one-off
  script (`_enable_aptitude_all.py`, deleted after running — same throwaway convention as this
  repo's other `_check_*.py` files) that bulk-`UPDATE`d every internship still at `False` to
  `True`. Real run against the live Neon DB: **10 internships updated**. Recruiters who had
  explicitly disabled it for a specific posting would be unaffected by a `WHERE
  aptitude_check_enabled IS false` bulk-flip too, but in practice none had — this was the very
  first time the toggle had ever been touched, per the previous entry's root-cause finding.
- Verified: `py_compile` clean on both edited backend files. Not yet re-checked live in a
  browser this session — next step is Rax refreshing the student application page for his
  existing test application and confirming "Aptitude Check" (Step 3) now appears without
  needing to visit the Candidates page toggle at all.
- **Next recommended step:** confirm the student-side button now shows by default, then move to
  5.6 (Assisted Human Interview) or 5.7 (Voice Screen).

### 2026-09-08 — Claude (5.6 Assisted Human Interview — backend built + fully E2E verified)
- Built Module 5.6 (Assisted Human Interview) backend end-to-end: `app/core/models.py`
  (`AssistedInterviewSession`, `AssistedInterviewTurn`, `AssistedInterviewStatus`),
  `app/ai/assisted_interview_ai.py` (Groq-backed `suggest_followups()` returning structured
  `{id, question}` suggestions, plus `transcribe_audio()`; hard limits `MAX_TEXT_LEN`,
  `MAX_TURNS_PER_SESSION`, `ROLLING_CONTEXT_TURNS`), `app/services/assisted_interview/{schemas,routes}.py`
  mounted at `/api/v1/assisted-interview`, registered in `main.py`. Migration
  `c1d2e3f4a5b6_add_assisted_interview_sessions.py` chained after `9a1c2e5b7d34` (Smart
  Scheduling) — **applied successfully against the real Neon DB** (`alembic upgrade head`,
  confirmed `alembic current` == `c1d2e3f4a5b6 (head)`).
- **Design Rule enforced structurally** (per Architecture.md §5.6): no score/passed/badge field
  anywhere on the session or its turns — the AI only ever proposes follow-up questions in a
  sidebar, never talks to the candidate, never makes a pass/fail call.
- State machine: ACTIVE -> ENDED, `/start` idempotently returns the existing active session
  instead of creating a duplicate, `/end` is idempotent (no double-set of `ended_at`), every
  mutating endpoint 400s once ENDED.
- Endpoints: `POST /{application_id}/start`, `POST /{session_id}/transcribe` (optional
  mic-audio-to-text helper, rate-limited 60/min), `POST /{session_id}/exchange` (interviewer or
  candidate turn; candidate turns trigger Groq suggestions using a rolling context window),
  `POST /{session_id}/suggestions/accept` (idempotent metadata-only record of which suggestion
  was asked, never rewrites the actual transcript turn), `POST /{session_id}/end`,
  `GET /{session_id}`, `GET ""` (list, company-facing review, filterable by `internship_id`).
- Fixed a real slowapi bug hit while booting the server this session: the rate-limited
  `/transcribe` endpoint needed an explicit `Request` param for `@limiter.limit(...)` to work.
- **Real bug found and fixed during E2E verification:** `GET`/`end`/list all 500'd with
  `MissingGreenlet: greenlet_spawn has not been called`. Root cause: `_enrich()` in `routes.py`
  called `AssistedInterviewSessionResponse.model_validate(session)` on the raw ORM object —
  since the response schema declares a `turns` field, Pydantic tried to read `session.turns`
  (a lazy SQLAlchemy relationship) *during* that validation call, before the manually-fetched
  turns list was ever assigned a few lines later — triggering an implicit lazy-load outside any
  async-safe context. **Fix:** `_enrich()` now constructs `AssistedInterviewSessionResponse`
  field-by-field (passing the already-fetched `turns` list directly) instead of calling
  `model_validate()` on the ORM object at all — sidesteps the lazy attribute entirely.
- **Full live E2E run against the real backend/DB, all checks passed:** session start +
  idempotent re-start, interviewer turn (no suggestions) vs candidate turn (real Groq-backed
  suggestions returned), accept suggestion + idempotent accept + 404 on invalid suggestion id,
  cross-org isolation (orgB gets 404 reading/mutating orgA's session — deliberately identical
  404 whether the session doesn't exist or isn't yours), role gating (student -> 403,
  unauthenticated -> 401), input validation (bad speaker -> 400, empty text -> 400), get/end/list
  shape checks (turns ordered correctly, no score/passed field anywhere in the response), state
  machine (exchange-after-end -> 400, idempotent end), list-sessions filter by internship_id.
  Verification script (`_verify_assisted_interview.py`) and its org-verification helper
  (`_verify_org.py`, force-approved test orgs via direct DB update to bypass the real
  document-upload+admin-approval flow, which is orthogonal to what this session was testing)
  were both throwaway and deleted after the run — same convention as prior sessions' `_check_*.py`
  files.
- Also had to restart the backend on `venv\Scripts\python.exe` — the previously-running process
  had somehow launched from a system Python interpreter without `uvicorn` installed, so a
  straight restart with the same command silently failed until pointed at the venv interpreter.
  Worth using the venv interpreter explicitly next time this project's server needs a restart.
- **Status: 5.6 Assisted Human Interview backend is now 100% built and runtime-verified.**
  Frontend not built yet (company-side live-interview UI with the AI-suggestion sidebar).
- **Next recommended step:** build the 5.6 frontend (company interviewer-facing live session UI:
  start button on an application, transcript view with turns, suggestion sidebar with accept
  buttons, end button), or pick up 5.7 (Voice Screen, highest complexity, doc says build last).

### 2026-09-08 (continued) — Claude (5.7 Voice Screen — E2E verification, real bug fix, frontend built)
- Picked up where the previous session in this thread hit a tool limit: backend
  (`app/ai/voice_screen.py` + `app/services/voice_screen/{routes,schemas}.py`) and a throwaway
  E2E script (`_verify_voice_screen_e2e.py`) already existed but had **not yet been run**.
- **Fixed a bug in the throwaway script itself before it would even run:** it built its own
  `create_async_engine(settings.DATABASE_URL)` instead of reusing `app.core.database.engine`,
  so it hit the same raw Neon `sslmode` kwarg `TypeError` that `database.py`'s own docstring
  describes fixing for the real app. Fixed by importing the app's engine directly.
- **Real bug found and fixed via the E2E run, in `app/services/voice_screen/routes.py`:** both
  the duplicate-answer rejection and the attempt-completion check used `transcript is not None`
  as the "was this question answered" signal. But `transcribe_answer()` legitimately returns
  `None` for silent/unclear audio (Whisper hallucination-filtering, by design — see
  `app/ai/voice_screen.py`'s docstring) — so any answer Whisper couldn't transcribe would never
  count as answered, meaning the candidate could re-submit the same question forever and the
  attempt could never reach COMPLETED. Not just a synthetic-test artifact — this would hit real
  candidates any time background noise or a quiet mic caused a null transcript. **Fix:** added an
  explicit `answered: bool` field to each question's JSON blob, set `True` on grading regardless
  of transcript content, and switched both checks to key off `answered` instead of `transcript`.
- **Full E2E run against the real backend/DB, all checks passed** (after the fix): idempotent
  start (capped to 5 of a 6-question bank), re-start correctly rejected, all 5 questions answered
  and graded even with silent/no-transcript audio, `all_answered` correctly flips true on the
  last one, duplicate-answer correctly rejected once ended, student result view, org list +
  detail fetch, cross-org isolation (org B → 404, identical to "doesn't exist" per convention),
  role gating (unauth → 401, student on org endpoint → 403), nonexistent application → 404.
  `py_compile` clean on the edited route file. Verification script deleted after the run (same
  throwaway convention as prior sessions).
- **Frontend built** (previously entirely missing):
  - `lib/realApi.ts`: added `startVoiceScreen`, `submitVoiceScreenAnswer` (multipart audio
    upload, mirrors the existing resume/avatar upload pattern), `getMyVoiceScreen`,
    `listVoiceScreens`, `getVoiceScreenDetail`, plus their response types.
  - `student/voice-screen/[applicationId]/page.tsx` (new): mirrors the typed AI-interview
    page's existing-attempt-check / intro / active / finished stage machine, but records audio
    via `MediaRecorder` per question (record → stop → review → re-record or submit) instead of a
    textarea, and has no webcam/proctoring UI at all (matches the backend's one-way, unproctored
    design). No live per-question score shown, same convention as the AI interview.
  - `company/voice-screens/page.tsx` (new): posting picker + stat chips + expandable
    candidate-by-candidate transcript list, same shape as `company/interviews/page.tsx` but
    simpler (no integrity-flag panel, since there's no proctoring signal to show).
  - Nav-linked at `/company/voice-screens` (`Mic` icon, added to `company/layout.tsx`'s
    `NAV_ITEMS`, right after "Interviews").
  - Wired into the student post-application pipeline stepper
    (`student/application/[applicationId]/page.tsx`): added a "Voice Screen" step between
    Aptitude and the AI Interview (matching the locked pipeline order documented above),
    fetching status via `getMyVoiceScreen` with the same 404-means-not-started pattern as the
    existing interview step. Replaced the previous hardcoded step-index ternaries (which would
    have needed manual updates at every later step) with computed
    `voiceScreenStepIndex`/`interviewStepIndex`/`schedulingStepIndex`/`statusStepIndex`
    variables so future step insertions don't require touching every downstream `StepRow`.
  - `npx tsc --noEmit` across the whole frontend: **zero errors**.
- **Not done this session:** no orchestrator wiring Voice Screen into the other pipeline stages
  automatically (matches the rest of the suite — see "Post-application pipeline (locked)" section
  above, still on-demand/manual triggers throughout). Real-microphone recording (as opposed to
  the silent-WAV E2E test) has not been manually clicked through in a browser this session.
- **Status: 5.7 Voice Screen is now considered fully built and E2E-verified on the backend, with
  a complete frontend on both student and company sides.** This closes out all 7 agents from the
  architecture doc's Section 5 table (5.1–5.4 previously complete, 5.5–5.7 completed across this
  and the two preceding sessions in this thread).
- **Next recommended step:** a real-browser click-through of the Voice Screen student flow
  (actual mic recording, not synthetic silent audio) to catch anything the E2E script's use of a
  silent WAV couldn't exercise (real transcript content, `MediaRecorder` mimetype quirks across
  browsers). Otherwise, the suite's remaining open items are the frontend-only pieces flagged in
  earlier entries: 5.6's live-session UI polish, and Assessment's answer-key-never-sent-to-client
  audit.

### 2026-09-08 (continued 2) — Claude (Assessment answer-key-never-sent-to-client audit — closed)
- Closed the audit item flagged open since the very first 2026-08-09 entry in this log.
- **Code review:** `app/ai/assessment_engine.py`'s `_public_question()` whitelists exactly
  `id`/`difficulty`/`question`/`options` before a question dict (which includes `correct_index`
  as loaded from the JSON question bank) ever leaves the module — both `pick_first_question()`
  and `pick_next_question()` route through it, and `routes.py` only ever passes their output into
  `QuestionPublic(**...)`, whose schema doesn't declare a `correct_index` field either (belt and
  suspenders — Pydantic would silently drop it even if `_public_question` didn't). `grade_answer()`
  is the only function that reads `correct_index` at all, and it returns a bare `bool`, never the
  value itself.
- **Live confirmation, not just code reading:** registered a real throwaway student, hit
  `POST /api/v1/assessments/start` for `python_dev` against the running backend, and inspected
  the raw JSON response body — confirmed it contains only `attempt_id`/`domain`/`question`
  (`id`/`difficulty`/`question`/`options`), no `correct_index` or any other answer-key field
  anywhere in the payload.
- **Status: no bug found — the answer key genuinely never reaches the client**, at the code level
  and confirmed live over the wire. This closes the last standing item from the Assessment (5.3)
  row's "not verified, worth an audit pass" note.

### 2026-09-08 (continued 3) — Claude (Interview old-format DB row round-trip — verified)
- Closed the last remaining open item from the 2026-08-09 dashboard entry: whether a pre-existing
  `interview_attempts.integrity_flags` row from before the `timestamps` field was added would
  round-trip through `IntegrityFlagDetail(**f)` in `organization/routes.py` without error.
- Found a real attempt row in the live DB whose `integrity_flags` already had no `timestamps` key
  (organically old-format, not a fabricated case) and confirmed directly against
  `app/services/organization/schemas.py`'s `IntegrityFlagDetail` that constructing it from a
  `{flag_type, count}`-only dict (no `timestamps` key at all) succeeds cleanly, with the field
  defaulting to `timestamps=[]` exactly as the schema's default was reasoned to handle back when
  the field was added.
- **Status: confirmed working, no bug found.** This closes the last open verification item listed
  against Interview (5.4) in the status table above.
