# Requirements Traceability

One row per FR. Update the **row you touched** in every feature PR (`/document` does this).
★ = part of the capstone demo scenario: *a participant submits an activity and it is verified by AI*.

Status values: `not-started` · `ui-mock` (screen exists, hardcoded data) · `partial` · `done` (code + tests + reviewed).
Baseline recorded 2026-11-22 from the repository analysis.

| FR | ★ | Status | Code | Tests | Notes |
|---|---|---|---|---|---|
| FR-001 | | not-started | | | Sign-in scope: Q-A2 |
| FR-002 | | not-started | | | Profile exists only as `profile screen.yaml` spec |
| FR-003 | | not-started | | | |
| FR-004 | | ui-mock | frontend/lib/screens/home_screen.dart | | Hardcoded values |
| FR-005 | | not-started | | | |
| FR-006 | | not-started | | | |
| FR-007 | | partial | backend/activity-service/src/activities/activity-type.schema.ts | | Schema only; categories Q-A4 |
| FR-008 | | partial | activity-type.schema.ts (formFields, amount, photoRules) | | No admin API |
| FR-009 | ★ | partial | activity-types.controller.ts | | `ActivityTypesService` missing (Q-D1) |
| FR-010 | ★ | ui-mock | frontend/lib/screens/record_activity_screen.dart | | No `draft` status (Q-A1) |
| FR-011 | ★ | partial | activity-type.schema.ts formFields | | Category fields not seeded |
| FR-012 | ★ | not-started | | | Location hardcoded in UI |
| FR-013 | | ui-mock | record_activity_screen.dart "Link to" | | `teamId`/`programId` not in schema |
| FR-014 | | not-started | | | |
| FR-015 | ★ | partial | activity.schema.ts (userId+submitKey unique), modules/activities.module.ts | | Revision lock missing |
| FR-016 | | partial | modules/activities.module.ts `listForUser` | | Status filter only |
| FR-017 | ★ | partial | modules/activities.module.ts `toView` | | Points/impact absent |
| FR-018 | ★ | partial | activity-service/src/activities/submission-rules.ts | none | Pure, testable; not wired |
| FR-019 | ★ | partial | submission-rules.ts | none | Future-date only; no program window. UI date picker allows 2030 |
| FR-020 | ★ | partial | submission-rules.ts | none | Emirate list only; no geo/geofence |
| FR-021 | ★ | partial | submission-rules.ts | none | |
| FR-022 | | not-started | | | |
| FR-023 | ★ | partial | submission-rules.ts (field errors) | | English-only messages (NFR-016) |
| FR-024 | ★ | not-started | | | Q-A8, Q-C3 |
| FR-025 | ★ | not-started | | | Q-C3 |
| FR-026 | ★ | not-started | | | Q-A1 |
| FR-027 | ★ | partial | modules/activities.module.ts `decide` | | Q-A1 |
| FR-028 | ★ | partial | activity.schema.ts `processing_failed` | | No retry jobs |
| FR-029 | | not-started | | | |
| FR-030 | | not-started | | | |
| FR-031 | | not-started | | | |
| FR-032 | | not-started | | | |
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
| FR-046 | | not-started | | | |
| FR-047 | | not-started | | | |
| FR-048 | | not-started | | | |
| FR-049 | | not-started | | | |
| FR-050 | | not-started | | | |
| FR-051 | ★ | not-started | | | Result notification closes the demo loop |
| FR-052 | | not-started | | | |
| FR-053 | | not-started | | | |
| FR-054 | ★ | not-started | | | Q-A6 |
| FR-055 | | not-started | | | |
