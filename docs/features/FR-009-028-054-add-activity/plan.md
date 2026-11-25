Status: approved (2026-11-25, by project owner — "approve with recommendations"; AI verification agent amendment in ADR-0012)

# Plan — Add an Activity (spec: `./spec.md`)
Proposed ADRs approved together with this plan: ADR-0010 (dev participant), ADR-0011 (packages, privacy mechanisms).

## 1. API contract (REST + JSON, NFR-030; global prefix `/api`)
| Method · Path | Who | Success | Errors |
|---|---|---|---|
| GET `/api/activity-types` · `/:id` (exists) | public | 200 published types + `formFields`, `amount{unit,min,max}`, `photoRules` (FR-009) | 404 `activityType.notFound` |
| POST `/api/activities` | participant | 201 `ActivityView` (created) · 200 same view (replay, FR-015) | 400 `request.malformed` / `request.idempotencyKeyMissing`, 401 `auth.required`, 413 `upload.tooLarge`, 422 |
| GET `/api/activities` | owner | 200 `{ items: ActivityView[] }` newest first, max 100 (no FR-016 filters) | 401 |
| GET `/api/activities/:id` | owner | 200 `ActivityView` (FR-017) | 401, 404 `activity.notFound` (also for other owners) |
| GET `/api/activities/:id/photos/:photoId` | owner | 200 image bytes, `Cache-Control: private, no-store` (NFR-009) | 401, 404 |

**POST body** `multipart/form-data`; header `Idempotency-Key: <uuid>` (required; the app reuses it on retry).
Part `data` (JSON string), parts `photos` (1..`UPLOAD_MAX_FILES`, order = `photoKinds`):
```json
{ "activityTypeId": "665f…", "description": "Planted 3 ghaf seedlings", "doneAt": "2026-11-24T07:30:00+04:00",
  "location": { "source": "device", "coordinates": { "lat": 24.45, "lng": 54.38 }, "area": "Al Reem" },
  "answers": { "species": "Ghaf" }, "amount": { "value": 3 }, "photoKinds": ["photo"] }
```
Manual (FR-012): `"location": { "source": "manual", "emirate": "Abu Dhabi", "area": "Al Reem" }`.
Coordinates are used in memory only (ADR-0006) and never stored, echoed or logged.

**ActivityView**
```json
{ "id": "…", "status": "submitted", "resultReasonCode": null,
  "activityType": { "id": "…", "code": "TREE_PLANTING", "category": "planting", "name": { "en": "…", "ar": "…" } },
  "description": "…", "doneAt": "…", "location": { "emirate": "Abu Dhabi", "area": "Al Reem" },
  "answers": [{ "key": "species", "label": { "en": "Species", "ar": "…" }, "value": "Ghaf" }],
  "amount": { "value": 3, "unit": "trees" }, "acceptedAmount": null,
  "photos": [{ "id": "…", "kind": "photo", "url": "/api/activities/<id>/photos/<photoId>", "mimeType": "image/jpeg", "sizeBytes": 812345 }],
  "statusHistory": [{ "from": null, "to": "submitted", "reasonCode": null, "at": "…" }],
  "submittedAt": "…", "updatedAt": "…" }
```
`status` ∈ `submitted | accepted | returned_for_correction | rejected | pending_technical_processing`
(`draft` exists in the enum per ADR-0005, unused this phase). `acceptedAmount` = `amount` when accepted, else null.

