# NexYuva Admin — Trust & Safety Control Center

Memo status: **Phase 1 (backend core) implemented 2026-09-03.** Phases 2+ are
scoped below but not yet built. This file is the single source of truth for
where this feature is headed — update it as phases land.

## Why this exists

The admin side is not a generic CRUD dashboard. Its job is to answer one
question before anything else on the platform matters:

> Is this a real organization, is the person representing it actually
> connected to it, and are the opportunities they're posting legitimate?

Everything below is organized around that, following the design doc the
team wrote (see chat history 2026-09-03). Architecture:

```
Company → Verification Case → Trust/Safety Decision → Approved
                                                          │
                                                    Hiring Layer
                                            (7 AI hiring agents — unrelated
                                             to whether the company is real)
```

The AI hiring agents (sourcing/screening/assessment/voice/interview/
scheduling/orchestrator) never decide legitimacy. That's the admin layer's
job, and only the admin layer's job.

## Data model concept (do NOT build around `org.verified = true`)

```
Organization
   ├── Legal/registration identity (name, CIN, PAN, website, domain)
   ├── Representative (name, designation, phone, email/phone verified flags)
   ├── VerificationDocument[]   (typed docs: incorporation cert, PAN, GST, MSME...)
   ├── verification_status      (state machine, not a boolean)
   ├── risk_level + risk_notes  (computed signal, not an auto-verdict)
   └── AdminAuditLog[]          (every admin action, immutable)
```

## State machine (implemented)

```
UNSUBMITTED → PENDING → APPROVED
                 ├──────→ ACTION_REQUIRED → PENDING (on resubmit)
                 ├──────→ REJECTED
APPROVED ───────────────→ SUSPENDED → APPROVED (reinstate)
```

`PENDING` here is what the design doc calls `UNDER_REVIEW` — kept the
existing enum value name for backward compatibility with the MVP
verification flow that already shipped (single-document upload +
approve/reject), rather than renaming and forcing a data migration.

## Phase 1 — IMPLEMENTED (backend)

Maps to design-doc priorities **#2, #3, #4, #5, #8, #9, #10** (queue, case
view, representative fields, approve/reject/request-info, suspend/reinstate,
audit log, risk signals).

- `Organization` model gained: `legal_name`, `cin`, `pan`,
  `official_website`, `industry`, `representative_name`,
  `representative_designation`, `representative_phone`,
  `representative_email_verified`, `representative_phone_verified`,
  `risk_level`, `risk_notes`, `action_required_reason`.
- New `VerificationDocument` table — multiple typed documents per org
  (`incorporation_certificate`, `pan_card`, `gst_certificate`,
  `msme_certificate`, `other`), each independently reviewable
  (pending/verified/rejected + reviewer + notes), instead of the old
  single `verification_doc_path` field (kept for backward compatibility,
  now treated as a legacy/primary doc).
- New `AdminAuditLog` table — every admin decision (approve, reject,
  request-info, suspend, reinstate, document review) is written here with
  admin id, entity, previous/new status, reason, timestamp. Nothing skips
  this: it's called from inside each endpoint, not bolted on after.
- Deterministic **risk score** (`app/services/admin/risk.py`): not an AI
  call, not a black box — plain signals (domain-vs-email match, doc count,
  website presence, profile completeness, representative verification)
  that map to LOW/REVIEW/HIGH. This *prioritizes* the queue; it never
  auto-approves or auto-rejects.
- New endpoints (`app/services/admin/routes.py`):
  - `GET  /api/v1/admin/organizations/verification-queue` — filterable by
    status + risk, sortable, replaces the old `/organizations/pending`
    (kept as a deprecated alias for one release).
  - `GET  /api/v1/admin/organizations/{id}/case` — the full investigation
    workspace payload: identity, representative, documents, computed risk,
    activity counts (internships posted, applications received), and this
    org's audit history.
  - `POST /api/v1/admin/organizations/{id}/approve` (renamed from
    `/verify` — old path kept as an alias)
  - `POST /api/v1/admin/organizations/{id}/reject`
  - `POST /api/v1/admin/organizations/{id}/request-information`
  - `POST /api/v1/admin/organizations/{id}/suspend`
  - `POST /api/v1/admin/organizations/{id}/reinstate`
  - `POST /api/v1/admin/organizations/{id}/documents/{doc_id}/review`
  - `GET  /api/v1/admin/audit-log`
- Org-side additions (`app/services/organization/routes.py`):
  - `PATCH /api/v1/organizations/me/verification-profile` — company fills
    in legal name, CIN, PAN, website, representative details.
  - `POST  /api/v1/organizations/verification-documents` — upload one of
    several typed documents (repeatable; old single-doc endpoint kept
    working for anything already integrated against it).
  - `GET   /api/v1/organizations/me/verification-documents`

## Phase 2 — IN PROGRESS

