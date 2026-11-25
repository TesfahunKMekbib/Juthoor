# Open Questions and Known Conflicts

Agents must **stop and ask** when a task depends on an `open` item; they must not pick an answer.
When the team decides, set `Status: decided`, write the decision and date, and add an ADR if it
shapes architecture. Format per entry: `Status:` · `Blocks:` · `Owner:`.

## A. Conflicts between documents

### Q-A1 — Canonical activity status lifecycle
Status: decided · Owner: team
Decision: states exactly as in the requirements — Draft (FR-010), Submitted (FR-015), Accepted (FR-026),
Returned for Correction / Rejected (FR-027), Pending Technical Processing (FR-028); NFR-019 "Pending
Processing" is a naming inconsistency for the FR-028 state; prototype-only states dropped (ADR-0005, 2026-11-25).
- FR-027/028: "Returned for Correction", "Pending Technical Processing"; NFR-019: "Pending Processing".
- DB design: `draft | submitted | accepted | returned | rejected | processing_failed`.
- Code (`activity.schema.ts`): same as DB but **no `draft`**, so FR-010 drafts cannot be stored.
- Prototype adds "Possible duplicate", "Pending upload", "Needs more evidence", "Processing".

### Q-A2 — Sign-in methods
Status: decided · Owner: team
Decision: email + password only initially (FR-001); other sign-in methods need a requirements change (ADR-0009, 2026-11-25).
FR-001 = email + password only. Prototype adds Google sign-in, a guest flow ("Sign up after"),
password reset, and "UAE PASS verified"; DB `signInMethod` allows `google | uae_pass`.

### Q-A3 — Vouchers, partner rewards, ID upload, payment
Status: open · Blocks: rewards module · Owner: team
Present in prototype, DB (`rewards`, `vouchers`) and proposal risk table; absent from all FRs.
Emirates ID / passport upload is a high privacy risk.

### Q-A4 — Transport category
Status: decided · Owner: team
Decision: implement only the FR-007 categories; Transport and Other are flagged, not silently removed — see Q-A4b (ADR-0005, 2026-11-25).
FR-007 lists six categories (no transport). Flutter UI and prototype add Transport and Other.

### Q-A4b — Add Transport and Other categories via a requirements change?
Status: open (stakeholders) · Interim UI decision (owner, 2026-11-25): Transport/Other chips hidden until decided · Blocks: Flutter category chips reconciliation, any seed data beyond FR-007 · Owner: stakeholders
Transport and Other are stakeholder-approved and present in the Flutter UI, but absent from FR-007.
Question for stakeholders: amend FR-007 (and FR-011 category-specific fields) to add them, or remove
them from the UI? Until decided, backend seed data contains only the FR-007 categories.

### Q-A5 — Manual review
Status: decided · Owner: team
Decision: fully automated verification, no manual review queue for now (ADR-0007, 2026-11-25).
Proposal: verification "can support manual review". FRs: fully automated (FR-026).

### Q-A6 — Audit log retention
Status: decided (principle) · Owner: team
Decision: append-only audit log, ID-only references, defined (not indefinite) retention respecting
NFR-031; period value open as Q-A6b (ADR-0008, 2026-11-25).
FR-054 requires an immutable audit log; DB design expires `auditLogs` after 90 days.

### Q-A6b — Audit log retention period value
Status: open · Blocks: audit TTL / retention job · Owner: team
Choose the concrete retention period for audit entries (DB design proposes 90 days) and confirm that
ID-only entries satisfy NFR-031 anonymization within 30 days.

### Q-A7 — Exact GPS storage
Status: decided · Owner: team
Decision: validate exact coordinates in memory at submission (FR-020); persist only emirate/area,
encrypted (NFR-004, NFR-007) (ADR-0006, 2026-11-25).
DB stores `location.point` (GeoJSON) on every activity; NFR-007 requires deleting exact residential
coordinates after validation. Proposed resolution (needs approval): validate, then persist emirate/area only.

