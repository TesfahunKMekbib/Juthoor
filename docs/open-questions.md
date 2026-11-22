# Open Questions and Known Conflicts

Agents must **stop and ask** when a task depends on an `open` item; they must not pick an answer.
When the team decides, set `Status: decided`, write the decision and date, and add an ADR if it
shapes architecture. Format per entry: `Status:` · `Blocks:` · `Owner:`.

## A. Conflicts between documents

### Q-A1 — Canonical activity status lifecycle
Status: open · Blocks: FR-010, FR-026–028, the activity-submission demo · Owner: team
- FR-027/028: "Returned for Correction", "Pending Technical Processing"; NFR-019: "Pending Processing".
- DB design: `draft | submitted | accepted | returned | rejected | processing_failed`.
- Code (`activity.schema.ts`): same as DB but **no `draft`**, so FR-010 drafts cannot be stored.
- Prototype adds "Possible duplicate", "Pending upload", "Needs more evidence", "Processing".

### Q-A2 — Sign-in methods
Status: open · Blocks: auth module · Owner: team
FR-001 = email + password only. Prototype adds Google sign-in, a guest flow ("Sign up after"),
password reset, and "UAE PASS verified"; DB `signInMethod` allows `google | uae_pass`.

### Q-A3 — Vouchers, partner rewards, ID upload, payment
Status: open · Blocks: rewards module · Owner: team
Present in prototype, DB (`rewards`, `vouchers`) and proposal risk table; absent from all FRs.
Emirates ID / passport upload is a high privacy risk.

### Q-A4 — Transport category
Status: open · Blocks: activity catalog seed data, Flutter category chips · Owner: team
FR-007 lists six categories (no transport). Flutter UI and prototype add Transport and Other.

### Q-A5 — Manual review
Status: open · Blocks: verification module · Owner: team
Proposal: verification "can support manual review". FRs: fully automated (FR-026).

### Q-A6 — Audit log retention
Status: open · Blocks: audit module · Owner: team
FR-054 requires an immutable audit log; DB design expires `auditLogs` after 90 days.

### Q-A7 — Exact GPS storage
Status: open · Blocks: FR-020 implementation · Owner: team
DB stores `location.point` (GeoJSON) on every activity; NFR-007 requires deleting exact residential
coordinates after validation. Proposed resolution (needs approval): validate, then persist emirate/area only.

### Q-A8 — Photo storage
Status: open · Blocks: photos module, FR-024, NFR-008 · Owner: team
DB/proposal: object storage + `originalUrl` / `blurredUrl` (signed URLs). Code: GridFS `fileId`, no blurred copy.

### Q-A9 — Backend architecture shape
Status: open · Blocks: backend bootstrap (`main.ts`, `AppModule`) · Owner: team
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
Status: open · Owner: flutter

### Q-C3 — AI provider for verification (FR-025) and blurring (FR-024)
Status: open · Blocks: activity-submission demo AI step · Owner: team

### Q-C4 — Hosting / deployment target
Status: open · Owner: team

## D. Baseline technical debt (blocks strict CI)

### Q-D1 — Backend does not compile
Status: open · Owner: backend
53 `tsc` errors / 19 ESLint errors (2026-11-22), all pre-existing: missing files (`activities.controller`,
`activity-types.service`, `photos.service`, `common/events`, `photos.module`), truncated
`activities.service.ts`, service body living in `backend/modules/activities.module.ts`
(self-injection `types: ActivitiesService`, `new type.ObjectId`, `@ts-ignore`).
CI runs typecheck/lint as **non-blocking** until fixed; then set repo variable `STRICT_CHECKS=true`.

### Q-D2 — Dart formatting
Status: open · Owner: flutter
`dart format` would change `frontend/lib/screens/home_screen.dart` and `record_activity_screen.dart`.
Non-blocking in CI until a dedicated `style:` PR formats them.