**Errors** (NFR-016: `message` is an English fallback only; the app renders ARB text by `code` + `params`):
```json
422 { "message": "Please fix the highlighted fields.", "code": "validation.failed",
      "errors": [{ "field": "amount.value", "code": "amount.outOfRange", "message": "Enter between 1 and 50 trees.",
                   "params": { "min": 1, "max": 50, "unit": "trees" } }] }
other { "statusCode": 404, "code": "activity.notFound", "message": "Activity not found" }
```
Field codes: `activityType.required|unavailable`, `description.required|tooLong`, `doneAt.required|future`,
`location.sourceInvalid|emirateInvalid|outsideUae|coordinatesInvalid|areaTooLong`,
`answers.required|notNumber|invalidChoice|tooLong` (params `fieldKey`), `amount.required|outOfRange`,
`photos.tooFew|tooMany|kindMissing|kindUnknown|typeNotAllowed|tooLarge|unreadable`.
Status reason codes: `verification.evidenceUnclear` (returned), `verification.evidenceUnrelated` (rejected),
`processing.retrying`, `processing.failedPermanently` (pending; Q-E4). Deterministic failures never create a
record (Q-E3).

## 2. Identity (ADR-0010)
Global `ParticipantGuard` + `@CurrentParticipant()`; resolver bound by `PARTICIPANT_RESOLVER`. Default → 401.
`DevParticipantModule` loaded only when `NODE_ENV=development` **and** `JUTHOOR_DEV_PARTICIPANT=true`; flag set
under any other `NODE_ENV` → `main.ts` throws before boot. ESLint forbids importing `src/dev/**`; prod image
deletes `dist/src/dev`. Tests listed in ADR-0010 §6.

## 3. Processing pipeline
Submit (sync, < 3 s NFR-001): guard → multer limits (`UPLOAD_MAX_FILE_MB` hard cap, `UPLOAD_MAX_FILES`) →
parse `data` → `checkSubmission` (pure, coded errors, `RULES_VERSION`) → **magic-byte check** (pure
`image-signature.ts`, header MIME ignored) → **location**: device → `GeoBoundaryProvider.locate(lat,lng)` →
emirate or `outsideUae`; manual → emirate enum → **sanitize** (`EvidenceSanitizer`/sharp re-encode, EXIF gone,
generated file name) → store via `PhotoStorage` → save activity with `locationEnc` (AES-256-GCM) → publish
`ActivitySubmitted`.
Verify (async, Verification domain, AI only after rules pass, FR-018):
1. `ActivitySubmitted` → insert `verificationJobs` (unique `activityId`, idempotent) and try immediately.
   Sweeper every `VERIFY_POLL_MS` claims due jobs (`findOneAndUpdate` with `lockedUntil` lease → safe with N
   instances, NFR-027) and re-enqueues submitted activities lacking a job (`ActivitiesService.findWaiting`).
2. `VerificationAgent.run(evidence)` (ADR-0012, `modules/verification/agent/`) over the `MultimodalModel` port
   (`modules/integration/ai/`, `generate({requestTag, system, parts, responseSchema, maxTokens, timeoutMs}) →
   {json, modelVersion, providerId, usage}`, typed `ModelError`; `AI_PROVIDER=mock` default | `gemini` — Google Gemini
   API, paid, `integration/ai/gemini/` via built-in `fetch`, no SDK; `AI_MODEL`, `GEMINI_API_KEY` from env). Boot
   fails if `AI_PROVIDER != mock` and `NODE_ENV=production` (privacy review first, NFR-009). Input: sanitized, downscaled photos (`AI_IMAGE_MAX_PX`, re-encoded) + kinds, type rules
   and evidence criteria, description, answers, amount/unit, `doneAt` date, emirate — never coordinates or user ids.
   Steps: ① `evidence` (1 call, per-photo relevance/quality/criteria/flags/confidence) → ② `claim` (1 call,
   amount plausibility, FR-011 before/after, description and date match) → ③ `followup` (≤ 1 call, only on
   confidence < `AI_FOLLOWUP_BELOW` or conflict) → ④ pure `aggregate()` → `{score, flags[]}` → returns
   `{score, flags, steps[{tag, modelVersion, providerId}], callCount, promptVersion, schemaVersion, aggregationVersion}`.
   Each response is checked by a pure schema validator (enums/numbers only); invalid → one repair call; still
   invalid → `ModelError(invalid_output)`. Guards: `AI_MAX_CALLS`, `AI_TOTAL_BUDGET_MS`, per call
   `min(AI_TIMEOUT_MS, remaining)`, skip repair/follow-up below `AI_MIN_CALL_MS`, `AI_MAX_OUTPUT_TOKENS`.
   Participant text is JSON-quoted untrusted data; photo text is ignored and flagged. Hard flags cap the score
   below accept; `people_visible` never changes the outcome. Mock (`MockMultimodalModel`, keyed by `requestTag`)
   modes `fixed` (aggregates to `AI_MOCK_SCORE`), `scripted`, `unavailable`, `malformed`.
