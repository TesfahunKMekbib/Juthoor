Status: proposed — awaiting owner approval

# Plan: four-layer microservices migration (Add an Activity scope)

ADR: `docs/adr/0013-microservices-architecture.md` (proposed, supersedes ADR-0004). Source: owner decisions
2026-11-25 (quoted in ADR-0013) and `docs/proposal/system-design.md` + `architecture-diagram.jpg`.
Functional scope unchanged: FR-009–028, FR-054 as delivered in `docs/features/FR-009-028-054-add-activity/`.
**Implementation is BLOCKED until OD-1…OD-4 are decided (Q-F1–Q-F4).**

## 1. Audit — current code vs. the diagram
| Layer / concern | Diagram | Current (evidence) | Gap |
|---|---|---|---|
| Client | Web + mobile via gateway | Flutter calls the backend directly: `frontend/lib/services/activity_api.dart:36-54` (`API_BASE_URL`, default `:3000`, paths `/api/...`) | Base URL must point at the gateway; nothing else |
| Gateway | Single entry; authN/Z, routing, validation, rate limiting & monitoring | None. One app sets `/api` prefix and filter: `backend/src/main.ts:18-22`. Identity = global guard + dev resolver: `common/identity/identity.module.ts:12-20`, `participant.guard.ts:24-27`, `src/dev/dev-participant.ts:7-11`. No rate limiting, no request IDs | All four responsibilities missing |
| Service boundaries | Activity, Verification … as separate services | All modules in one root: `src/app.module.ts:24-28`. Verification imports Activity: `modules/verification/verification.module.ts:4-6,31`; calls `getForVerification/decide/markPending/findWaiting` and `ActivityTypesService.findById`: `verification.service.ts:17-18,77,121-135,209`; `agent-input.ts:1-2` imports activity types | Direct cross-domain calls and writes |
| Communication | Message broker | In-process `EventEmitter`: `common/events/events.service.ts:50-56`; publish after save `activities.service.ts:147-155`, decision events `:246-261`; worker subscribes `verification.worker.ts:32-34` | No broker, no outbox; an event lost in a crash is recovered only by `findWaiting` (`activities.service.ts:325-331`) |
| Data ownership | Per-service DBs + object storage | One connection `app.module.ts:24` (`MONGODB_URI`); photos in GridFS in the same DB `integration/storage/storage.module.ts:6` | Shared database |
| AI | AI services in data/external layer, used by Verification | `integration/ai/` behind `MultimodalModel` (ADR-0012), wired in `verification.module.ts:44-57` | Already aligned; moves with verification |
| Deployment | Independent services | No Dockerfile/compose in repo; `src/dev/dev-participant.module.ts:2` refers to a "production image" that does not exist; CI runs only `npm run test:cov` `.github/workflows/backend.yml:58-60` (Q-E8) | NFR-038 unmet |

Already reusable unchanged: pure rules (`activity/submission-rules.ts`), agent (`verification/agent/**`),
`decide-outcome.ts`, `retry-policy.ts`, job store + leases (`mongo-job-store.ts`, `verification-job.schema.ts:46-49`
unique `activityId`), audit (`audit/**`, unique `idempotencyKey` `audit-entry.schema.ts:42-43`), integration adapters.

## 2. Target for this phase
```
Flutter ──HTTP /api──▶ api-gateway:3000 ──▶ activity-service:3001 ──▶ mongo-activity (juthoor_activity) + object storage
                           │                     ▲  internal REST (subject, photo)          │ outbox relay
                           └──▶ (no route) ──    │                                          ▼
                                       verification-service:3002 ◀──────── Kafka topics ──────┘
                                       (agent, jobs, audit) ──▶ mongo-verification (juthoor_verification), AI provider
```
**Layout (recommended):** single package `backend/` with `apps/api-gateway/src`, `apps/activity-service/src`,
`apps/verification-service/src`, `libs/common` (ex `src/common`), `libs/integration` (ex `src/modules/integration`),
`libs/contracts` (event names, envelopes, topic names, internal DTO types), `libs/messaging` (EventBus port,
in-memory + Kafka adapters, outbox relay). Relative `.js` imports (ADR-0003; no alias tooling); ESLint
`no-restricted-imports` forbids `apps/X` → `apps/Y`. Each app has its own `main.ts`, root module, config
validation, Dockerfile. *Why:* one `npm ci`, one Jest config, CI and coverage unchanged, `git mv` keeps history.
*Alternatives:* npm workspaces per service (true per-service dependency sets, but lockfile/CI churn and ESM
linking work now — revisit when a service needs different deps); separate repos (contradicts ADR-0002); leaving
code in `src/` and adding thin `apps/` roots (no moves, but boundaries stay invisible and easy to break).

