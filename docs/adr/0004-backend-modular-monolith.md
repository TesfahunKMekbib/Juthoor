# ADR-0004: Backend is a NestJS modular monolith with domain modules

- Status: superseded by ADR-0013 (2026-11-25)
- Date: 2026-11-25

## Context
The proposal describes an API gateway plus independent microservices; the repo held two incompatible
layouts (`backend/activity-service/`, `backend/modules/`) and did not compile (53 `tsc` / 19 ESLint
errors, Q-D1). No event broker is specified. Q-A9 blocked the backend bootstrap.

## Decision
- One NestJS application (modular monolith). Each domain from `.claude/rules/architecture.md`
  (Identity & User, Activity, Verification, Rewards, Campaign & Challenge, Impact, Community &
  Leaderboard, Notification, Audit) lives in `backend/src/modules/<domain>/` and is self-contained:
  module, schemas, service, controller, DTOs. Domains own their collections and reference other
  domains' records by ID only.
- Cross-domain effects use internal in-process domain events where appropriate; every event carries an
  idempotency key (`activityId`) so retries never double-credit (FR-015, FR-028, FR-046).
- Cross-cutting infrastructure (config, filters, pipes, guards, event primitives) lives in
  `backend/src/common/`.
- External providers (AI vision, maps, storage, email/push) live in `backend/src/modules/integration/`
  behind interfaces selected by configuration (NFR-023).
- `backend/activity-service/` and `backend/modules/` are consolidated into this layout and removed.
- Fixing the baseline compile and lint errors (Q-D1) is the first implementation task (Phase 0,
  branch `chore/phase-0-foundation`).
- New dependency: `@nestjs/platform-express` (HTTP adapter and multipart evidence uploads, FR-021).
  `@types/multer` was not needed (upload input is typed by our own `PhotoToStore` interface).
- `tsconfig.json` sets `"rootDir": "."` (TypeScript 6 requires it for `--outDir` builds with all
  sources under `src/`); build output is therefore `dist/src/main.js`.

## Consequences
- Simple local run, one deployable container (NFR-038); horizontal scaling by adding instances (NFR-027)
  requires that in-process event handlers stay idempotent and stateless.
- Because domains stay self-contained and communicate by events + IDs, extracting a service later
  only replaces the in-process event transport; no broker is introduced now.
- Once Q-D1 is fixed, CI can set `STRICT_CHECKS=true`.
- Alternative rejected: microservices + broker now — operational cost unjustified for the capstone demo.

Related: Q-A9, Q-D1, ADR-0002, ADR-0003, FR-015, FR-021, FR-028, FR-046, NFR-023, NFR-027, NFR-030, NFR-038.