3. `ModelError` (any kind), budget exhausted or invalid output after repair → never a decision →
   `ActivitiesService.markPending(id, 'processing.retrying')`; `nextAttemptAt = now +
   VERIFY_BACKOFF_BASE_MS·2^(n−1)`; after `VERIFY_MAX_ATTEMPTS` → job `exhausted`, reason
   `processing.failedPermanently` (Q-E4).
4. Success → pure `decideOutcome(score, thresholds)` (Q-E2) → `ActivitiesService.decide()` (conditional on
   status ∈ {submitted, pending_technical_processing}; only the winning write continues) → audit append →
   publish `ActivityDecided` and, if accepted, `ActivityAccepted` → job `done`.
   AI output is advisory (FR-025): stored as score + flags, never shown as "verified"/"proof".
   Extends §4: `verificationJobs.result` and the `verification.decision` audit entry also carry `providerId`,
   per-step `modelVersion`, `promptVersion`, `schemaVersion`, `aggregationVersion`, `callCount`; one
   `verification.aiFlag` entry per flag (`flagCode` `ai.<flag>`). IDs/codes only, no photo, text or model
   output (ADR-0008). New config (validated at boot): `AI_MOCK_MODE` adds `malformed`; `AI_MAX_CALLS=5`,
   `AI_TOTAL_BUDGET_MS=24000`, `AI_MIN_CALL_MS=3000`, `AI_FOLLOWUP_BELOW=0.5`, `AI_IMAGE_MAX_PX=1024`,
   `AI_MAX_OUTPUT_TOKENS=800`; `AI_TIMEOUT_MS` is per call, capped by the remaining budget; `AI_MODEL` and
   `GEMINI_API_KEY` (placeholder only in `.env.example`, required when `AI_PROVIDER=gemini`).
Thresholds `AI_ACCEPT_THRESHOLD` > `AI_REJECT_THRESHOLD` in [0,1], validated at boot (FR-022 admin UI deferred).
`EventsService.subscribe` gains async-handler support (awaits and logs rejections by `activityId` only).

**Live AI provider (Q-C3) — owner decided Google Gemini (paid) for non-production (ADR-0012).** Still open before
production: privacy review of the data-processing terms (retention, training use, region; photos may show
faces/homes; FR-024 blurring deferred) and a new ADR lifting the production guard; cost (2–5 calls per attempt);
latency vs NFR-002 (30 s); which Gemini model id to set in `AI_MODEL`; score/aggregation calibration → thresholds.
Everything in this plan is buildable and demo-able on the mock; tests never use the network.