**Ownership:** activity-service: `activities`, `activityTypes`, photo metadata, object-storage bucket
`evidence`, `LOCATION_ENCRYPTION_KEY` (only it can decrypt the emirate, NFR-004), seed (`src/dev/seed.ts`).
verification-service: `verificationJobs`, `auditEntries`. *Audit rationale:* verification is the only writer
(FR-054 decisions + AI flags); keeping it local lets the decision and its audit retry loop (`verification.service.ts:160-169`)
stay unchanged. Audit is an architecture.md domain but not a diagram service; a future Audit service would
consume `audit.*` events (OD-4). Status history stays on the activity document (activity-service).

**Flow (FR-015, FR-018–021, FR-026–028, FR-054):**
1. `POST /api/activities` → gateway → activity-service: idempotency, pure rules (422 unchanged), sanitize,
   store photos, create activity **with an embedded outbox entry `ActivitySubmitted`** (one atomic insert).
   Response 201/200 is returned without waiting for verification (NFR-020, NFR-036).
2. Outbox relay publishes to `juthoor.activity.submitted.v1` (key = activityId), marks the entry published.
3. verification-service consumer → `store.enqueue(activityId)` (unique index = idempotent) → claim with lease →
   `GET /internal/v1/activities/:id/verification-subject` (status, description, answers, amount, doneAt,
   emirate, photo refs, type snapshot `{code, category, descriptionEn, neededKinds}`) → photos via
   `GET /internal/v1/activities/:id/photos/:photoId` → agent → `decideOutcome`.
4. If the subject is no longer waiting → job done, nothing published. Otherwise `result` **and an embedded
   outbox entry `VerificationDecided`** are written to the leased job in one conditional update (only if
   `result` is still null — the new "winning write"), then the audit entries are appended; the job becomes
   `done` only after the append succeeds (existing retry-only-the-append path, `verification.service.ts:114-119,160-169`). Technical failure → job retry/exhaust + outbox `VerificationDeferred`
   (`reasonCode` = `processing.retrying` / `processing.failedPermanently`, Q-E4).
5. activity-service consumers apply `markPending` / `decide` (existing conditional updates, `activities.service.ts:227-301`).
   The winning `decide` to `accepted` pushes outbox `ActivityAccepted` in the same update → published once.
   Duplicate or late deliveries match no document → no-op (order-insensitive).

**Events** (envelope `{eventId, type, version: 1, occurredAt, activityId, producer, payload}`; partition key
activityId; IDs/codes/numbers only — no coordinates, description, answers, emirate or photos):
| Topic | Producer → consumer | `eventId` | Payload |
|---|---|---|---|
| `juthoor.activity.submitted.v1` | activity → verification | `ActivitySubmitted:<id>` | `userId, activityTypeCode, category, submittedAt` |
| `juthoor.verification.decided.v1` | verification → activity | `VerificationDecided:<id>` | `status (accepted/returned_for_correction/rejected), reasonCode, decidedAt` |
| `juthoor.verification.deferred.v1` | verification → activity | `VerificationDeferred:<id>:<attempt>` | `reasonCode, attempt` |
| `juthoor.activity.accepted.v1` | activity → (future Rewards/Impact/Campaign) | `ActivityAccepted:<id>` | as `ActivityAcceptedEvent` today (`events.service.ts:27-33`) |
`ActivityDecided` (today, `events.service.ts:19-24`) is republished by activity-service as
`juthoor.activity.decided.v1` only when a consumer exists (Notification, FR-028) — not this phase.

**Outbox:** an `outbox: [{eventId, type, payload, createdAt, publishedAt|null}]` array on the aggregate
(activity / job) written in the same single-document update — atomic without multi-document transactions,
so the standalone `mongo:8` CI service still works. Relay: poll partial index `{'outbox.publishedAt': null}`
every `OUTBOX_POLL_MS`, publish, then `$set publishedAt` (at-least-once). *Alternative:* `outbox` collection +
transactions (needs a replica set in compose and CI). **Consumers:** idempotent by business guard (unique job
per activity; conditional status updates); future crediting consumers must use a unique index on `activityId`
(FR-046). Kafka offsets committed after the handler succeeds; handler failure → retry with backoff, then the
`.dlq` topic (logged by eventId only).

