Status: approved (2026-11-26, by project owner) — stakeholder review of requirement deltas pending (Q-A4b)

# Plan — "Other" activity type (spec: `./spec.md`, change request: `docs/requirements-change-requests/CR-001-other-activity.md`)
Extends the contract in `docs/features/FR-009-028-054-add-activity/plan.md` §1. Everything not listed here is unchanged.
The contract below is **fixed** (coordinator, 2026-11-26); backend and Flutter build to it in parallel.

## 1. API contract delta (REST + JSON, NFR-030)
**GET `/api/activity-types`** — new published type (existing types unchanged):
```json
{ "id": "…", "code": "OTHER", "category": "other",
  "name": { "en": "Other environmental activity", "ar": "نشاط بيئي آخر" },
  "description": { "en": "Another environmental activity: name it, describe it and show it in the photos.",
                   "ar": "نشاط بيئي آخر: اذكر اسمه وصِفه وأظهره في الصور." },
  "formFields": [{ "key": "activityName", "label": { "en": "Activity name", "ar": "اسم النشاط" },
                   "type": "text", "options": [], "required": true }],
  "amount": { "optional": true, "units": ["items", "kg", "bags", "liters", "kWh", "m2", "other"],
              "unit": "items", "min": 0.01, "max": 100000 },
  "photoRules": { "minPhotos": 1, "maxPhotos": 4, "neededKinds": ["photo"], "maxSizeMB": 8 } }
```
`unit/min/max` stay present so the response shape is backward compatible (`unit` = first allowlisted unit, the
default selection). For every allowlisted unit the range is 0.01–100000. Existing types: `optional` false/absent,
`units` empty/absent → today's behaviour.
**POST `/api/activities`** `data` for OTHER (no quantity → omit `amount`):
```json
{ "activityTypeId": "…", "description": "Collected mangrove seeds for the nursery", "doneAt": "2026-11-26T08:00:00+04:00",
  "location": { "source": "manual", "emirate": "Abu Dhabi", "area": "Eastern Mangroves" },
  "answers": { "activityName": "Mangrove seed collection" },
  "amount": { "value": 3, "unit": "bags" }, "photoKinds": ["photo"] }
```
New field codes (422 shape unchanged): `amount.unitRequired` (field `amount.unit`, value without unit),
`amount.unitInvalid` (field `amount.unit`, unit not in `units`; params `{unit}`). Unit given without value →
`amount.required`. `activityName`: trimmed, 1–60 chars → `answers.required` / `answers.tooLong` (params `max: 60`).
**ActivityView**: `amount` and `acceptedAmount` are `null` when no quantity; the custom name appears in `answers`
(`key: "activityName"`). New status reason code **`verification.notEnvironmental`** (Returned or Rejected per score).

## 2. Data, rules, events
- `activityTypes`: `ACTIVITY_CATEGORIES` + `other`; `AmountRule` + `optional: boolean` (default false) and
  `units: string[]` (default []); `FormField` + optional `maxLength` (default 200 = today) — OTHER uses 60. No index change.
- `activities`: `amount` becomes not required (absent for Other without quantity). No migration; existing records untouched.
- `submission-rules.ts` (pure): when `type.amount.optional` and value absent and unit absent → no amount; otherwise
  value + unit ∈ `units` + range; `CleanSubmission.amount: {value, unit} | null`; `RULES_VERSION` rules-3 (FR-018, FR-054).
- Events: `ActivitySubmitted`/`ActivityAccepted` `amount` may be `null`; `ActivityAccepted` for OTHER carries
  `category: "other"`, `activityTypeCode: "OTHER"`. **Impact consumers must skip it**: no calculation method exists
  for OTHER (FR-043) → no impact credit. Documented only; no consumer exists this phase (FR-032, FR-046).

