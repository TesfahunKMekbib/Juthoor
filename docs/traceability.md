# Requirements Traceability

One row per FR. Update the **row you touched** in every feature PR (`/document` does this).
★ = part of the capstone demo scenario: *a participant submits an activity and it is verified by AI*.

Status values: `not-started` · `ui-mock` (screen exists, hardcoded data) · `partial` · `deferred` (by owner
decision, with reference) · `implemented — awaiting review/merge` (code + tests exist, human review/merge
pending) · `done` (code + tests + reviewed + merged).
Baseline recorded 2026-11-22 from the repository analysis. Rows of the Add an Activity feature
(`docs/features/FR-009-028-054-add-activity/`) updated 2026-11-25 on branch `feat/FR-009-028-054-add-activity`;
old paths (`backend/activity-service/`, `backend/modules/`) were removed by ADR-0004.
Path prefixes: `act/` = `backend/src/modules/activity/`, `ver/` = `backend/src/modules/verification/`,
`int/` = `backend/src/modules/integration/`, `be2e/` = `backend/test/`, `fl/` = `frontend/lib/`, `ft/` = `frontend/test/`.

| FR | ★ | Status | Code | Tests | Notes |
|---|---|---|---|---|---|
| FR-001 | | deferred (owner, 2026-11-25, ADR-0010) | backend/src/common/identity/ (seam only), backend/src/dev/dev-participant.ts | backend/src/common/identity/participant.guard.spec.ts, backend/src/common/config/dev-participant-mode.spec.ts | No sign-in this phase; dev participant only (Q-E1). Sign-in scope: Q-A2 |
| FR-002 | | not-started | | | Profile exists only as `profile screen.yaml` spec |
| FR-003 | | not-started | | | |
| FR-004 | | ui-mock | frontend/lib/screens/home_screen.dart | | Hardcoded values |
| FR-005 | | not-started | | | |
| FR-006 | | not-started | | | |
| FR-007 | | partial | act/activity-type.schema.ts, backend/src/dev/seed.ts | backend/src/dev/seed.spec.ts | Dev seed of FR-007 categories only (Q-E5, Q-A4b); no admin catalog |
| FR-008 | | partial | act/activity-type.schema.ts (formFields, amount, photoRules) | backend/src/dev/seed.spec.ts | No admin API (out of scope) |
| FR-009 | ★ | partial | act/activity-types.controller.ts, act/activity-types.service.ts; fl/services/activity_api.dart, fl/screens/record_activity_screen.dart | act/activity-types.service.spec.ts, be2e/activities.e2e-spec.ts; ft/services/activity_api_test.dart, ft/screens/record_activity_screen_test.dart, ft/state/activity_form_controller_test.dart | Fields, ranges, photo rules shown; points-award rules deferred (Rewards out of scope) |
| FR-010 | ★ | partial | fl/screens/record_activity_screen.dart, fl/state/activity_form_controller.dart | ft/screens/record_activity_screen_test.dart, be2e/activities.e2e-spec.ts | Entry of all fields done; server-side drafts (save/reopen/delete) deferred (Q-E7); `draft` in enum, unused |
| FR-011 | ★ | implemented — awaiting review/merge | act/submission-rules.ts, backend/src/dev/seed.ts, fl/state/activity_form_controller.dart | act/submission-rules.spec.ts, backend/src/dev/seed.spec.ts, ft/state/activity_form_controller_test.dart | Category fields per Q-E5 seed values |
| FR-012 | ★ | implemented — awaiting review/merge | act/submission-rules.ts, fl/services/device_services.dart, fl/state/activity_form_controller.dart, fl/screens/record_activity_screen.dart | act/submission-rules.spec.ts, be2e/activities.e2e-spec.ts, ft/screens/submission_flow_test.dart, ft/state/activity_form_controller_test.dart | Manual emirate/area. Backend: the only accepted location this phase (FR-020 deferred, 2026-11-25), stray coordinates dropped. Flutter still requests GPS first and falls back to manual on denial until plan §7 F6/F7 land |
| FR-013 | | not-started | | | "Link to" removed from the form (plan §5); `teamId`/`programId` not in schema |
| FR-014 | | not-started | | | |
| FR-015 | ★ | partial | act/activities.controller.ts (Idempotency-Key), act/activities.service.ts, act/activity.schema.ts (`{userId,submitKey}` unique), ver/verification-job.schema.ts (`{activityId}` unique) | act/activities.service.spec.ts, act/activities.controller.spec.ts, be2e/activities.e2e-spec.ts, be2e/verification.e2e-spec.ts, ft/screens/submission_flow_test.dart | Idempotent submit + immutable details done; revisions deferred with FR-027 replacement evidence (Q-E7) |
| FR-016 | | partial | act/activities.service.ts `listForUser`, fl/screens/my_activities_screen.dart | ft/screens/my_activities_screen_test.dart | Own list, status filter only; FR-016 filters out of scope |
| FR-017 | ★ | partial | act/activities.service.ts (view), act/activities.controller.ts, fl/screens/activity_status_screen.dart | act/activities.controller.spec.ts, ft/screens/activity_status_screen_test.dart, ft/screens/activity_status_polling_test.dart | Details, evidence, outcome, accepted quantity; awarded points/impact absent (out of scope) |
| FR-018 | ★ | implemented — awaiting review/merge | act/submission-rules.ts (pure, `RULES_VERSION`), act/activities.service.ts | act/submission-rules.spec.ts, be2e/activities.e2e-spec.ts, be2e/verification.e2e-spec.ts (AI never called on rule failure) | |
| FR-019 | ★ | partial | act/submission-rules.ts, fl/screens/record_activity_screen.dart (date picker) | act/submission-rules.spec.ts, be2e/activities.e2e-spec.ts, ft/screens/record_activity_screen_test.dart | Future date rejected (422, Q-E3); campaign/challenge date windows deferred (FR-013 out of scope) |
| FR-020 | ★ | deferred (owner, 2026-11-25, Q-E6) | act/submission-rules.ts (device location refused, `rules-2`); dormant for next phase: int/geo/ (geo-boundary-provider.ts, point-in-polygon.ts, dataset-geo-boundary-provider.ts; no dataset) | act/submission-rules.spec.ts (device refused; `it.todo` UAE/emirate boundary), be2e/activities.e2e-spec.ts (device → 422, no record); dormant: int/geo/point-in-polygon.spec.ts, int/geo/dataset-geo-boundary-provider.spec.ts | GPS validation deferred to next phase (owner 2026-11-25); manual emirate under FR-012. ODbL dataset removed. Accepted deviation from a Must requirement (Q-E11). Program geofences deferred (FR-013 out) |
| FR-021 | ★ | implemented — awaiting review/merge | act/submission-rules.ts, int/image/image-signature.ts, act/upload-errors.interceptor.ts, backend/src/common/config/app-config.ts `uploadLimits` | int/image/image-signature.spec.ts, act/submission-rules.spec.ts, act/activities.service.spec.ts, act/activities.controller.spec.ts, be2e/activities.e2e-spec.ts | Magic bytes, size, count, kinds |
| FR-022 | | not-started | | | Thresholds from env config only (plan §3); admin configuration out of scope |
| FR-023 | ★ | implemented — awaiting review/merge | backend/src/common/errors/ (validation-failed.exception.ts, http-exception.filter.ts), fl/services/error_messages.dart, fl/state/activity_form_controller.dart | backend/src/common/errors/http-exception.filter.spec.ts, act/submission-rules.spec.ts, be2e/activities.e2e-spec.ts, ft/services/error_messages_test.dart, ft/l10n/arb_parity_test.dart, ft/screens/submission_flow_test.dart | Coded field errors, en + ar ARB text, form keeps data |
| FR-024 | ★ | deferred (ADR-0006, Q-E7) | | ver/agent/agent-parts.spec.ts (`people_visible` never changes outcome) | Blurring/preview not built; privacy review before production (Q-C3) |
| FR-025 | ★ | implemented — awaiting review/merge | int/ai/ (multimodal-model.ts, mock-multimodal-model.ts, gemini/), ver/agent/, ver/agent-input.ts | ver/agent/verification-agent.spec.ts, ver/agent/agent-parts.spec.ts, int/ai/ai.spec.ts, int/ai/gemini/gemini-multimodal-model.spec.ts, ver/verification.service.spec.ts | Mock provider by default; Gemini dev/test only (ADR-0012); production provider open (Q-C3) |
| FR-026 | ★ | implemented — awaiting review/merge | ver/decide-outcome.ts, ver/agent/aggregate.ts, ver/verification.service.ts | ver/decision.spec.ts, ver/verification.service.spec.ts, be2e/verification.e2e-spec.ts | Thresholds per Q-E2 |
| FR-027 | ★ | partial | ver/decide-outcome.ts, act/activities.service.ts `decide` | ver/decision.spec.ts, ver/verification.service.spec.ts, be2e/verification.e2e-spec.ts, ft/screens/activity_status_screen_test.dart | Returned/Rejected with reason code done; replacement evidence deferred (Q-E7, optional Slice 3) |
| FR-028 | ★ | implemented — awaiting review/merge | ver/verification.service.ts, ver/verification.worker.ts, ver/retry-policy.ts, ver/mongo-job-store.ts, act/activities.service.ts `markPending` | ver/decision.spec.ts, ver/verification.service.spec.ts, ver/agent/verification-agent.spec.ts, be2e/verification.e2e-spec.ts, ft/screens/activity_status_polling_test.dart | Exhausted → stays pending, `processing.failedPermanently` (Q-E4) |
| FR-029 | | not-started | | | |
| FR-030 | | not-started | | | |
| FR-031 | | not-started | | | |
| FR-032 | | partial | backend/src/common/events/events.service.ts, act/activities.service.ts `decide` | act/activities.service.spec.ts | `ActivityAccepted` published once per activityId only for Accepted; no subscriber (Rewards out of scope) |
| FR-033 | | not-started | | | |
| FR-034 | | not-started | | | |
| FR-035 | | not-started | | | |
| FR-036 | | not-started | | | |
| FR-037 | | not-started | | | |
| FR-038 | | not-started | | | |
| FR-039 | | not-started | | | |
| FR-040 | | not-started | | | |
| FR-041 | | not-started | | | |
| FR-042 | | not-started | | | |
| FR-043 | | not-started | | | |
| FR-044 | | not-started | | | |
| FR-045 | | not-started | | | |
| FR-046 | | partial | backend/src/common/events/events.service.ts, act/activities.service.ts `decide` | act/activities.service.spec.ts | Idempotency key (activityId) on `ActivityAccepted`; impact not computed (out of scope) |
| FR-047 | | not-started | | | |
| FR-048 | | not-started | | | |
| FR-049 | | not-started | | | |
| FR-050 | | not-started | | | |
| FR-051 | ★ | partial | fl/screens/activity_status_screen.dart (polling) | ft/screens/activity_status_polling_test.dart | Decision visible on the status screen only; in-app inbox, email/push not built (Notification out of scope) |
| FR-052 | | not-started | | | |
| FR-053 | | not-started | | | |
| FR-054 | ★ | partial | backend/src/modules/audit/ (audit-entry.schema.ts, audit.service.ts), ver/verification.service.ts `audit` | backend/src/modules/audit/audit.service.spec.ts, ver/verification.service.spec.ts, be2e/verification.e2e-spec.ts | Decision + AI-flag entries done, append-only, IDs only; reward issuance and admin config entries out of scope; retention open (Q-A6b, no TTL) |
| FR-055 | | not-started | | | |

