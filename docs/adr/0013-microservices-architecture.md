# ADR-0013: Four-layer microservices architecture (supersedes ADR-0004)

- Status: accepted (owner, 2026-11-25)
- Date: 2026-11-25
- Supersedes: ADR-0004. Decides: Q-A9, Q-F1–Q-F5. Supersedes in part: ADR-0006 (photo storage → MinIO; Q-A8).
- Plan: `docs/features/arch-microservices/plan.md`

## Context
- The initial proposal (section 2, `docs/proposal/system-design.md`; diagram `docs/proposal/architecture-diagram.jpg`)
  specifies four layers: Client → API Gateway (single entry point: authentication & authorization, request
  routing, request validation, rate limiting & monitoring) → Microservices around a Message Broker → Data &
  External services (per-service databases, object storage for photos, AI services, maps/email/push, payment).
- ADR-0004 chose a modular monolith with in-process events and rejected a broker "for the capstone demo".
- Owner decision, 2026-11-25 (chat): *"I confirm that the four-layer microservices architecture in the initial
  project proposal is mandatory. Approve drafting a new ADR that supersedes ADR-0004. Use the architecture
  diagram in the proposal as the authoritative reference."*
- Owner decision, 2026-11-25 (chat): *"Implement independently deployable Activity and Verification
  microservices, an API Gateway, a message broker and service-owned databases. Integrate the existing AI agent
  within the Verification Service so that AI processing operates independently of activity submission. Preserve
  all existing functionality, frontend screens, security controls, tests and teammates' contributions. Keep the
  functional scope limited to Add an Activity. ... Reuse existing code wherever possible."* Earlier: *"Provide
  Docker-based deployment and integration testing. Ensure the architecture supports the remaining services shown
  in the diagram in future phases. Do not implement unrelated business functionalities or rebuild existing
  working code unnecessarily."*
- Owner decision, 2026-11-25 (chat, on the proposed ADR and plan): *"1. Approve Kafka, single node. 2. Approve
  NestJS API Gateway. 3. Approve S3-compatible MinIO storage. 4. Approve Verification Service ownership of the
  audit log. 5. Enable internal TLS in accordance with NFR-005. 6. Approve the proposed packages, subject to
  security and compatibility checks. 7. Verify the proposed rate limits against the approved requirements before
  finalizing them. 8. Keep Payment Service as a future service only. 9. Accept ADR-0013 and supersede ADR-0004.
  Proceed with the migration ... Keep sign-in outside the current implementation scope. Preserve existing
  functionality, the AI agent, frontend screens, security controls, tests and teammates' contributions. ... Keep
  the migration limited to Add an Activity and retain the existing PR approval gates."* Then: *"record the
  decisions and proceed with the migration"*.
- ADR-0004 kept domains self-contained precisely so a later extraction "only replaces the in-process event
  transport". One coupling breaks that promise: the verification module calls the activity module directly
  (`backend/src/modules/verification/verification.module.ts:31`, `verification.service.ts:17-18`).

## Decision
1. **Layers.** Client (Flutter, unchanged) → `api-gateway` → `activity-service`, `verification-service` →
   per-service MongoDB databases, object storage, AI provider. Only the gateway is reachable from outside the
   container network.
2. **Repository layout.** One backend package (one `package.json`/lockfile, CI unchanged) in a monorepo shape:
   `backend/apps/{api-gateway,activity-service,verification-service}` (one NestJS app, entrypoint and image
   each) and `backend/libs/{common,integration,contracts,messaging}` (shared code compiled into each image).
   Existing files move with `git mv`; only import paths change. Apps may import libs, never each other (lint rule).
3. **Ownership.** activity-service owns `activities`, `activityTypes` and photo metadata (and the location
   key, NFR-004). verification-service owns `verificationJobs` and `auditEntries` (only writer today, FR-054;
   owner decision 4). A future Audit service would consume `audit.*` events; none is built now.
   Each service has its own database and credentials; nobody reads another service's database.