## 3. API Gateway (`apps/api-gateway`)
| Diagram duty | This phase |
|---|---|
| Authentication & authorization | Reuses `IdentityModule` + `ParticipantGuard`; dev participant (ADR-0010) resolved here (same NODE_ENV/flag checks and `X-Juthoor-Dev-Participant` marker). Strips inbound `X-Juthoor-*` headers, adds `X-Juthoor-Participant` + HMAC-SHA256 signature over `participantId|requestId|timestamp` (`GATEWAY_SIGNING_KEY`, 60 s skew). Services use a new `GatewayParticipantResolver` (implements existing `ParticipantResolver`) → controllers unchanged. Later the Identity service issues tokens; only the gateway resolver changes |
| Request routing | Whitelist: `GET /api/activity-types[/:id]` (public), `POST/GET /api/activities`, `GET /api/activities/:id[/photos/:photoId]` → activity-service; anything else 404 `resource.notFound`; `/internal/**` never routed. Streaming proxy (multipart not buffered) |
| Request validation | Coarse only: method/path whitelist, `Content-Length` cap from `UPLOAD_MAX_FILES × UPLOAD_MAX_FILE_MB` → 413 `upload.tooLarge`, `Idempotency-Key` presence/length on POST (service keeps its own check). Domain validation (FR-018–021) stays in activity-service |
| Rate limiting & monitoring | `@nestjs/throttler` per participant/IP → 429 `request.rateLimited` (limits = config, Q-F8); `X-Request-Id` generated/propagated; access log of method, route template, status, latency, requestId (no bodies, IDs, coordinates); `GET /api/health` aggregating `/health` of services |
Contract unchanged: same paths, status codes, bodies, headers (`Cache-Control: private, no-store`), 422
`{message, code, errors[]}` passed through untouched; gateway errors use the existing `ApiExceptionFilter`.
Upstream down → 503 `service.unavailable`. *Alternatives:* Kong (rich plugins, declarative; custom Lua/Go
plugin for ADR-0010 and signing, +DB/ops), Traefik (simple routing/rate limit via labels; auth = forward-auth
service anyway), nginx (`limit_req`, fast; custom auth via `auth_request` subservice, no JSON error shape).
All three would still need a Node auth sidecar — the NestJS gateway is the same code with fewer parts.
New packages: `http-proxy-middleware` (streaming proxy), `@nestjs/throttler` (in-memory store; a shared
store is needed when the gateway scales out, NFR-027 — later).

## 4. Message broker (OWNER DECISION OD-1)
| Option | Fit | Effort | Ops (compose/CI) |
|---|---|---|---|
| **Kafka 4 (KRaft, 1 node)** — recommended | Diagram icon; per-key ordering; replayable log; consumer groups fan out to future Rewards/Impact/Notification | Medium: client lib + topic bootstrap + DLQ | ~1 GB RAM, 20–40 s start in CI; no ZooKeeper |
| RabbitMQ — fallback | Mature queues, DLX, delayed retry; Nest RMQ transport exists | Low–medium | Light (~150 MB), fast start |
| NATS JetStream | Light, simple, persistent streams | Low–medium | Very light; less familiar to the team |
| Redis Streams | Simple; Redis also useful for throttler store | Low | Light; weaker tooling for DLQ/replay |
Retries/backoff for AI already live in the job store (FR-028), so the broker only needs at-least-once delivery.
Client (spike T5): `kafkajs` (pure JS, used by `@nestjs/microservices`; slow maintenance) vs
`@confluentinc/kafka-javascript` (official, librdkafka native build — check Windows dev machines). We use our
own `EventBus` port rather than `@nestjs/microservices` to keep commit control and the in-memory test adapter.

## 5. Docker (NFR-038)
- `backend/apps/<svc>/Dockerfile`: multi-stage `node:24-slim` (glibc for `sharp`), `npm ci` → build → runtime
  with `npm ci --omit=dev`, non-root user, `HEALTHCHECK`, removes `dist/**/dev` (ADR-0010) in production target.
- `backend/compose.yml`: `api-gateway` (only published port 3000), `activity-service`, `verification-service`,
  `kafka`, `mongo-activity`, `mongo-verification`, `minio` (+ bucket init); internal network; named volumes;
  `depends_on: condition: service_healthy`. `backend/compose.test.yml`: `AI_PROVIDER=mock`, tmpfs volumes,
  dev participant on, test keys generated by the runner.