### Q-A8 — Photo storage
Status: decided · Owner: team
Decision: GridFS adapter behind a provider-independent storage interface (NFR-023); originals private
(NFR-009), EXIF stripped before sharing (NFR-008), blurred copy with FR-024 (ADR-0006, 2026-11-25).
DB/proposal: object storage + `originalUrl` / `blurredUrl` (signed URLs). Code: GridFS `fileId`, no blurred copy.

### Q-A9 — Backend architecture shape
Status: decided · Owner: team
Decision: NestJS modular monolith, domain modules in `backend/src/modules/<domain>/`, in-process events
keyed by activityId, providers in `modules/integration/`, old layouts removed (ADR-0004, 2026-11-25).
Proposal: API gateway + independent microservices. Repo: two incompatible layouts
(`backend/activity-service/`, `backend/modules/`). Event bus/broker unspecified.
Recommendation from analysis: one NestJS app with one module per proposed service (modular monolith).

### Q-A10 — Status of interview insights
Status: open · Owner: team
`docs/requirements/candidate-insights.md` (CI-01…CI-12) is treated as NOT approved until decided.

## B. Database design defects (from `index (4).html`)

### Q-B1 — Index and field defects
Status: open · Blocks: rewards, campaign, impact modules · Owner: backend
- `userProgress` has no `userId` (assumption: `_id` = userId).
- `pointsHistory.activityId (unique)` collides for voucher rows (null) → needs a partial index.
- `enrollments programId + teamId (unique)` collides for individual enrollments → partial index.
- Missing: consent timestamp/version (FR-048, NFR-032), guardian consent, sessions/refresh tokens
  (NFR-011), MFA secret (NFR-010), revision lock (FR-015), leaderboard source (FR-034).
- NFR-004 field encryption vs. unique `email` index → needs a deterministic hash column.
- Coverage: list core modules in `backend/jest.config.cjs` `collectCoverageFrom` once they exist (NFR-024).

## C. Missing information

### Q-C1 — Web client and admin console technology
Status: open · Owner: team — Flutter Web? Separate admin app ("separate from the participant app")?

### Q-C2 — Offline-first scope (NFR-019, prototype "Pending upload")
Status: decided · Owner: flutter
Decision: client offline functionality deferred; server-side Pending Technical Processing stays in scope (ADR-0009, 2026-11-25).

### Q-C3 — AI provider for verification (FR-025) and blurring (FR-024)
Status: decided (interface) · Owner: team
Decision: provider-independent AI interface in the integration module, mock provider for tests;
Update (owner, 2026-11-25, ADR-0012): first real engine is Google Gemini, enabled only outside production (boot fails if AI_PROVIDER != mock with NODE_ENV=production). Production provider stays open pending a privacy review (FR-024 blurring deferred, NFR-009).

### Q-C4 — Hosting / deployment target
Status: decided (deferred) · Owner: team
Decision: final hosting decision deferred; backend stays container-ready per NFR-038 (ADR-0009, 2026-11-25).

## E. Add an Activity use case (raised 2026-11-25, `docs/features/FR-009-028-054-add-activity/`)

### Q-E1 — FR-001 deferral and the dev test participant
Status: decided (owner, 2026-11-25) — recommendation below accepted · Was: Blocks: plan approval (resolved by accepting ADR-0010) · Owner: project owner
Owner removed authentication from this phase. FR-001 (Must) stays in the approved file; recommendation:
record it as **deferred**, not deleted (traceability note), and accept ADR-0010. NFR-010/011 and the
"authenticated participant" precondition of NFR-013 are unverifiable until auth exists.

### Q-E2 — AI outcome mapping: Returned for Correction vs Rejected
Status: decided (owner, 2026-11-25) — recommendation below accepted · Was: Blocks: Verification decision function (plan task B9) · Owner: project owner
FR-026 defines Accepted (score ≥ acceptance threshold). FR-027 says Returned when evidence "may be
corrected", Rejected on "a defined rejection rule"; FR-022 mentions "rejection thresholds" but no rule is
defined. Recommendation: `score ≥ AI_ACCEPT_THRESHOLD` → Accepted; `AI_REJECT_THRESHOLD ≤ score <
accept` → Returned for Correction; `score < AI_REJECT_THRESHOLD` → Rejected. Values from config (proposed
dev defaults 0.70 / 0.30); FR-022 admin configuration deferred.

