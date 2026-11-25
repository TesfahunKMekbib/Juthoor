# ADR-0002: Repository layout — `frontend/` and `backend/` as sibling projects

- Status: accepted
- Date: 2026-11-22

## Context
The Flutter project (`pubspec.yaml`, `android/`) lived at the repository root and ran a placeholder
"Hello World" `lib/main.dart`, while the real UI lived in `frontend/lib/` with no `pubspec.yaml`.
The backend had no `package.json`. Two TypeScript files were duplicated at the root. CI could not
target either app.

## Decision
- `frontend/` is the Flutter project (pubspec, analysis options, `android/`, `.idea/`, `juthoor.iml`).
  The root placeholder `lib/main.dart` was removed.
- `backend/` is the Node/NestJS project with its own `package.json`, `tsconfig.json`,
  `eslint.config.mjs`, `jest.config.cjs`, `.prettierrc.json`. No application code was added.
- Root holds only shared files: `CLAUDE.md`, `.claude/`, `.github/`, `docs/`, `.nvmrc`, `README.md`.
- Lock files (`pubspec.lock`, `package-lock.json`) are committed.
- Duplicate root files `activity-type.schema.ts` and `activity-types.controller.ts` were removed
  (byte-identical to the copies under `backend/activity-service/src/activities/`).
- The internal backend layout (`activity-service/` vs `modules/`) is NOT decided here: see Q-A9.

## Consequences
CI workflows are path-filtered per project. Teammates must re-open the Flutter project from
`frontend/` (VS Code: open the repo root; Android Studio: open `frontend/`). The old root
`android/` folder may remain locally with ignored build caches and can be deleted.

Related: Q-A9, Q-D1, Q-D2.