- Config per service (validated at boot as today): gateway `PORT, ACTIVITY_SERVICE_URL, GATEWAY_SIGNING_KEY,
  RATE_LIMIT_*, UPLOAD_*, NODE_ENV, JUTHOOR_DEV_PARTICIPANT`; activity `MONGODB_URI, LOCATION_ENCRYPTION_KEY,
  GATEWAY_SIGNING_KEY, INTERNAL_SERVICE_KEY, STORAGE_*, BROKER_*, OUTBOX_POLL_MS`; verification `MONGODB_URI,
  ACTIVITY_SERVICE_URL, INTERNAL_SERVICE_KEY, BROKER_*, AI_*, VERIFY_*`. Secrets only via an untracked `.env`
  and `${VAR:?}` interpolation. `.env.example` per service: agents are blocked from writing `.env*` (Q-E9/Q-F7)
  — the variable table lives in this plan; the owner creates the files.

## 6. Testing
- **Unit (325):** move with their code; Jest `roots`/`collectCoverageFrom` → `apps/**`, `libs/**`; 80 % branch
  threshold unchanged (NFR-024). Specs touching cross-domain calls (`verification.service.spec.ts`,
  `activities.service.spec.ts`, `events.service.spec.ts`) are adapted to the new ports with equivalent
  assertions; new specs for outbox relay, consumers, gateway signing/resolver (allowed + denied, NFR-025), routing whitelist.
- **E2E (40):** `test/helpers/e2e.ts` `boot()` starts gateway + both services in one Jest process on random
  ports, wired by the in-memory bus; tests call the gateway URL — assertions unchanged.
- **Docker integration (new, `backend/test/integration/*.int-spec.ts`):** `docker compose -f compose.yml -f
  compose.test.yml up --wait` → submit via gateway → mock AI → poll until `accepted`; replay same
  Idempotency-Key → one record; stop verification-service → submit still 201, start → decided (NFR-020);
  restart verification mid-job → exactly one `ActivityAccepted` on the topic; `/internal` not reachable via gateway.
- **CI (Q-E8, Q-F6):** dedicated `ci:` PR adds `npm run test:e2e` and a `docker-integration` job (compose up,
  run `npm run test:int`, upload logs, compose down). Hotspot `.github/**`.

## 7. Security (NFR-033)
Only the gateway is published; services/broker/DBs/storage on an internal network. Gateway-signed identity
(services reject unsigned/expired → 401). `/internal/**` requires `INTERNAL_SERVICE_KEY` (HMAC, per caller) and
is never routed. Broker SASL/SCRAM user per service with topic ACLs (produce own, consume subscribed); per-DB
Mongo users with `readWrite` on their DB only; MinIO user for activity-service only (verification gets bytes
via internal API). No coordinates anywhere on the wire or in events (FR-020 GPS deferred; `rules-2` accepts
manual location only); emirate only in the internal subject response (NFR-004, NFR-007). Logs: eventId,
activityId, codes only. AI stays mock in production (ADR-0012 boot check moves to verification-service).
TLS inside the network (NFR-005) open: Q-F4.

## 8. Future services (contracts only; not built)
| Service | Consumes | Publishes / note |
|---|---|---|
| Identity & User | — | `user.registered.v1`, `user.deleted.v1` (NFR-031 → every service anonymises); gateway verifies its tokens (FR-001) |
| Rewards | `activity.accepted.v1` (unique `activityId`, FR-032, FR-046) | `rewards.issued.v1` (FR-054 audit) |
| Environmental Impact | `activity.accepted.v1` | `impact.recorded.v1` (estimates, NFR-029) |
| Campaign & Challenge | `activity.accepted.v1` (credited once, FR-046) | `challenge.progressed.v1` |
| Community & Leaderboard | `rewards.issued.v1`, `impact.recorded.v1` | — (NFR-020: non-critical) |
| Notification | `activity.decided.v1`, `verification.deferred.v1` (FR-028 notify) | — |
| Payment | **Not in approved requirements** (only NFR-033 "where applicable"; Q-A3, Q-F5) — no contract | — |

## 9. Frontend
No Flutter code change: same paths/shapes; the gateway listens on 3000, so the default `API_BASE_URL`
(`activity_api.dart:36-43`) keeps working. New 429/503 codes fall back to the generic error message; a
localised text for them is optional later (en + ar, NFR-016).

