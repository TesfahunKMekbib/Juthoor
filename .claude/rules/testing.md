---
paths:
  - "backend/**"
  - "frontend/**"
  - "lib/**"
  - "test/**"
---
# Testing rules

- Test first for rule logic (validation, status transitions, point/impact calculation): write the failing
  test from the acceptance criteria, then implement.
- Backend: Jest. Unit tests `*.spec.ts` next to the code; integration tests `*.e2e-spec.ts` under
  `backend/test/` against a real MongoDB (CI service container), never against shared/production data.
- Frontend: `flutter_test` widget tests in `frontend/test/`; keep them hermetic (mock the API client).
- Coverage: ≥ 80% branch coverage for core business logic (NFR-024), enforced by `backend/jest.config.cjs`.
- Each acceptance criterion in `spec.md` maps to at least one named test. Name tests after behaviour:
  `rejects a future occurrence date (FR-019)`.
- Cover idempotency (repeat the same request → one record), denied-permission paths (NFR-025), and
  boundary values (min/max quantities, size limits).
- Never delete, skip (`.skip`, `xit`) or weaken a failing test to get green. Report it instead.
- Tests must be deterministic: inject clocks (`now`) and random IDs; no real network or AI calls.
