# ADR-0010: Development-only test participant; authentication deferred behind a CurrentParticipant seam

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
The project owner (2026-11-25) limited this phase to one use case, *Add an Activity*, and removed
authentication from the roadmap for this phase: no registration, login, password management, JWT or auth
screens. FR-001 (Must) remains an approved requirement in `docs/requirements/functional.md`; it is
**deferred, not deleted** (the requirements file is unchanged; see Q-E1). ADR-0009's email + password
decision still stands for when authentication is built.
Activities must still be owned by a participant (FR-010, FR-017, NFR-009, NFR-025), and ownership must be
derived server-side, never from a client-supplied ID (`.claude/rules/backend.md`).

## Decision
1. **Seam.** `backend/src/common/identity/` defines `ParticipantContext { participantId: string }`, a
   `PARTICIPANT_RESOLVER` token (`resolve(req): ParticipantContext | null`), a global `ParticipantGuard`
   that stores the result on the request, and a `@CurrentParticipant()` parameter decorator. Controllers
   and services only ever see `ParticipantContext`. The default resolver returns `null` → the guard
   answers `401 { code: "auth.required" }` on every participant endpoint. A future JWT resolver replaces the
   binding; no controller/service changes.
2. **Dev resolver.** `backend/src/dev/dev-participant.module.ts` (outside `modules/`) overrides
   `PARTICIPANT_RESOLVER` with a resolver returning the fixed ID `DEV_PARTICIPANT_ID`
   (`000000000000000000000d01`). No user document is created: the Identity domain is not built and
   activities reference participants by ID only (ADR-0004). Dev activity types are seeded by
   `npm run seed:dev`, which applies the same enablement check.
3. **Enablement (pure function `devParticipantMode(env)`, unit-tested):**
   - enabled only if `NODE_ENV === "development"` **and** `JUTHOOR_DEV_PARTICIPANT === "true"` (exact);
   - if `JUTHOOR_DEV_PARTICIPANT` is set to any value while `NODE_ENV` is anything other than
     `development` (including `production`, `test`, `staging`, unset) → `main.ts` throws before
     `NestFactory.create` and the process exits non-zero (fail fast);
   - otherwise disabled.
4. **Wiring.** `AppModule.forRoot(env)` adds `DevParticipantModule` via dynamic `import()` only when
   enabled; no other file may import `src/dev/**` (ESLint `no-restricted-imports`, CI-blocking).
5. **Defence in depth.** When enabled: a `WARN` log at boot and an `X-Juthoor-Dev-Participant: true`
   response header. The production container image (NFR-038, when its Dockerfile is written) sets
   `NODE_ENV=production` and deletes `dist/src/dev/`, so even a misconfiguration cannot load the module.
6. **Proof (tests):** unit matrix for `devParticipantMode`; e2e: (a) boot with
   `NODE_ENV=production JUTHOOR_DEV_PARTICIPANT=true` rejects; (b) `NODE_ENV=production`, flag unset →
   `POST/GET /api/activities` return 401; (c) development + flag → activity owned by `DEV_PARTICIPANT_ID`;
   (d) lint fails if a module imports `src/dev`.

## Consequences
- Everything built now is single-participant in practice, but ownership checks (404 for others' records)
  are real and tested with a second injected participant ID (NFR-025).
- NFR-010/011 (MFA, session timeout) and NFR-013's "authenticated participant" precondition cannot be
  verified until authentication exists. The demo is a development deployment, not a production one.
- Adding auth later = new resolver + Identity module + ADR; the dev module stays dev-only or is removed.

Related: Q-E1, ADR-0004, ADR-0009, FR-001, FR-010, FR-017, NFR-009, NFR-010, NFR-011, NFR-012, NFR-013,
NFR-025, NFR-038.
