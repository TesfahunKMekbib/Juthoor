# Review — Add an Activity (`feat/FR-009-028-054-add-activity` vs `chore/phase-0-foundation`)

Date: 2026-11-25 · Reviewer: lead session (/review) · Security: S1 and S2 by security-reviewer (findings fixed,
see commits `58419ef`, `59cbba4`, `c9355a3`). Diff: 130 files, +21k lines (≈ 60% lockfiles, the geo dataset and tests).

## Checks
- `STRICT_CHECKS=true` /verify: all 8 checks PASS (backend typecheck, lint, unit tests ≥ 80% branch coverage — 94.8%,
  `npm audit --omit=dev` 0; frontend pub get, format, analyze, 95 widget tests).
- `npm run test:e2e` (real MongoDB, throwaway DB): 40/40 pass.
- Checklist: no `@ts-ignore`; the one `any` is a justified test mock; no skipped tests (2 `it.todo` for deferred
  program windows / geofences, FR-019/FR-020 with FR-013 out of scope); no `left/right` in Flutter; no hardcoded
  `Text('…')`; no provider calls in domain services; traceability rows updated (nothing marked `done`).
- Every spec AC 1–33 maps to at least one named test.

## Findings (severity · file:line · issue · fix)
| # | Severity | Where | Issue | Status / fix |
|---|---|---|---|---|
| 1 | medium | `backend/src/modules/activity/activities.service.spec.ts` | AC 5 ("decide changes only status fields", FR-015) had no test | **Fixed**: test asserts the update touches only `status`, `resultReasonCode`, `statusHistory` |
| 2 | low | `backend/src/modules/activity/submission-rules.spec.ts:135` | `it.todo` still said UAE boundaries were unvalidated | **Fixed**: todo narrowed to program geofence (deferred with FR-013) |
| 3 | low | `backend/src/modules/activity/activities.service.ts:83-186`, `submission-rules.ts` | 422 errors carry an English `message` next to the `code`; backend.md says no single-language text should reach the app | Track: the app renders only the code via ARB (`error_messages.dart`); `message` is a developer fallback. Drop or document in the contract when the API is versioned |
| 4 | low | backend Jest run | "A worker process has failed to exit gracefully" warning (exit code 0); suspected sharp/libvips thread pool | Track: investigate with `--detectOpenHandles` per suite |
| 5 | low | `backend/tsconfig.build.json`, `scripts/build.mjs` | `dist/src/dev` is always built; ADR-0010 relies on the runtime guard until a Dockerfile deletes it | Track (NFR-038): add `build:prod` excluding `src/dev` with the first deployment |
| 6 | info | `.github/workflows` | CI does not run `npm run test:e2e` (Q-E8) | Separate `chore(ci)` PR (hotspot) |
| 7 | info | Gemini adapter | Request format checked against the API reference and contract-tested with fake HTTP only | Needs one live smoke test with a real key (dev only) |
| 8 | info | ARB files, `src/dev/seed.ts` | Arabic strings and seed values are drafts | Native-speaker review; owner review of seed values (Q-E5) |
| 9 | info | PR size | Far above the < 400-line guideline | Commits are small and logical; review commit by commit, or split into the plan's PR groups |

## Open owner items
Q-E6 geo dataset licence is ODbL 1.0 (attribution in `backend/src/modules/integration/geo/data/ATTRIBUTION.md`);
Q-E9 `backend/.env.example` blocked by permissions (configuration table in `plan.md`); Q-A6b audit retention period;
Q-A4b Transport/Other categories.