4. **Communication.** Asynchronous events through a message broker for cross-service effects; thin payloads
   (IDs, codes, numbers — never coordinates, descriptions or photos; NFR-004, NFR-007). verification-service
   pulls the evidence it needs from an internal activity-service REST endpoint (NFR-030) that the gateway never
   routes. Every event has a deterministic `eventId` derived from `activityId`; publishing goes through a
   transactional outbox embedded in the aggregate document; consumers are idempotent (FR-015, FR-028, FR-046).
5. **Verification independence.** The existing agent (ADR-0012), job queue, leases and retry policy move into
   verification-service unchanged in behaviour. It consumes `ActivitySubmitted` and publishes
   `VerificationDecided` / `VerificationDeferred`; activity-service applies them with its existing conditional
   status updates and publishes `ActivityAccepted` exactly once per activity (FR-026–028, FR-032, FR-046).
   Submission never waits for, or fails because of, verification (NFR-020, NFR-036).
6. **Gateway (owner decision 2).** A NestJS gateway app that reuses the existing identity seam (ADR-0010
   participant resolution moves here), the error filter and the `/api` contract; it forwards a signed internal
   identity header. The public API contract and error shapes stay unchanged. Sign-in stays out of scope: no
   login, registration or token issuance; the gateway enforces the dev participant (ADR-0010) plus
   authorization/ownership only, and a future Identity Service plugs in by replacing the gateway's
   `PARTICIPANT_RESOLVER` binding. Rate-limit values: plan §3.1 (Q-F8, engineering defaults pending owner).
7. **Broker (owner decision 1).** Apache Kafka 4 in KRaft mode, single node, matching the diagram. Client:
   `@confluentinc/kafka-javascript` behind a `libs/messaging` port with an in-memory adapter for unit/e2e
   tests (NFR-023); not the NestJS Kafka transport.
8. **Photos (owner decision 3).** Object storage via an S3-compatible adapter (MinIO in Docker,
   `@aws-sdk/client-s3`) behind the existing `PhotoStorage` interface; GridFS adapter kept for tests/dev. This
   supersedes ADR-0006's GridFS choice only; its privacy rules (private originals, EXIF, opaque IDs) stand.
8a. **Internal TLS (owner decision 5, NFR-005: "protect personal data transmitted over network connections
   using TLS 1.2 or later").** Every internal link (gateway↔services, service↔service internal API,
   services↔Kafka, services↔MongoDB, activity↔MinIO) uses server-authenticated TLS ≥ 1.2; client identity
   stays with application credentials (HMAC signature, service key, SCRAM, per-DB users, storage keys). Dev/CI
   certificates come from a throwaway CA generated at runtime by a script, mounted read-only, never committed.
   mTLS is a later config-only upgrade. Production services refuse to boot with plaintext config. Plan §5.1.