## 4. Data model (each domain owns its collection)
| Collection (domain) | Change | Index → FR |
|---|---|---|
| `activities` (Activity) | status enum per ADR-0005; `location` → `locationEnc {v,iv,tag,ct}` (NFR-004, no coordinates, NFR-007); `resultReason` → `resultReasonCode`; `statusHistory.reasonCode`; photo `fileName` generated | existing `{userId,submitKey}` unique (FR-015), `{status,submittedAt}` (FR-028 sweeper) |
| `verificationJobs` (Verification, new) | `activityId, state (queued / running / done / exhausted), attempts, nextAttemptAt, lockedUntil, lastErrorCode, result{score,flags,modelVersion,providerId,assessedAt}` | `{activityId}` unique (FR-015, FR-028); `{state,nextAttemptAt}` (FR-028) |
| `auditEntries` (Audit, new, append-only) | `at, action (verification.decision / verification.aiFlag), recordType, recordId, ruleVersion, modelVersion, outcome, score?, flagCode?, idempotencyKey` — IDs only (ADR-0008) | `{idempotencyKey}` unique (FR-054); `{recordId,at}` (FR-055 later). **No TTL** (Q-A6b, not blocking) |
Events (`common/events`): `ActivitySubmitted` (exists), `ActivityDecided {activityId,userId,status,reasonCode,decidedAt}`,
`ActivityAccepted {activityId,userId,activityTypeCode,category,amount,doneAt}` — no subscriber this phase (FR-032/046).
Config (`.env.example`, validated at boot): `JUTHOOR_DEV_PARTICIPANT`, `LOCATION_ENCRYPTION_KEY`, `UPLOAD_MAX_FILE_MB=8`,
`UPLOAD_MAX_FILES=6`, `AI_PROVIDER=mock`, `AI_MOCK_MODE`, `AI_MOCK_SCORE`, `AI_ACCEPT_THRESHOLD=0.70`,
`AI_REJECT_THRESHOLD=0.30`, `AI_TIMEOUT_MS=20000`, `VERIFY_MAX_ATTEMPTS=5`, `VERIFY_BACKOFF_BASE_MS=30000`, `VERIFY_POLL_MS=2000`.

## 5. Flutter
Packages per ADR-0011: `http`, `provider`, `image_picker`, `geolocator`, `http_parser`. `lib/services/activity_api.dart`
(abstract) + `HttpActivityApi`; `test/fakes/fake_activity_api.dart` for hermetic widget tests; `ApiException{status, code,
fieldErrors}`; `lib/services/error_messages.dart` maps every code above to an ARB key (en + ar), unknown → generic.
Flow (NFR-013): Home →① RecordActivityScreen (one scrolling form: category chips + type from API, dynamic `formFields`,
amount with unit and range hint, photo slots per `photoRules`, location, date) →② ActivityStatusScreen (= confirmation,
then live status). Worst case counting the system camera: Home→Form→Camera→Form→Status = 4.
- Date picker (FR-019): `lastDate: DateTime.now()`; a time later than now on today shows `errDoneAtFuture`.
- Location: requested only on submit; denied/unavailable → manual emirate dropdown + area (FR-012).
- 422 → errors under fields, all state kept (FR-023); `ActivityFormController` (ChangeNotifier) owns the state.
- Status screen polls `GET /activities/:id` every 3 s while submitted/pending, stops after 60 s (pull to refresh).
  Shows six states with localized text and reason; advisory note "AI screening is an estimate, not proof" (FR-025).
- Removed from the mock (owner confirms): "Save draft" (Q-E7), "Link to" (FR-013 out), Transport/Other chips (Q-A4b).
- `MyActivitiesScreen` from home: list of own submissions → status screen.