Built so far (frontend, 2026-09-03):
- lib/adminApi.ts — typed client for every Phase 1 endpoint.
- /admin/verification — queue page (status/risk filters).
- /admin/verification/[orgId] — 3-pane case workspace (identity+rep,
  documents with per-doc verify/reject, decision panel + audit feed).
- /admin/audit-log — full audit trail table.
- /company/verification — company-side profile form + typed multi-doc
  upload, using the endpoints from Phase 1 (separate from the legacy
  single-doc gate still in pp/company/layout.tsx).

Still open:
- Inline document preview (currently downloads instead of viewing inline).
- Request-information as a checkbox+free-text modal per the original mock
  (currently a plain textarea — functionally complete, visually simpler).

## Phase 2 remainder — NOT YET BUILT

- **Admin frontend redesign**: replace the current `/admin/dashboard`
  "Ministry Intelligence Dashboard" (metrics-only) with the actual
  Trust & Safety Center: priority-actions header, verification queue
  table (risk/status filters), and the 3-pane case workspace (identity /
  evidence / decision panel) described in the design doc. This is the
  single biggest remaining chunk of work.
- **Email/phone OTP verification** for the representative — right now
  `representative_email_verified` / `representative_phone_verified` are
  plain booleans an admin (or a future automated check) sets manually;
  there's no OTP flow wired yet.
- **Internship moderation** — DONE, see Phase 3 below.
- **Student reports** — DONE, see Phase 4 below.
- **Company activity monitor / anomaly detection** ("8 internships created
  in 15 minutes" style signals).
- **Admin roles** (Super Admin / Verification Admin / Moderation Admin /
  Support Admin) — right now there's a single `admin` role with full
  access to everything under `require_role("admin")`.
- **Company trust profile** (internal 0–100 score) — deliberately
  deferred; the design doc is explicit this shouldn't be built casually
  or exposed to students until it's genuinely meaningful and explainable.

## Phase 4 — IMPLEMENTED (2026-09-03)

Student-filed reports against a listing or an organization (migration
a7b8c9d0e1f2, backend boots clean):
- `Report` model + `reports` table: reporter, target_type (internship/
  organization), target_id, reason (fake_listing/unpaid_or_underpaid/
  misleading_description/suspicious_company/harassment/scam_or_fraud/
  other), details, status (open/investigating/dismissed/action_taken),
  resolution_notes, resolved_by/at.
- Student endpoints (`app/services/student/routes.py`):
  `POST /api/v1/students/reports` (file a report against an internship or
  org), `GET /api/v1/students/reports/mine` (so filing doesn't feel like
  shouting into a void).
- Admin endpoints (`app/services/admin/routes.py`):
  `GET /api/v1/admin/reports` (defaults to OPEN), `POST .../investigate`,
  `POST .../dismiss`, `POST .../action-taken` — all write to the same
  AdminAuditLog (entity_type="report") as every other admin action.
  Deliberately does not itself flag/remove a listing or suspend an org —
  an admin does that separately via the moderation/verification endpoints
  and notes what was actually done.
- Frontend:
  - Student: Report button (flag icon) on every card in
    `/student/live-internships`, opens a modal (reason dropdown + optional
    details textarea), posts via `lib/realApi.ts`'s `fileReport`.
  - Admin: `/admin/reports` queue page + sidebar nav link, same
    card-list/status-filter pattern as `/admin/moderation`, using new
    functions in `lib/adminApi.ts` (getReportsQueue, investigateReport,
    dismissReport, actionTakenReport).

Still open for Phase 4: student-side "My Reports" status view (backend
endpoint exists, no frontend yet), reporting an *organization* directly
(currently only internship listings have a Report button wired in the UI
— the backend/schema already supports target_type=organization).

## Explicitly out of scope for now

- Government ID as a default requirement — only requested when a specific
  case genuinely needs it, with restricted access + audit trail on who
  viewed it. Not built as a default field.
- Auto-approval/auto-rejection from the risk score. The risk score is a
  queue-prioritization signal only; every state change still requires an
  explicit admin action, which is why every endpoint above writes to
  `AdminAuditLog`.

## Phase 3 — IMPLEMENTED (2026-09-03)

Per-listing job-quality moderation, independent of Organization.verification_status
(migration 1a2b3c4d5e6, backend boots clean with the new routes):
- Internship gained moderation_status (unreviewed/approved/flagged/removed,
  default unreviewed on every new posting), moderation_notes, moderated_by,
  moderated_at.
- GET /api/v1/admin/internships/moderation-queue (defaults to unreviewed),
  POST .../approve, POST .../flag (requires notes), POST .../remove
  (also flips is_active=False so it drops out of recommendations immediately).
  All write to AdminAuditLog under entity_type internship, same as the
  organization endpoints.
- Frontend: /admin/moderation queue page + nav link, using
  lib/adminApi.ts's new moderation functions.