8b. **Demo environment (owner, 2026-11-25: *"GEMINI_API_KEY and MONGODB_URI are already configured in
   backend/.env. Proceed using MongoDB Atlas and real Gemini verification for the demo. Retain the mock provider
   for testing and continue the migration without exposing secrets."*).** The demo runs the per-service databases
   (`juthoor_activity`, `juthoor_verification`) on a MongoDB Atlas cluster over `mongodb+srv` (TLS ≥ 1.2, consistent
   with 8a, NFR-005), each service with its own `MONGODB_URI` and, recommended, its own least-privilege database
   user (Q-F11). Real Gemini runs only in verification-service and only with `NODE_ENV` development/test (ADR-0012
   decision 10 production guard, NFR-009); `GEMINI_API_KEY`/`AI_MODEL` never reach the gateway or activity-service.
   Tests and CI use local MongoDB and the mock provider only; test helpers refuse non-local Mongo URIs (plan T14).
   Connection strings and keys live only in untracked env files, are never committed or logged (NFR-033). Default
   compose = local Mongo + mock; `compose.demo.yml` = Atlas + Gemini. The free-tier demo cluster does not evidence
   NFR-022/027/034/035/036. Plan §5.2; open: Q-F10, Q-F11.

9. **Deployment.** One Dockerfile per service; `docker compose` brings up gateway, services, broker, databases
   and storage (NFR-038). Horizontal scaling by adding instances (NFR-027) is preserved by job leases, consumer
   groups and idempotent handlers.
10. Future services (Identity & User, Rewards, Environmental Impact, Campaign & Challenge, Community &
    Leaderboard, Notification) plug in as new apps consuming/publishing versioned topics; none is built now.
    Payment Service stays a future service only (owner decision 8; in no approved FR, Q-F5) — no contract is defined.

## Consequences
- More moving parts: broker, two databases, storage, three Node processes; local start via compose only.
- The in-process `EventsService` becomes the in-memory adapter of the messaging port; the existing semantics
  (subscriber failure never undoes the publisher's work) are kept.
- `ActivitiesService.getForVerification/decide/markPending/findWaiting` stop being called across domains;
  `findWaiting` is replaced by the outbox guarantee. Affected unit tests are adapted to the new ports
  (same assertions); no test is deleted or weakened.
- New packages (owner decision 6, approved subject to checks; security-reviewer checks passed 2026-11-25,
  `npm audit` 0 vulnerabilities, plan §12): `@confluentinc/kafka-javascript` 1.11.0 (MIT, approve with
  conditions), `@aws-sdk/client-s3` 3.1177.0 (Apache-2.0, approve), `http-proxy-middleware` 4.2.2 (MIT, approve
  with conditions), `@nestjs/throttler` 6.8.0 (MIT, approve with conditions). Rejected: `kafkajs` (unmaintained),
  `@nest-lab/throttler-storage-redis` (NestJS ≤ 11 peer). Conditions: exact pins; Confluent install script runs in
  CI/Docker; Kafka client only behind the messaging port; proxy fixed-target allowlist (SSRF) and forwarded-header
  hygiene; shared throttler store before >1 gateway instance (Q-F9); `npm audit --audit-level=high --omit=dev`
  in CI. No new package for identity signing or the dev CA (`node:crypto` / openssl).
- `.claude/rules/architecture.md` and `CLAUDE.md` (layout section) need a dedicated `chore:` PR after acceptance.
- Internal TLS adds certificate generation to compose/CI and handshake cost (keep-alive, long-lived connections).
- The single gateway instance with an in-memory throttler is sufficient for Add an Activity; scaling the gateway
  out (NFR-027) first needs the shared store (Q-F9).

## Alternatives considered
- **Keep ADR-0004** (monolith): rejected by the owner decision above.
- **Microservices with synchronous REST only** (no broker): contradicts the diagram and couples submission to
  verification availability.
- **Event-carried state** (fat `ActivitySubmitted` with description/answers/emirate): fewer calls, but copies
  personal data into broker logs and a second database (NFR-004, NFR-031); rejected for thin events + pull.
- **Separate repositories / npm workspaces per service**: stronger isolation, but more lockfile and CI churn;
  workspaces stay a later option because libs are already isolated.
- **Off-the-shelf gateway (Kong, Traefik, nginx)**: see plan §3; rejected for now because ADR-0010 resolution,
  the bilingual error shape and identity signing would need custom plugins.

Related: FR-015, FR-018–021, FR-025–028, FR-032, FR-046, FR-054; NFR-002, NFR-004, NFR-005, NFR-007, NFR-009, NFR-020,
NFR-023, NFR-024, NFR-026, NFR-027, NFR-022, NFR-030, NFR-033, NFR-034, NFR-035, NFR-036, NFR-038; Q-A8, Q-A9, Q-E8, Q-E9, Q-F1–Q-F11;
ADR-0004, ADR-0006, ADR-0010, ADR-0012.