## 6. Tasks (S < 150, M 150–300, L 300–400 changed lines)
| ID | Tag | Task | After | Size | PR |
|---|---|---|---|---|---|
| **Slice 1** | | | | | |
| B1 | backend, security | identity seam, dev module, boot check, config validation, `/api` prefix, `.env.example`, lint rule | — | M | 1 |
| B2 | backend | ADR-0005 enum; coded errors + params in `submission-rules.ts`; 422 filter; `RULES_VERSION` (Q-E3) | — | M | 2 |
| B3 | backend, security | `image-signature.ts` + `EvidenceSanitizer` (sharp) in `integration/image` | — | M | 3 |
| B4a | backend, security | `common/crypto/field-cipher.ts` AES-256-GCM | — | S | 3 |
| B4b | backend | `integration/geo` provider + pure point-in-polygon + dataset (**BLOCKED Q-E6**) | — | M | 4 |
| B5 | backend | `ActivitiesController` + DTO parse; wire B3/B4 into `submit`; owner-only photo route; view changes | B1 B2 B3 B4a | L | 5 |
| B6 | backend | `npm run seed:dev` FR-007 types with FR-011 fields (**BLOCKED Q-E5**) | B1 B2 | S | 6 |
| Q1 | qa | e2e slice 1: AC 1, 4, 9, 10, 12, 22, 23 (+ device AC 8 after B4b) | B5 | M | 7 |
| F1 | flutter | packages, `ActivityApi`, models, fake, error-code mapper + ARB keys | plan approval | M | 8 |
| F4 | flutter | ActivityStatusScreen (submitted view), MyActivitiesScreen, home entry | F1 | M | 9 |
| F2 | flutter | RecordActivityScreen on API: chips/type, dynamic fields, amount hints, date fix, field errors (**chips BLOCKED Q-A4b**) | F1 | L | 10 |
| F3 | flutter | photo slots, location device/manual, submit + Idempotency-Key, navigate to status | F2 F4 | M | 11 |
| Q2 | qa | widget flow: AC 13, 20, 21 | F3 | S | 11 |
| S1 | security | review slice 1: dev guarantees, uploads, crypto, logs, ownership | Q1 | — | review.md |
| **Slice 2** | | | | | |
| B7a | backend | `integration/ai`: `MultimodalModel` port + `ModelError`, provider factory (`AI_PROVIDER`), `MockMultimodalModel` (fixed/scripted/unavailable/malformed by `requestTag`), timeout wrapper, `image-prep.ts` downscale (sharp), config validation + production guard (`AI_PROVIDER != mock` + `NODE_ENV=production` → boot fails, unit-tested, AC 32) (ADR-0012) | — | M | 12a |
| B7c | backend, security | `integration/ai/gemini/` adapter on built-in `fetch` (REST, no SDK): request mapping (text/image parts, response schema, temperature 0, no tools), `AI_MODEL`, `GEMINI_API_KEY`, error → `ModelError` kinds; contract tests on recorded/fake HTTP responses, no real network | B7a | M | 12d |
| B7b | backend | `verification/agent`: PR 12b pure parts — `prompts/*.ts` + `PROMPT_VERSION`, prompt builder (quoted untrusted data), step schemas + pure validator, `aggregate()`, follow-up trigger, budget calc (unit tests, AC 25–31); PR 12c `VerificationAgent` runner (steps, repair, budget, follow-up) tested on the mock | B7a (12b may start in parallel: uses only the port types fixed in §3) | M+M | 12b, 12c |
| B8 | backend | `modules/audit`: append-only service, idempotent append | — | S | 13 |
| B10 | backend | `decide` from pending, `markPending`, reason codes, new events, async subscribe | B2 | M | 14 |
| B9a | backend | pure `decideOutcome(score from aggregate())` + `retryPolicy` (Q-E2, Q-E4 decided); `ModelError` / invalid output → retry, never a decision | — | S | 14 |
| B9b | backend | `modules/verification`: jobs schema (+ agent metadata), enqueue, worker/lease calling `VerificationAgent`, sweeper, audit (decision + one entry per flag, versions, call count), events | B5 B7b B8 B9a B10 | L | 15 |
| F5 | flutter | status screen: all states, reason codes, polling, advisory copy | F4 | S | 16 |
| Q3 | qa | e2e on mock: AC 14–18, 24; outage → pending → retry → accepted | B9b | M | 17 |
| S2 | security | review slice 2: audit content, provider data, logs | Q3 | — | review.md |
**Parallel** (contract fixed by this plan, disjoint files): B1 ‖ B2 ‖ B3+B4a ‖ B4b ‖ B7a ‖ B7b(12b) ‖ B8 ‖ B9a ‖ F1 from day one (then B7c ‖ B7b(12c) after B7a);
then F2 ‖ F4 ‖ B5; B6 ‖ Q1. Sequential: anything touching `activities.service.ts` (B5 → B10 → B9b) and
`record_activity_screen.dart` (F2 → F3). `/document` updates `docs/traceability.md` rows (paths there are stale) per PR.
**New packages:** backend `sharp`; Flutter `http`, `provider`, `image_picker`, `geolocator`, `http_parser` (ADR-0011).

