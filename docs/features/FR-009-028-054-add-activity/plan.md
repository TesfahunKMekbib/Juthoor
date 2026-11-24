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
2. `EvidenceAssessor.assess({ photos, activityType, description })` → `{ score 0..1, flags[], modelVersion,
   providerId }` with `AI_TIMEOUT_MS`. Interface in `modules/integration/ai/`; `AI_PROVIDER=mock` default;
   `MockEvidenceAssessor` modes `fixed` (score `AI_MOCK_SCORE`), `scripted` (tests), `unavailable` (FR-028 demo).
3. Error/timeout → `ActivitiesService.markPending(id, 'processing.retrying')`; `nextAttemptAt = now +
   VERIFY_BACKOFF_BASE_MS·2^(n−1)`; after `VERIFY_MAX_ATTEMPTS` → job `exhausted`, reason
   `processing.failedPermanently` (Q-E4).
4. Success → pure `decideOutcome(score, thresholds)` (Q-E2) → `ActivitiesService.decide()` (conditional on
   status ∈ {submitted, pending_technical_processing}; only the winning write continues) → audit append →
   publish `ActivityDecided` and, if accepted, `ActivityAccepted` → job `done`.
   AI output is advisory (FR-025): stored as score + flags, never shown as "verified"/"proof".
Thresholds `AI_ACCEPT_THRESHOLD` > `AI_REJECT_THRESHOLD` in [0,1], validated at boot (FR-022 admin UI deferred).
`EventsService.subscribe` gains async-handler support (awaits and logs rejections by `activityId` only).

**Live AI provider (Q-C3) — owner decides:** provider/model; where photos are processed and the data-processing
terms (photos may show faces/homes; FR-024 blurring deferred, so decide whether unblurred photos may leave the
platform); cost per call; latency vs NFR-002 (30 s); pinned model version; score calibration → threshold values;
credential handling. Everything in this plan is buildable and demo-able on the mock before that.

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
| B7 | backend | `integration/ai`: `EvidenceAssessor`, mock (3 modes), provider factory, timeout | — | M | 12 |
| B8 | backend | `modules/audit`: append-only service, idempotent append | — | S | 13 |
| B10 | backend | `decide` from pending, `markPending`, reason codes, new events, async subscribe | B2 | M | 14 |
| B9a | backend | pure `decideOutcome` + `retryPolicy` (**BLOCKED Q-E2, Q-E4**) | — | S | 14 |
| B9b | backend | `modules/verification`: jobs schema, enqueue, worker/lease, sweeper, audit, events | B5 B7 B8 B9a B10 | L | 15 |
| F5 | flutter | status screen: all states, reason codes, polling, advisory copy | F4 | S | 16 |
| Q3 | qa | e2e on mock: AC 14–18, 24; outage → pending → retry → accepted | B9b | M | 17 |
| S2 | security | review slice 2: audit content, provider data, logs | Q3 | — | review.md |
**Parallel** (contract fixed by this plan, disjoint files): B1 ‖ B2 ‖ B3+B4a ‖ B4b ‖ B7 ‖ B8 ‖ B9a ‖ F1 from day one;
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