### Q-E3 — Deterministic failures: 422 response or persisted Rejected status?
Status: decided (owner, 2026-11-25) — recommendation below accepted · Was: Blocks: submission contract (plan tasks B2, B5) · Owner: project owner
FR-019 says "deterministically reject" a future date; ADR-0005 lists FR-019 as a source of Rejected;
FR-023 says failing deterministic checks show field-level errors and let the participant correct the draft.
Recommendation: all FR-018–021 failures return `422` with field codes and **no record is created**
(FR-023 governs the UX); the persisted Rejected status is produced only by verification rules (Q-E2).

### Q-E4 — FR-028 after retries are exhausted
Status: decided (owner, 2026-11-25) — recommendation below accepted · Was: Blocks: exhausted-retry branch of B9 · Owner: project owner
ADR-0005 has no "permanently failed" status. Recommendation: activity stays Pending Technical Processing
with reason code `processing.failedPermanently`; the job is marked `exhausted` for future FR-055 admin
retry. Proposed dev defaults: 5 attempts, exponential backoff 30 s → 8 min.

### Q-E5 — Seed activity-type definitions (FR-007, FR-008, FR-011)
Status: decided (owner, 2026-11-25) — recommendation below accepted · Was: Blocks: dev seed (B6) · Owner: project owner
No admin catalog (FR-007/008) is in scope, so types are seeded. Values (names, units, min/max, photo
counts, size limit) are configuration, not requirements, and need owner sign-off. Specific ambiguity:
for water/energy, is the credited quantity the participant-entered amount or the difference of the
FR-011 before/after meter readings? Recommendation: the participant enters the amount; both readings are
required numeric fields; no derived-quantity rule is added (that would be a new requirement).

### Q-E6 — UAE / emirate boundary data for FR-020
Status: decided (owner, 2026-11-25) — **FR-020 GPS validation deferred to the next phase; dataset removed** (see decision at the end) · Was: Blocks: device-GPS location validation (B4b) · Owner: project owner
Exact coordinates must be checked against the UAE boundary and mapped to an emirate in memory (ADR-0006).
Needs a boundary dataset (source, licence, simplification) or a mapping API (Q-C3-like provider choice).
Recommendation: a simplified ADM1 GeoJSON with an open licence (e.g. geoBoundaries, CC BY 4.0) behind a
`GeoBoundaryProvider` interface in `modules/integration/geo/`; manual entry (FR-012) works without it.
Follow-up (2026-11-25, implementation): the geoBoundaries gbOpen ARE ADM1 release metadata lists its source as
OpenStreetMap (Wambacher) under **ODbL 1.0**, not CC BY 4.0 (`backend/src/modules/integration/geo/data/ATTRIBUTION.md`).
**Owner to confirm** that ODbL attribution/share-alike terms are acceptable for the bundled derived copy, or pick
another dataset. Until confirmed the licence part of this decision is re-opened; code is unaffected (provider interface).
Decision (owner, 2026-11-25, in chat): "Defer GPS-based location validation (FR-020) to the next development phase.
Retain manual emirate selection under FR-012. Preserve the existing implementation where possible, remove any unused
licensed dataset from the current deliverable, and update the scope, traceability documentation and affected tests
accordingly." → Status: **decided — deferred**. The ODbL dataset and `ATTRIBUTION.md` are removed; backend accepts
only manual locations (`rules-2`, plan §7); provider interface and point-in-polygon stay dormant. The licence question
is moot until the next phase picks a dataset (re-open then: source, licence, simplification).

### Q-E10 — Android location permissions while FR-020 is deferred
Status: decided (owner, 2026-11-25) — option (b): remove both permissions this phase; restore with FR-020 · Owner: project owner
`frontend/android/app/src/main/AndroidManifest.xml` declares `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` for
`geolocator`; after plan §7 the app never requests location. (No `frontend/ios/` folder exists, so there are no iOS
usage strings to decide.) Options: (a) keep them dormant for the next phase; (b) remove them now and restore with
FR-020. Recommendation: (b) — an app that declares location access it never uses contradicts data minimisation
(NFR-007) and store review; `geolocator` and the Dart code can stay dormant either way.