## 3. AI verification (ADR-0012 unchanged in structure; no extra model call → NFR-002 unaffected)
- `agent-input.ts`: `type.environmentalCheck = category === 'other'`; `amount: {value, unit} | null`.
- `prompts/common.ts`: `activityName`, description, answers, unit and amount stay inside `quoteUntrusted` (unit via
  `sanitizeUntrusted`); "No amount claimed" when null. `PROMPT_VERSION` prompts-v4.
- `prompts/steps.ts`: for OTHER the evidence step judges relevance to the quoted participant-described activity; the
  claim step asks `environmental` (yes/no/unclear: is the described activity plausibly environmental; "no" only when
  clearly not); other types set `n_a`.
- `findings.ts`: `ClaimFindings.environmental: Verdict | 'n_a'`; `claimSchema(environmentalCheck)` allows only `n_a`
  for non-Other types. Bump `SCHEMA_VERSION` (claim schema changes; needed for FR-054 audit accuracy).
- `aggregate.ts`: `environmental = no` → ×0.5 (`CLAIM_NO_FACTOR`) + `claim.notEnvironmental`; `unclear` → ×0.9;
  `n_a` → no effect (existing types score identically). No amount → amount claim treated as `n_a`.
  `AGGREGATION_VERSION` agg-v4. Thresholds, hard flags, caps, follow-up: unchanged.
- `decide-outcome.ts` `REASON_PRIORITY`: insert `['claim.notEnvironmental', 'verification.notEnvironmental']` as
  position 3, right after `verification.unrelatedScene`, before `verification.beforeAfterInconsistent`.
- `libs/integration/ai/mock-multimodal-model.ts`: fixed mode answers `environmental` `yes` for OTHER, `n_a` otherwise.

## 4. Tasks
| ID | Tag | Files | After |
|---|---|---|---|
| B1 | backend | `act/activity-type.schema.ts`, `act/activity.schema.ts`, `act/submission-rules.ts` (+spec), `backend/src/dev/seed.ts` (+spec), `act/activities.service.ts` (+spec: amount null, view, events) | — |
| B2 | backend | `ver/agent-input.ts`, `ver/agent/prompts/{common,steps}.ts`, `ver/agent/findings.ts`, `ver/agent/aggregate.ts`, `ver/agent/verification-agent.ts`, `ver/decide-outcome.ts`, `libs/integration/ai/mock-multimodal-model.ts` (+ `agent-parts.spec`, `verification-agent.spec`, `decision.spec`, `ai.spec`) | fix-6 commit (same files) |
| F1 | flutter | `fl/models/activity_models.dart` (AmountRule `optional`/`units`, `SubmissionRequest.amount` nullable `{value, unit}`), `fl/state/activity_form_controller.dart` (`supportedCategories` + `other`, optional quantity + unit, client mirror of rules), `fl/screens/record_activity_screen.dart` (unit dropdown, optional label, `categoryLabel` other) | — |
| F2 | flutter | `fl/services/error_messages.dart` (`amount.unitRequired`, `amount.unitInvalid`, `verification.notEnvironmental`, units `items`/`m2`/`other`), `fl/l10n/app_en.arb`, `fl/l10n/app_ar.arb`, `fl/screens/activity_status_screen.dart` (null amount) | fix-6 commit (same files) |
| Q1 | qa | `backend/test/activities.e2e-spec.ts`, `backend/test/verification.e2e-spec.ts` (spec AC 1, 5, 10, 16, 17, 20) | B1 B2 |
| Q2 | qa | `ft/state/activity_form_controller_test.dart`, `ft/screens/record_activity_screen_test.dart`, `ft/services/error_messages_test.dart` (AC 2, 3, 6, 18) | F1 F2 |
**Parallel:** B1 ‖ B2 ‖ F1 ‖ F2 (contract fixed above, disjoint files; B2 compiles against `VerificationSubject.amount`
`{value,unit} | null` from B1 — merge B1 first). Q1/Q2 may be written alongside. No new packages.
`/document` updates `docs/traceability.md` (FR-007/008/011/018/025 notes) when merged.
