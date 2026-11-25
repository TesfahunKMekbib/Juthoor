# ADR-0003: Backend runs as ES modules (NestJS 12)

- Status: accepted
- Date: 2026-11-22

## Context
Setting up backend tooling installed the current releases: NestJS 12, `@nestjs/mongoose` 12, Mongoose 9,
TypeScript 6, Jest 30. `@nestjs/mongoose` 12 is published as ESM only (`"type": "module"`); loading it
from CommonJS fails ("Must use import to load ES Module"). Most existing backend code already uses
ESM-style relative imports with `.js` extensions (e.g. `./submission-rules.js`).

## Decision
- `backend/package.json` has `"type": "module"`; `tsconfig.json` uses `module`/`moduleResolution: nodenext`.
- Relative imports in backend TypeScript **must** end in `.js` (resolved to the `.ts` file by tsc and Jest).
- Jest runs ESM via ts-jest `useESM` with Node's `--experimental-vm-modules` (already wired into
  `npm test` / `npm run test:cov`; the ExperimentalWarning it prints is expected).
- Config files that must stay CommonJS use the `.cjs` extension (`jest.config.cjs`).

## Consequences
- `backend/activity-service/src/activities/activity.module.ts` uses extensionless imports and now also
  fails typecheck for that reason — part of the baseline debt (Q-D1), to be fixed in the first backend task.
- Verified on 2026-11-22: a temporary ESM test importing `submission-rules.ts` (which imports NestJS
  schema decorators) ran and passed under Jest, and the 80% branch-coverage gate was enforced.
- Alternative rejected: pinning NestJS 11 (CommonJS) — older major version, and the existing code was
  already written ESM-style.

Related: ADR-0002, Q-D1, NFR-024.