### Q-E11 — Stakeholder visibility of the FR-020 (Must ★) deferral
Status: decided (owner, 2026-11-25) — FR-020 documented as deferred to the next phase (traceability, spec, plan §7);
the owner informs the supervisor; `docs/requirements/**` unchanged · Owner: project owner
FR-020 is an approved Must requirement in the demo scenario. The owner accepted its deferral (Q-E6), but
`docs/requirements/functional.md` is unchanged and still states it as Must for this phase. Proposed wording for a
dedicated requirements PR or supervisor note (not applied; requirements are read-only to agents): "FR-020 — Phase 1
(capstone demo): location is entered manually as an emirate from a fixed list (FR-012) and validated against that list;
GPS-based UAE/emirate boundary validation and program geofences are deferred to the next phase (owner decision
2026-11-25, Q-E6: licence of the available boundary dataset)." Owner to decide how stakeholders are informed.

### Q-E8 — CI must run the backend e2e suite
Status: open · Blocks: CI evidence for spec AC 1, 4, 9, 10, 12, 14–18, 22, 23 · Owner: team (hotspot `.github/**`)
`npm run test:e2e` (`backend/test/*.e2e-spec.ts`, real MongoDB) is separate from `npm test`; `.github/workflows/backend.yml`
already has a `mongo:8` service and `MONGODB_URI` but runs only `npm run test:cov`. Needed: a step running
`npm run test:e2e` (plus the env the suite needs, e.g. `LOCATION_ENCRYPTION_KEY` test value). Hotspot file →
separate `ci:`/`chore:` PR, not this feature PR.

### Q-E9 — `backend/.env.example` not created
Status: open · Blocks: onboarding / plan task B1 deliverable · Owner: project owner
The plan (B1, §4) lists `.env.example`, but the owner's permission rules block agents from writing `.env*` files.
Interim: the configuration table in `docs/features/FR-009-028-054-add-activity/plan.md` (Implementation notes)
lists every variable, default and purpose. Owner to create the file (placeholders only, no secrets) or adjust the rule.

### Q-E7 — In-scope depth for FR-010 drafts, FR-024 blurring, FR-027 replacement evidence
Status: decided (owner, 2026-11-25) — recommendation below accepted · Was: Blocks: nothing in Slices 1–2 · Owner: project owner
Owner's scope lists selection, data entry, upload, location, submission, AI verification, status display.
Recommendation: defer server-side drafts (FR-010; FR-023 met by the form keeping its state), defer FR-024
(already deferred by ADR-0006), and treat FR-027 replacement evidence as an optional Slice 3.

## D. Baseline technical debt (blocks strict CI)

### Q-D1 — Backend does not compile
Status: resolved · Owner: backend
Decision: resolved by ADR-0004 / Phase 0 implementation — fixing compile and lint is the first
implementation task, in progress on branch `chore/phase-0-foundation` (ADR-0004, 2026-11-25).
53 `tsc` errors / 19 ESLint errors (2026-11-22), all pre-existing: missing files (`activities.controller`,
`activity-types.service`, `photos.service`, `common/events`, `photos.module`), truncated
`activities.service.ts`, service body living in `backend/modules/activities.module.ts`
(self-injection `types: ActivitiesService`, `new type.ObjectId`, `@ts-ignore`).
CI runs typecheck/lint as **non-blocking** until fixed; then set repo variable `STRICT_CHECKS=true`.

### Q-D2 — Dart formatting
Status: decided · Owner: flutter
Decision: fix existing formatting in Phase 0 via `dart format`, then make the check blocking (ADR-0009, 2026-11-25).
`dart format` would change `frontend/lib/screens/home_screen.dart` and `record_activity_screen.dart`.
Non-blocking in CI until a dedicated `style:` PR formats them.