## Approval gate
Implementation skills refuse this plan until the line `Status: approved (<date>, by <user>)` replaces line 1.
The owner approves by deciding:
1. Accept ADR-0010 and ADR-0011 (or name changes); confirm FR-001 is *deferred* (Q-E1).
2. Q-E2 outcome mapping and threshold defaults; Q-E3 422-not-Rejected; Q-E4 exhausted handling and retry defaults.
3. Q-E5 seed values (B6); Q-E6 boundary dataset (B4b) — until decided, only manual location works.
4. Q-A4b: hide Transport/Other (recommended) or show disabled; removal of "Save draft" / "Link to" (Q-E7).
5. Q-E7: FR-010 drafts and FR-027 replacement evidence deferred (optional Slice 3), FR-024 stays deferred.
Not blocking: Q-C3 live provider (list in §3), Q-A6b retention (no TTL created).

## Implementation notes (2026-11-25, `/document`; verified against the code on branch `feat/FR-009-028-054-add-activity`)
Deviations from / clarifications of the plan above (backend paths relative to `backend/src/`):
- Statuses are the ADR-0005 set (`modules/activity/activity.schema.ts`, `draft` present but unused); location persisted only as `locationEnc`.
- Deterministic FR-018–021 failures → `422`, no record created (Q-E3; `ValidationFailedException` thrown before `create`).
- Multer: `FilesInterceptor('photos')`, `fieldSize` 64 KiB, `fields` 4, `parts` = files + 4 (`common/config/app-config.ts` `uploadLimits`).
- Extra codes beyond §1: `photos.unexpectedField`, `request.malformed` (400), `request.idempotencyKeyMissing` (400),
  `upload.tooLarge` (413), `answers.invalidChoice`, `answers.notNumber`; app-only `network.unavailable` (`frontend/lib/services/api_exception.dart`).
- Real AI provider allowed only when `NODE_ENV` is exactly `development` or `test` (stricter than "not production";
  `assertAiProviderAllowed` in `integration/ai/ai-config.ts`). `gemini` requires both `GEMINI_API_KEY` and `AI_MODEL`.
- Gemini adapter: REST via `fetch`, `generationConfig.responseJsonSchema`, images as `inlineData` (base64); no SDK.
- Worker settings added: `VERIFY_WORKER`, `VERIFY_LEASE_MS` (must be ≥ `AI_TOTAL_BUDGET_MS` + 30 s), `VERIFY_BATCH_SIZE`; also `AI_MAX_IMAGES`.
- Every technical failure, including non-transient refusals (`provider.blocked`, `provider.auth`, …), goes through
  `retryPolicy` → retry → `exhausted` (Q-E4); none is mapped to Returned for Correction.
- No evidence-criteria field exists on activity types: the agent uses the type's English `description` as its single
  criterion (`verification/agent-input.ts`). A real criteria list would need a requirement/schema change.
- Geo dataset (`integration/geo/data/uae-adm1.json`, `ATTRIBUTION.md`): geoBoundaries metadata lists the source as
  OpenStreetMap under ODbL 1.0, not CC BY 4.0 — owner to confirm (Q-E6).
- `npm run test:e2e` (`jest.e2e.config.cjs`, needs MongoDB) is separate from `npm test`; CI does not run it yet (Q-E8).
- `npm run build` (`scripts/build.mjs`) runs tsc and copies `src/**/data/*.json` (geo dataset) into `dist/`.
- `dist/src/dev` is still compiled (no Dockerfile yet, so "prod image deletes `dist/src/dev`" is not implemented);
  the runtime guard (`common/config/dev-participant-mode.ts`) refuses the dev participant outside `development`.
- `backend/.env.example` not written (permission rules block it, Q-E9); the table below stands in for it.