## NFRs touched by Add an Activity (2026-11-25)
Only NFRs the feature's tests reference; statuses use the vocabulary above.

| NFR | Status | Code | Tests | Notes |
|---|---|---|---|---|
| NFR-002 | partial | ver/agent/budget.ts, int/ai/with-timeout.ts | ver/agent/verification-agent.spec.ts, ver/agent/agent-parts.spec.ts, int/ai/ai.spec.ts | AI call/time budget on the mock; no named ≤ 30 s end-to-end timing test found (spec AC 24) |
| NFR-004 | implemented — awaiting review/merge | backend/src/common/crypto/field-cipher.ts, backend/src/common/config/app-config.ts | backend/src/common/crypto/field-cipher.spec.ts, backend/src/common/config/app-config.spec.ts, be2e/activities.e2e-spec.ts | Location stored as `locationEnc` (AES-256-GCM) |
| NFR-007 | implemented — awaiting review/merge | act/activities.service.ts, int/geo/, int/image/sharp-image-preparer.ts | act/activities.service.spec.ts, be2e/activities.e2e-spec.ts, ver/agent/agent-parts.spec.ts, int/image/sharp-image-preparer.spec.ts | No coordinates persisted, logged or sent to AI |
| NFR-008 | implemented — awaiting review/merge | int/image/sharp-evidence-sanitizer.ts | int/image/sharp-evidence-sanitizer.spec.ts, be2e/activities.e2e-spec.ts | EXIF/GPS stripped on store |
| NFR-009 | implemented — awaiting review/merge | act/activities.controller.ts (owner-only photo route), int/ai/ai-config.ts (provider guard) | act/activities.controller.spec.ts, act/activities.service.spec.ts, int/ai/ai.spec.ts, be2e/activities.e2e-spec.ts, be2e/verification.e2e-spec.ts | |
| NFR-013 | implemented — awaiting review/merge | fl/screens/ | ft/screens/submission_flow_test.dart, ft/screens/record_activity_screen_test.dart | "Authenticated participant" precondition unverifiable until FR-001 (Q-E1) |
| NFR-016 / NFR-017 | implemented — awaiting review/merge | fl/l10n/, fl/services/error_messages.dart | ft/l10n/arb_parity_test.dart, ft/screens/*_test.dart (Arabic RTL cases) | |
| NFR-023 | implemented — awaiting review/merge | int/ai/ (port + factory), int/geo/, int/image/, int/storage/ | int/ai/gemini/gemini-multimodal-model.spec.ts, int/ai/ai.spec.ts | |
| NFR-025 | implemented — awaiting review/merge | backend/src/common/identity/participant.guard.ts, act/activities.service.ts | backend/src/common/identity/participant.guard.spec.ts, act/activities.service.spec.ts, be2e/activities.e2e-spec.ts | Allowed + denied paths |
| NFR-027 | implemented — awaiting review/merge | ver/mongo-job-store.ts (lease), ver/verification.worker.ts | ver/verification.service.spec.ts, be2e/verification.e2e-spec.ts | |
