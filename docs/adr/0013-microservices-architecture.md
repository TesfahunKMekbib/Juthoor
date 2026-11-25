# ADR-0013: Four-layer microservices architecture (supersedes ADR-0004)

- Status: proposed (drafted 2026-11-25; awaiting owner approval — only a human sets `accepted`, ADR-0001)
- Date: 2026-11-25
- Supersedes: ADR-0004 (on acceptance). Reopens: Q-A9. Partly revisits: ADR-0006 photo storage (Q-A8, see OD-3).
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
   key, NFR-004). verification-service owns `verificationJobs` and `auditEntries` (only writer today, FR-054).
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
6. **Gateway.** A NestJS gateway app (recommended, OD-2) that reuses the existing identity seam (ADR-0010
   participant resolution moves here), the error filter and the `/api` contract; it forwards a signed internal
   identity header. The public API contract and error shapes stay unchanged.
7. **Broker.** Apache Kafka in KRaft mode, matching the diagram (recommended, OD-1); RabbitMQ is the fallback.
   Brokers sit behind a `libs/messaging` port with an in-memory adapter for unit/e2e tests (NFR-023 style).
8. **Photos.** Object storage via an S3-compatible adapter (MinIO in Docker) behind the existing `PhotoStorage`
   interface (recommended, OD-3); GridFS adapter kept for tests/dev.
9. **Deployment.** One Dockerfile per service; `docker compose` brings up gateway, services, broker, databases
   and storage (NFR-038). Horizontal scaling by adding instances (NFR-027) is preserved by job leases, consumer
   groups and idempotent handlers.
10. Future services (Identity & User, Rewards, Environmental Impact, Campaign & Challenge, Community &
    Leaderboard, Notification) plug in as new apps consuming/publishing versioned topics; none is built now.
    Payment Service appears in the diagram but in no approved FR (Q-F5) — no contract is defined.

## Consequences
- More moving parts: broker, two databases, storage, three Node processes; local start via compose only.
- The in-process `EventsService` becomes the in-memory adapter of the messaging port; the existing semantics
  (subscriber failure never undoes the publisher's work) are kept.
- `ActivitiesService.getForVerification/decide/markPending/findWaiting` stop being called across domains;
  `findWaiting` is replaced by the outbox guarantee. Affected unit tests are adapted to the new ports
  (same assertions); no test is deleted or weakened.
- New packages (OD-7): broker client, `@aws-sdk/client-s3` (if OD-3), `http-proxy-middleware`,
  `@nestjs/throttler`. No new package for identity signing (`node:crypto`).
- `.claude/rules/architecture.md` and `CLAUDE.md` (layout section) need a dedicated `chore:` PR after acceptance.
- NFR-005 (TLS) for service-to-service and broker traffic is an open question for this phase (Q-F4).

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

Related: FR-015, FR-018–021, FR-025–028, FR-032, FR-046, FR-054; NFR-002, NFR-004, NFR-005, NFR-007, NFR-020,
NFR-023, NFR-024, NFR-026, NFR-027, NFR-030, NFR-033, NFR-036, NFR-038; Q-A8, Q-A9, Q-E8, Q-E9, Q-F1–Q-F8;
ADR-0004, ADR-0006, ADR-0010, ADR-0012.