### Configuration (env vars; read at boot, invalid values fail boot unless noted)
| Variable | Default | Purpose | Source |
|---|---|---|---|
| `NODE_ENV` | (unset) | `development` enables the dev participant; `development`/`test` allow a real AI provider | app-config.ts, ai-config.ts |
| `PORT` | 3000 | HTTP port (1–65535) | app-config.ts |
| `MONGODB_URI` | `mongodb://localhost:27017/juthoor` | MongoDB connection | app-config.ts, app.module.ts |
| `LOCATION_ENCRYPTION_KEY` | required | 32-byte AES-256-GCM key (64 hex or base64) for `locationEnc` (NFR-004) | app-config.ts |
| `JUTHOOR_DEV_PARTICIPANT` | (unset) | `true`/`false`; `true` only with `NODE_ENV=development` (ADR-0010) | app-config.ts, dev-participant-mode.ts |
| `UPLOAD_MAX_FILE_MB` | 8 | Per-photo size cap, 1–50 (FR-021) | app-config.ts |
| `UPLOAD_MAX_FILES` | 6 | Photos per submission, 1–20 (FR-021) | app-config.ts |
| `AI_PROVIDER` | `mock` | `mock` \| `gemini` (NFR-023) | ai-config.ts |
| `AI_MOCK_MODE` | `fixed` | `fixed` \| `scripted` \| `unavailable` \| `malformed` | ai-config.ts |
| `AI_MOCK_SCORE` | 0.85 | Score the `fixed` mock aggregates to, 0–1 | ai-config.ts |
| `AI_MODEL` | (unset) | Gemini model id; required for `gemini` | ai-config.ts |
| `GEMINI_API_KEY` | (unset) | Secret; required for `gemini`; never logged | ai-config.ts |
| `AI_TIMEOUT_MS` | 20000 | Per-call timeout, capped by remaining budget | ai-config.ts |
| `AI_MAX_CALLS` | 5 | Model calls per attempt, 1–20 | ai-config.ts |
| `AI_TOTAL_BUDGET_MS` | 24000 | Time budget per attempt (NFR-002) | ai-config.ts, verification-config.ts |
| `AI_MIN_CALL_MS` | 3000 | Skip repair/follow-up below this remaining time | ai-config.ts |
| `AI_FOLLOWUP_BELOW` | 0.5 | Confidence that triggers the follow-up step | ai-config.ts |
| `AI_IMAGE_MAX_PX` | 1024 | Downscale bound for AI images, 64–4096 | ai-config.ts |
| `AI_MAX_IMAGES` | 6 | Images sent per attempt, 1–20 | ai-config.ts |
| `AI_MAX_OUTPUT_TOKENS` | 800 | Output token cap per call | ai-config.ts |
| `AI_ACCEPT_THRESHOLD` | 0.70 | score ≥ → Accepted (FR-026, Q-E2) | verification-config.ts |
| `AI_REJECT_THRESHOLD` | 0.30 | score < → Rejected; must be < accept (FR-027, Q-E2) | verification-config.ts |
| `VERIFY_MAX_ATTEMPTS` | 5 | Attempts before `exhausted` (Q-E4) | verification-config.ts |
| `VERIFY_BACKOFF_BASE_MS` | 30000 | Backoff base, doubles per attempt | verification-config.ts |
| `VERIFY_POLL_MS` | 2000 | Sweeper interval, ≥ 100 | verification-config.ts |
| `VERIFY_WORKER` | `on` | `on`/`off` background worker | verification-config.ts |
| `VERIFY_LEASE_MS` | 60000 | Job lease; ≥ `AI_TOTAL_BUDGET_MS` + 30000 (NFR-027) | verification-config.ts |
| `VERIFY_BATCH_SIZE` | 5 | Jobs per sweep, 1–100 | verification-config.ts |
Note: `uploadLimits` (multer) silently falls back to defaults on invalid upload values; `loadAppConfig` reports them as boot errors.