## 10. Tasks and PR slices (all on branches from `feature`; < ~400 changed lines except pure renames)
| ID | Tag | Task | After | Parallel |
|---|---|---|---|---|
| T1 | [backend] | Move-only: `src/common`→`libs/common`, `src/modules/integration`→`libs/integration`; fix imports, Jest/tsconfig/ESLint/build paths; transitional `src/main.ts` still runs everything | OD approval | — |
| T2 | [backend] | Move-only: activity → `apps/activity-service/src`, verification + audit → `apps/verification-service/src`; boundary lint rule (temporary allow-list for the T4 coupling) | T1 | — |
| T3 | [backend] | `libs/contracts` + `libs/messaging`: envelope, topics, `EventBus` port, in-memory adapter (ex `EventsService`), outbox relay + specs | T1 | with T6, T7 |
| T4a | [backend] | activity-service: embedded outbox on submit/decide, consumers for decided/deferred, internal subject/photo controller + service-key guard | T2, T3 | with T4b |
| T4b | [backend] | verification-service: ports `SubjectSource`/`PhotoSource` (HTTP adapters), job outbox, drop `findWaiting`, narrow `buildAgentInput` type | T2, T3 | with T4a |
| T5 | [backend] | Kafka adapter (OD-1), topic bootstrap, DLQ, client spike | T3 | with T4a/b |
| T6 | [backend] | api-gateway app: routing whitelist, streaming proxy, identity signing + `GatewayParticipantResolver`, throttler, request id, health | T1 | with T3, T7 |
| T7 | [backend] | S3/MinIO `PhotoStorage` adapter (OD-3) selected by `STORAGE_PROVIDER` | T1 | with T3, T6 |
| T8 | [backend] | Per-service `main.ts`/root modules/config; remove transitional `src/main.ts`, `app.module.ts`; e2e harness via gateway | T4a, T4b, T5, T6 | — |
| T9 | [backend] | Dockerfiles, `compose.yml`, `compose.test.yml`, `.dockerignore` | T7, T8 | — |
| T10 | [qa] | Docker integration suite + `test:int` script | T9 | — |
| T11 | [ci] | e2e step (Q-E8) + docker-integration job | T10 | — |
| T12 | [docs] | traceability prefixes, plan/ADR status, architecture.md + CLAUDE.md layout (`chore:` hotspot PR), ADR-0004/0006 supersession notes | T8 | with T9–T11 |
**Reuse map (content unchanged, path only):** `src/common/**`→`libs/common/**`; `src/modules/integration/**`→
`libs/integration/**`; `src/modules/activity/**`→`apps/activity-service/src/activity/**`;
`src/modules/verification/**` (agent, decide-outcome, retry-policy, job store, worker) and `src/modules/audit/**`
→`apps/verification-service/src/{verification,audit}/**`; `src/dev/**`→`apps/activity-service/src/dev/**`
(seed) and `apps/api-gateway/src/dev/**` (dev participant). Changed in place: `events.service.ts` (→ adapter),
`verification.service.ts` deps, `verification.module.ts` imports, `activities.service.ts` publish points,
`agent-input.ts` imports.

## 11. Owner decisions and open questions
- **OD-1 (Q-F1)** Broker: Kafka KRaft (recommended) or RabbitMQ.
- **OD-2 (Q-F2)** Gateway: NestJS gateway app (recommended) or Kong/Traefik/nginx.
- **OD-3 (Q-F3)** Photos: S3-compatible/MinIO adapter (recommended, revisits ADR-0006/Q-A8) or GridFS in activity DB.
- **OD-4** Audit ownership: verification DB now (recommended) or an Audit service now.
- **OD-5 (Q-F4)** NFR-005 TLS on the internal network/broker in this phase.
- **OD-6** Accept ADR-0013, supersede ADR-0004, reopen Q-A9.
- **OD-7** New packages: broker client, `@aws-sdk/client-s3`, `http-proxy-middleware`, `@nestjs/throttler`.
- **OD-8 (Q-F8)** Rate-limit values. Also Q-F5 (Payment), Q-F6 (CI docker job), Q-F7 (`.env.example` per service).

**Risks:** big-bang moves conflicting with teammates' branches (mitigate: move-only PRs first, announce freeze
window); Kafka memory/CI time; ESM + relative imports across `apps/`/`libs/` (lint-guarded); losing
exactly-once guarantees during T4 (mitigated by order-insensitive conditional updates + integration test);
NFR-002 30 s budget now includes relay + broker latency (poll interval ≤ 1 s).
