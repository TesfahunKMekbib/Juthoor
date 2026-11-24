# Spec — Add an Activity (FR-009–012, 015, 017–021, 023, 025–028, 054; partial 051)

Owner scope (2026-11-25): one use case: select activity → enter data → upload photo evidence → validate
location → submit → AI verification → show status. **No authentication**: predefined dev participant (ADR-0010).

## Requirements in scope (verbatim IDs; text in `docs/requirements/functional.md`)
| FR | P | Scope in this feature | Deferred part |
|---|---|---|---|
| FR-009 | S | show required fields, quantity ranges, evidence criteria | points-award rules (Rewards out of scope) |
| FR-010 | M | type/description/date/location/quantity/photo entry | server-side drafts save/reopen/delete (Q-E7) |
| FR-011 | M | category fields enforced (species; kg + receipt; bags + area + before/after; meter readings L/kWh) | — |
| FR-012 | S | manual emirate/area when location denied/unavailable | — |
| FR-015 | M | idempotent submit; submitted details immutable | revisions (with FR-027 Slice 3) |
| FR-017 | M | details, evidence, outcome, accepted quantity to owner | awarded points, impact |
| FR-018/021 | M | required fields, unit, min/max; format by magic bytes, size, count, kinds | — |
| FR-019 | M | future date rejected (server + date picker) | campaign/challenge windows (FR-013 out) |
| FR-020 | M | UAE boundary + emirate from in-memory GPS | program geofences (FR-013 out); dataset Q-E6 |
| FR-023 | M | field-level coded errors, form keeps data | — |
| FR-025–028 | M | AI screening via interface + mock, decision, retries | live provider (Q-C3); FR-022 admin thresholds |
| FR-051 | M | status visible on status screen (polling) | in-app inbox, email/push (Notification) |
| FR-054 | M | audit entry per decision and AI flag | reward issuance, admin config entries; retention (Q-A6b, not blocking) |
| FR-032/046 | M | `ActivityAccepted` event keyed by `activityId`, no subscriber | points/progress/impact |
Not in scope: FR-001 (deferred, Q-E1), FR-013, FR-016 filters, FR-022, FR-024 (ADR-0006), campaigns, teams,
leaderboards, rewards, recommendations, admin. Related NFRs: 002, 004, 007, 008, 009, 013, 016, 017, 019,
023, 024, 025, 030, 033.

## Acceptance criteria → planned test
`R` = `submission-rules.spec.ts`, `E` = `backend/test/activities.e2e-spec.ts`, `V` = `verification/*.spec.ts`, `W` = Flutter widget test.
1. GET `/api/activity-types` returns only published types with `formFields`, `amount{unit,min,max}`, `photoRules` (FR-009) — E `lists only published types with their rules (FR-009)`.
2. Each seeded FR-007 category enforces its FR-011 fields; missing one → 422 `answers.required` (FR-011) — R `requires <field> for <category> (FR-011)`; `dev-seed.spec` `seeds only FR-007 categories (FR-007, Q-A4b)`.
3. `location.source=manual` with valid emirate passes without coordinates; the form offers manual entry when permission is denied (FR-012) — R, W `offers manual location when permission denied (FR-012)`.
4. Same `Idempotency-Key` twice (sequential and concurrent) → one record; replay returns 200 with the same id (FR-015) — E `repeat submission creates one record (FR-015)`.
5. No endpoint changes a submitted activity's details; `decide` alters only status fields (FR-015) — `activities.service.spec` `decide changes only status fields (FR-015)`.
6. Quantity at min and max accepted; min−0.01 / max+0.01 → `amount.outOfRange`; unit always from the type (FR-018) — R boundary tests.
7. `doneAt` > now + 5 min → 422 `doneAt.future` (FR-019, Q-E3); picker `lastDate` = today and future times blocked — R, W `date picker forbids future dates (FR-019)`.
8. GPS outside UAE → 422 `location.outsideUae`; inside → stored emirate is the derived one (FR-020) — `geo-rules.spec`.
9. Raw MongoDB activity document and logs contain no coordinates; stored location is ciphertext (NFR-007, NFR-004) — E `persists no coordinates and encrypts location (NFR-004, NFR-007)`.
10. File whose bytes are not JPEG/PNG/WEBP (whatever its MIME header) → `photos.typeNotAllowed`; > limit → `photos.tooLarge`; count/kind violations coded (FR-021) — `image-signature.spec`, R, E.
11. Stored image has no EXIF/GPS metadata (NFR-007, NFR-008) — `evidence-sanitizer.spec` `strips EXIF GPS (NFR-008)`.
12. 422 body is `{message, code, errors[{field, code, message, params?}]}`; every code has en + ar ARB text (FR-023, NFR-016) — E; W `maps every backend error code (FR-023)`; `arb_parity_test`.
13. After a 422 the form still holds every entered value and photo; errors show under their fields (FR-023) — W `keeps entered data after validation errors (FR-023)`.
14. Rules failure → assessor never called; rules pass → called once with photos, type, description (FR-018, FR-025) — E/V `never calls AI when rules fail (FR-018)`.
15. score ≥ accept threshold (equality included) → accepted (FR-026); mapping per Q-E2 → returned / rejected with `resultReasonCode` (FR-027) — V `decideOutcome` table tests.
16. Assessor error/timeout → `pending_technical_processing`; retried per config; success → final status; exhaustion per Q-E4; no second job, record or `ActivityAccepted` (FR-028) — V `retries without duplicates (FR-028)`.
17. `ActivityAccepted` published once per `activityId` on normal and retry paths (at-least-once only across a process crash; payload carries `activityId` for subscriber dedupe), never for other outcomes (FR-032, FR-046) — V `publishes Accepted once per activity (FR-046)`.
18. Each decision and each AI flag appends one audit entry `{at, action, recordId, ruleVersion, modelVersion, outcome}`, IDs only; no update/delete API; replayed append is ignored (FR-054) — `audit.service.spec`.
19. Status screen shows submitted → final status without leaving the screen; copy states AI result is advisory, not proof (FR-017, FR-025, FR-051 partial) — W `shows decided status (FR-017)`.
20. Home → submission confirmation in ≤ 4 transitions (NFR-013) — W `submits within four transitions (NFR-013)`.
21. All new screens render in Arabic RTL (NFR-016, NFR-017) — W `renders RTL in Arabic`.
22. Another participant's activity/photo → 404; owner → 200 (NFR-009, NFR-025) — E both paths.
23. Dev participant only when `NODE_ENV=development` + flag; flag elsewhere → boot fails; production without flag → 401 (ADR-0010) — `dev-participant-mode.spec`, E.
24. Mock assessment recorded ≤ 30 s after submission (NFR-002, mock only) — E timing.

## Conflicts / open questions
Q-E1 (auth deferral, ADR-0010), Q-E2 (Returned vs Rejected) **BLOCKED B9**, Q-E3 (422 vs Rejected)
**BLOCKED B2/B5**, Q-E4 (exhausted retries), Q-E5 (seed values) **BLOCKED B6**, Q-E6 (boundary data)
**BLOCKED B4b**, Q-E7 (depth), Q-A4b (Transport/Other chips) **BLOCKED F2**, Q-C3 (live AI, not blocking),
Q-A6b (audit retention, not blocking: no TTL is created). Code drift: `activity.schema.ts` still uses
pre-ADR-0005 status labels and no `draft`; `docs/traceability.md` paths point at removed layouts.
