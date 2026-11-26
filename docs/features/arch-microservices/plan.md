Status: approved (2026-11-25, by project owner) — Q-F8 defaults pending (package checks passed 2026-11-25, §12); demo environment decided 2026-11-25 (§5.2)

# Plan: four-layer microservices migration (Add an Activity scope)

ADR: `docs/adr/0013-microservices-architecture.md` (accepted 2026-11-25, supersedes ADR-0004). Source: owner
decisions 2026-11-25 (quoted in ADR-0013 and §11) and `docs/proposal/system-design.md` + `architecture-diagram.jpg`.
Functional scope unchanged: FR-009–028, FR-054 as delivered in `docs/features/FR-009-028-054-add-activity/`.
Sign-in (FR-001 etc.) stays out of scope; existing functionality, AI agent, frontend screens, security controls,
tests and teammates' contributions are preserved; existing PR approval gates apply to every slice.
Remaining gates: Q-F8 production rate-limit defaults (§3.1). §12 package checks passed for the four packages;
any further package needs its own check before the task that adds it (Q-F9 Redis throttler store).

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
(Demo profile, §5.2: both databases are on one MongoDB Atlas cluster instead of the two Mongo containers.)
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
**Database per service, any host:** ownership is by database name and credentials, not by container: local
compose/CI = `mongo-activity`/`juthoor_activity` and `mongo-verification`/`juthoor_verification`; demo (§5.2) =
the same two database names on the Atlas cluster, each reached only through its own service's `MONGODB_URI`
(recommended: one Atlas database user per service, `readWrite` on its own database only — Q-F11).

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
| Authentication & authorization | **Sign-in is out of scope this phase** (owner, 2026-11-25): no login, registration or token issuance; no `/api/auth/**` route exists (whitelist → 404). Reuses `IdentityModule` + `ParticipantGuard`; dev participant (ADR-0010) resolved here (same NODE_ENV/flag checks and `X-Juthoor-Dev-Participant` marker); with it disabled every participant route answers 401 `auth.required` as today. Strips inbound `X-Juthoor-*` headers, adds `X-Juthoor-Participant` + HMAC-SHA256 signature over `participantId|requestId|timestamp` (`GATEWAY_SIGNING_KEY`, 60 s skew). Services use a new `GatewayParticipantResolver` (implements existing `ParticipantResolver`) → controllers unchanged; ownership checks (404 for another participant's activity/photo) stay in activity-service unchanged. **Future hook:** the gateway's `PARTICIPANT_RESOLVER` binding is the only seam — a later `TokenParticipantResolver` verifying Identity Service tokens (FR-001) replaces the dev binding; services, signing and contracts do not change |
| Request routing | Whitelist: `GET /api/activity-types[/:id]` (public), `POST/GET /api/activities`, `GET /api/activities/:id[/photos/:photoId]` → activity-service; anything else 404 `resource.notFound`; `/internal/**` never routed. Streaming proxy (multipart not buffered) |
| Request validation | Coarse only: method/path whitelist, `Content-Length` cap from `UPLOAD_MAX_FILES × UPLOAD_MAX_FILE_MB` → 413 `upload.tooLarge`, `Idempotency-Key` presence/length on POST (service keeps its own check). Domain validation (FR-018–021) stays in activity-service |
| Rate limiting & monitoring | `@nestjs/throttler` keyed by participant (IP only for requests without a participant) → 429 `request.rateLimited` + `Retry-After` (values §3.1, Q-F8); `X-Request-Id` generated/propagated; access log of method, route template, status, latency, requestId (no bodies, IDs, coordinates); `GET /api/health` aggregating `/health` of services |
Contract unchanged: same paths, status codes, bodies, headers (`Cache-Control: private, no-store`), 422
`{message, code, errors[]}` passed through untouched; gateway errors use the existing `ApiExceptionFilter`.
Upstream down → 503 `service.unavailable`. *Alternatives:* Kong (rich plugins, declarative; custom Lua/Go
plugin for ADR-0010 and signing, +DB/ops), Traefik (simple routing/rate limit via labels; auth = forward-auth
service anyway), nginx (`limit_req`, fast; custom auth via `auth_request` subservice, no JSON error shape).
All three would still need a Node auth sidecar — the NestJS gateway is the same code with fewer parts.
New packages (approved with conditions, §12): `http-proxy-middleware` (streaming proxy; fixed target
allowlist from config, never request-derived — SSRF; `changeOrigin`; drop/overwrite inbound `X-Forwarded-*`),
`@nestjs/throttler` (in-memory store is per instance; a shared Redis store is required before running more
than one gateway instance, NFR-027 — Q-F9).

### 3.1 Rate-limit verification (Q-F8)
Source check (2026-11-25): no approved FR/NFR states a rate-limit number. The proposal §2 (reference only) says the
gateway is responsible for "rate limiting"; NFR-033 (OWASP secure coding) supports having limits but fixes no value;
the "Deploy rate limiting" risk-table entry cited in the brief is **not present** in `docs/proposal/system-design.md`
(only line 25). The approved requirements give **lower bounds** the limits must not violate:
| Requirement | Constraint on limits |
|---|---|
| NFR-001 | 95 % of non-upload API requests within 3 s with 1,000 concurrent users — a 429 to a legitimate user is a failed request |
| NFR-035 | ≥ 99 % of valid non-upload requests succeed with 1,000 concurrent users → no global cap; per-key limits above normal workflow rates |
| NFR-027 | 1,000 concurrent users by adding instances without code change → limits are configuration; no global/per-gateway cap; shared store before scale-out (Q-F9) |
| NFR-036 | 250 simultaneous submissions, ≥ 99 % acknowledged in 5 s — campaign events share one NAT/Wi-Fi IP → **no per-IP limit on identified requests** |
| NFR-002 / FR-028 | Status screen polls every 3 s for ≤ 60 s (`activity_status_screen.dart:103-104`) = 20 GET/min per open screen → read limit well above |
| FR-021 | File-size limits and attachment counts are configured (`UPLOAD_MAX_FILE_MB` 8, `UPLOAD_MAX_FILES` 6, `app-config.ts:62-64`) |

| Limit | Value | Basis | Verdict |
|---|---|---|---|
| Gateway body cap `POST /api/activities` | `UPLOAD_MAX_FILES × UPLOAD_MAX_FILE_MB` + 1 MB multipart overhead (49 MB at defaults) → 413 | FR-021 mechanism; values = existing approved config | **Final** (requirement-backed mechanism, configured value) |
| Global / per-gateway request cap | none | NFR-027, NFR-035, NFR-036 forbid a fixed cap | **Final** |
| Per IP, identified requests | none | NFR-036 (shared event IP) | **Final** |
| Per participant, all `/api` routes | 120 req / 60 s | ≥ 6× status polling (NFR-002/FR-028 UI); no requirement fixes it | Engineering default — Q-F8 |
| Per participant, `POST /api/activities` | 20 / 60 s | Retries reuse `Idempotency-Key` (FR-015); revisit if offline sync (NFR-019, deferred ADR-0009) batches uploads | Engineering default — Q-F8 |
| Per IP, requests without a participant (public `GET /api/activity-types*`, 401 paths) | 3,000 / 60 s | Must exceed 1,000 users behind one NAT opening the form (NFR-027/035) | Engineering default — Q-F8 |
Configuration: `RATE_LIMIT_ENABLED` (default `true`), `RATE_LIMIT_PARTICIPANT_PER_MIN`, `RATE_LIMIT_SUBMIT_PER_MIN`,
`RATE_LIMIT_ANON_IP_PER_MIN`; validated at boot. Under the single dev participant (ADR-0010) every request has one
key, so NFR-036/NFR-027 load runs set `RATE_LIMIT_ENABLED=false` in `compose.test.yml`; a unit/e2e test with a
test-only resolver proves 250 distinct participants from one IP are not throttled and the 121st request of one
participant is (allowed + denied, NFR-025).

## 4. Message broker — decided: Kafka, single node (owner, 2026-11-25, OD-1)
| Option | Fit | Effort | Ops (compose/CI) |
|---|---|---|---|
| **Kafka 4 (KRaft, 1 node)** — recommended | Diagram icon; per-key ordering; replayable log; consumer groups fan out to future Rewards/Impact/Notification | Medium: client lib + topic bootstrap + DLQ | ~1 GB RAM, 20–40 s start in CI; no ZooKeeper |
| RabbitMQ — fallback | Mature queues, DLX, delayed retry; Nest RMQ transport exists | Low–medium | Light (~150 MB), fast start |
| NATS JetStream | Light, simple, persistent streams | Low–medium | Very light; less familiar to the team |
| Redis Streams | Simple; Redis also useful for throttler store | Low | Light; weaker tooling for DLQ/replay |
Retries/backoff for AI already live in the job store (FR-028), so the broker only needs at-least-once delivery.
Client (decided by package check, §12): `@confluentinc/kafka-javascript` (official, librdkafka, prebuilt
binaries for Node 24 win32-x64/linux glibc+musl/darwin, TLS via librdkafka), used through its KafkaJS-like API
behind our own `EventBus` port in `libs/messaging` (NFR-023). `kafkajs` rejected (no release since 2023);
`@nestjs/microservices` Kafka transport not used (requires kafkajs; we also need commit control and the
in-memory test adapter). Install note: its install script must run — CI/Docker use `npm ci` normally, or
`npm rebuild @confluentinc/kafka-javascript` after `npm ci --ignore-scripts`; a source build (MSVC/Python) is
never expected.

## 5. Docker (NFR-038)
- `backend/apps/<svc>/Dockerfile`: multi-stage `node:24-slim` (glibc for `sharp`), `npm ci` → build → runtime
  with `npm ci --omit=dev`, non-root user, `HEALTHCHECK`, removes `dist/**/dev` (ADR-0010) in production target.
- `backend/compose.yml` (**default profile = local + mock**, also what CI runs): `api-gateway` (only published
  port 3000), `activity-service`, `verification-service`, `kafka`, `mongo-activity`, `mongo-verification`, `minio`
  (+ bucket init), one-shot `certs-init` (§5.1); internal network; named volumes;
  `depends_on: condition: service_healthy`; `AI_PROVIDER=mock`. `backend/compose.test.yml`: `AI_PROVIDER=mock`,
  tmpfs volumes, dev participant on, test keys generated by the runner.
- `backend/compose.demo.yml` (**demo override, §5.2**; committed file contains no values): drops the two Mongo
  containers (`profiles: [local-db]` on them, so plain `compose.yml` keeps them), and loads each service's
  variables from an untracked per-service env file via `env_file:` (`apps/activity-service/.env.demo`,
  `apps/verification-service/.env.demo`, `apps/api-gateway/.env.demo`; gitignored, created by the developer).
  Kafka, MinIO and `certs-init` stay local containers. Usage:
  `docker compose -f compose.yml -f compose.demo.yml up`. Never used by CI or by any test script.
- Config per service (validated at boot as today): gateway `PORT, ACTIVITY_SERVICE_URL, GATEWAY_SIGNING_KEY,
  RATE_LIMIT_*, UPLOAD_*, NODE_ENV, JUTHOOR_DEV_PARTICIPANT`; activity `MONGODB_URI, LOCATION_ENCRYPTION_KEY,
  GATEWAY_SIGNING_KEY, INTERNAL_SERVICE_KEY, STORAGE_*, BROKER_*, OUTBOX_POLL_MS`; verification `MONGODB_URI,
  ACTIVITY_SERVICE_URL, INTERNAL_SERVICE_KEY, BROKER_*, AI_PROVIDER, AI_MODEL, GEMINI_API_KEY, AI_*, VERIFY_*`.
  **Least privilege:** `GEMINI_API_KEY` and `AI_MODEL` exist only in verification-service's environment — the
  gateway and activity-service never receive them (no shared `env_file`, no compose-level `environment:` block
  common to all services); each service gets only its own `MONGODB_URI`. Secrets only via an untracked `.env`
  and `${VAR:?}` interpolation. `.env.example` per service: agents are blocked from writing `.env*` (Q-E9/Q-F7)
  — the variable table lives in this plan; the owner creates the files. TLS variables for every service:
  `TLS_CA_FILE, TLS_CERT_FILE, TLS_KEY_FILE` (paths to mounted certs, §5.1); local Mongo `MONGODB_URI` carries
  `tls=true&tlsCAFile=…` (Atlas: §5.2); `BROKER_SSL_CA_FILE`; `STORAGE_ENDPOINT=https://minio:9000` + `STORAGE_FORCE_PATH_STYLE=true`.

### 5.1 Internal TLS (owner decision 5, 2026-11-25: *"Enable internal TLS in accordance with NFR-005."*)
NFR-005: *"The system shall protect personal data transmitted over network connections using TLS 1.2 or later."*
Internal links carrying personal data: gateway→activity (submission body, photos, emirate), verification→activity
internal API (description, answers, emirate, photos), services→MongoDB, activity→MinIO (photos), services→Kafka
(user IDs). All are TLS ≥ 1.2 in compose and in the CI docker job; no plaintext listener is exposed.
| Link | Server side | Client side |
|---|---|---|
| gateway → activity-service; verification → activity `/internal/**` | each service's Nest app starts HTTPS (`httpsOptions` cert/key, `minVersion: 'TLSv1.2'`) | proxy / internal HTTP adapter with `ca` = dev CA, hostname verification on |
| services → Kafka | KRaft broker: only `SASL_SSL` listener (SCRAM, §7), `ssl.keystore.type=PEM`, `ssl.enabled.protocols=TLSv1.3,TLSv1.2` | librdkafka `security.protocol=sasl_ssl`, `ssl.ca.location` |
| services → MongoDB (local/CI) | `mongod --tlsMode requireTLS --tlsCertificateKeyFile … --tlsDisabledProtocols TLS1_0,TLS1_1` | `tls=true&tlsCAFile=…` in URI |
| services → MongoDB Atlas (demo, §5.2) | Atlas always requires TLS; project setting *Minimum TLS protocol version* = 1.2 (or higher) | `mongodb+srv://` (implies `tls=true`); server cert from a public CA → system trust store, no `tlsCAFile`; `tlsInsecure`/`tlsAllowInvalidCertificates` forbidden |
| verification → Gemini API (demo, §5.2) | Google endpoint, HTTPS | Node `fetch` default TLS verification (ADR-0012) |
| activity → MinIO | MinIO `--certs-dir` (`public.crt`/`private.key`) | S3 client `https` endpoint, `forcePathStyle: true`, request handler agent with `ca` |
**Certificates:** `backend/scripts/dev-certs.sh` runs inside the `certs-init` one-shot container (openssl image, so
Windows hosts need no openssl): creates a throwaway dev CA and one server cert per hostname (SANs = compose service
names) into a named volume `certs`, mounted read-only into each container; private keys never leave the volume.
Nothing is committed (`backend/.gitignore` adds `certs/`); `compose down -v` destroys them; CI generates fresh
ones per run. Production certificates come from the hosting platform (hosting deferred, ADR-0009).
**Server-auth TLS, not mTLS (recommended):** NFR-005 requires confidentiality in transit, which server-auth TLS
gives; client identity on each link is already enforced by application credentials (gateway HMAC signature,
`INTERNAL_SERVICE_KEY`, Kafka SCRAM users + ACLs, per-DB Mongo users, MinIO access key). mTLS would add per-client
certs, rotation and broker/Mongo client-cert config with no requirement asking for it; it remains a config-only
upgrade later (same CA, script emits client certs).
**Boot rule:** with `NODE_ENV=production`, a service whose TLS vars are missing or whose Mongo/broker/storage
config is plaintext fails at boot (config validation, like ADR-0010's fail-fast). The Mongo check treats
`mongodb+srv://` as TLS unless the URI sets `tls=false`/`ssl=false`, and rejects `tlsInsecure=true` /
`tlsAllowInvalidCertificates=true` in every environment except the in-process test harness. The in-process Jest e2e harness
(single process, loopback, in-memory bus) stays plaintext; TLS is proven by unit + docker integration tests (§6).
Out of this decision: the public client→gateway edge (TLS at the hosting edge, ADR-0009 deferral); in local dev
the gateway publishes HTTP on `localhost:3000` so the Flutter default `API_BASE_URL` keeps working.

### 5.2 Demo environment (owner decision, 2026-11-25)
Owner, verbatim: *"GEMINI_API_KEY and MONGODB_URI are already configured in backend/.env. Proceed using MongoDB
Atlas and real Gemini verification for the demo. Retain the mock provider for testing and continue the migration
without exposing secrets."*
| Concern | Demo (developer machine, `compose.demo.yml` or local `npm run start`) | Tests and CI |
|---|---|---|
| Database | MongoDB Atlas cluster, `mongodb+srv` (TLS, §5.1, NFR-005). Per-service databases `juthoor_activity`, `juthoor_verification` (§2). Until T8 the transitional `src/main.ts` uses the single `MONGODB_URI` already in `backend/.env` | Local MongoDB only: CI `mongo:8` service (`mongodb://localhost:27017`), compose `mongo-activity`/`mongo-verification`, or `127.0.0.1`. **Never Atlas** — the e2e helper creates and drops its database (`test/helpers/e2e.ts:12-14`, `activities.e2e-spec.ts:16-18,133`, `verification.e2e-spec.ts:165-167`); guard = T14 |
| AI | `AI_PROVIDER=gemini` in verification-service only, `NODE_ENV=development` (or `test`); production refuses to boot (ADR-0012 decision 10, NFR-009) | `AI_PROVIDER=mock` in all unit, e2e, integration tests and CI; no `GEMINI_API_KEY` in CI secrets |
| Secrets | `MONGODB_URI` per service, `GEMINI_API_KEY` + `AI_MODEL` verification-service only, from untracked env files (`backend/.env` today; per-service `.env.demo` from T9) | Generated throwaway keys (`compose.test.yml`), no real credentials |
**Secret handling (NFR-033, `.claude/rules/security.md`):** connection strings and the API key are never
committed, never logged, never echoed in errors, health output or test snapshots. Today's config errors list
variable names only (`libs/common/config/app-config.ts:20,48,98`; `libs/integration/ai/ai-config.ts:60,86`) — keep
that; Mongo connection failures are logged by error name/code only, never the URI or `err.message` containing a
host/userinfo. Gap: `security.md` forbids "secrets in code or logs" but does not name connection strings or API
keys explicitly → add to the T12 `chore:` PR (hotspot `.claude/**`; agents do not edit it here).
**Atlas operational notes (owner actions in the Atlas UI; none in code):**
- *Network access:* IP access list with only the demo machine's current public IP (no `0.0.0.0/0`); remove the
  entry after the demo. Campus/Wi-Fi IP changes → update the list before the demo.
- *TLS:* required by Atlas; set minimum TLS 1.2 (NFR-005); drivers verify the certificate via the system store.
- *Database users (Q-F11):* recommended one user per service with `readWrite` on its own database only
  (`juthoor_activity` / `juthoor_verification`), matching §7 per-DB users; no `dbAdmin`/`atlasAdmin` for services.
  A test helper pointed at Atlas with these users would also fail `dropDatabase` (defence in depth to T14).
- *Pool limits / tier (Q-F10):* free/shared tiers cap concurrent connections per cluster (M0: 500) and
  throughput; the Node driver default `maxPoolSize` is 100 per client. Set `maxPoolSize` in each service URI so
  (services × instances × pool) stays under the tier cap. Consequence: the demo cluster does **not** evidence
  NFR-027, NFR-035, NFR-036 (load) or NFR-034 (500 GB) or NFR-022 (backups: none on free tier); those are verified
  on local/CI infrastructure or a dedicated tier later. Demo data is disposable; seed with `npm run seed:dev`
  (activity database only).
- *Privacy:* Atlas holds the same personal data as local Mongo (encrypted emirate, NFR-004; no coordinates,
  NFR-007); photos go to local MinIO, and to Gemini only from verification-service in non-production (ADR-0012).
  Cluster region is not fixed by any approved requirement (Q-F10).

## 6. Testing
- **Unit (325):** move with their code; Jest `roots`/`collectCoverageFrom` → `apps/**`, `libs/**`; 80 % branch
  threshold unchanged (NFR-024). Specs touching cross-domain calls (`verification.service.spec.ts`,
  `activities.service.spec.ts`, `events.service.spec.ts`) are adapted to the new ports with equivalent
  assertions; new specs for outbox relay, consumers, gateway signing/resolver (allowed + denied, NFR-025), routing whitelist.
- **E2E (40):** `test/helpers/e2e.ts` `boot()` starts gateway + both services in one Jest process on random
  ports, wired by the in-memory bus; tests call the gateway URL — assertions unchanged. `AI_PROVIDER=mock` always.
- **Local-database guard (T14):** before any connect/drop, e2e and integration helpers call a pure
  `assertLocalTestMongo(uri, env)`: allowed only scheme `mongodb://` with every host in `localhost`, `127.0.0.1`,
  `::1` or the compose names `mongo-activity`, `mongo-verification`; `mongodb+srv://` or any other host → throws
  (message names the rule, never the URI) unless `JUTHOOR_TEST_ALLOW_REMOTE_MONGO=1` is set explicitly. Unit
  specs: local URIs pass; srv, remote host, mixed host list rejected; override honoured; message has no URI.
- **Docker integration (new, `backend/test/integration/*.int-spec.ts`):** `docker compose -f compose.yml -f
  compose.test.yml up --wait` → submit via gateway → mock AI → poll until `accepted`; replay same
  Idempotency-Key → one record; stop verification-service → submit still 201, start → decided (NFR-020);
  restart verification mid-job → exactly one `ActivityAccepted` on the topic; `/internal` not reachable via gateway.
  Never with `compose.demo.yml`.
- **TLS (NFR-005):** unit — TLS config loader (missing/invalid files, `minVersion` TLSv1.2), production boot
  rejects plaintext Mongo URI / broker protocol / `http` storage endpoint / missing cert vars; `mongodb+srv`
  accepted as TLS, `tls=false` / `tlsInsecure=true` rejected. Integration (all
  with TLS on, the full flow above must pass): plain HTTP to activity-service:3001 refused; TLS 1.1 handshake
  refused (`openssl s_client -tls1_1`); client with a foreign CA refused; Mongo without `tls=true` refused; Kafka
  has no PLAINTEXT listener; MinIO over `http` refused.
- **Rate limits (§3.1):** unit/e2e — participant over limit → 429 + `Retry-After`, under limit → passes;
  250 distinct participants from one IP not throttled; anonymous per-IP limit; `RATE_LIMIT_ENABLED=false`.
- **Demo smoke (manual, not CI):** owner runs one submission against Atlas + Gemini and records the result in the
  T10 notes; no automated test calls Gemini or Atlas.
- **CI (Q-E8, Q-F6):** dedicated `ci:` PR adds `npm run test:e2e`, `npm audit --audit-level=high --omit=dev`
  (package-check condition 6) and a `docker-integration` job (compose up incl. `certs-init`, run
  `npm run test:int`, upload logs — never the certs volume — `compose down -v`). Hotspot `.github/**`. CI uses
  local Mongo + mock only; no Atlas or Gemini secret is added to GitHub.

## 7. Security (NFR-033)
Only the gateway is published; services/broker/DBs/storage on an internal network. Gateway-signed identity
(services reject unsigned/expired → 401). `/internal/**` requires `INTERNAL_SERVICE_KEY` (HMAC, per caller) and
is never routed. Broker SASL/SCRAM user per service with topic ACLs (produce own, consume subscribed); per-DB
Mongo users with `readWrite` on their DB only (local and Atlas, §5.2); MinIO user for activity-service only (verification gets bytes
via internal API). No coordinates anywhere on the wire or in events (FR-020 GPS deferred; `rules-2` accepts
manual location only); emirate only in the internal subject response (NFR-004, NFR-007). Logs: eventId,
activityId, codes only — never connection strings or API keys (§5.2). AI stays mock in production (ADR-0012 boot
check moves to verification-service); Gemini key only in verification-service (§5).
TLS ≥ 1.2 on every internal link (NFR-005, decided Q-F4): §5.1.

## 8. Future services (contracts only; not built)
| Service | Consumes | Publishes / note |
|---|---|---|
| Identity & User | — | `user.registered.v1`, `user.deleted.v1` (NFR-031 → every service anonymises); gateway verifies its tokens (FR-001) |
| Rewards | `activity.accepted.v1` (unique `activityId`, FR-032, FR-046) | `rewards.issued.v1` (FR-054 audit) |
| Environmental Impact | `activity.accepted.v1` | `impact.recorded.v1` (estimates, NFR-029) |
| Campaign & Challenge | `activity.accepted.v1` (credited once, FR-046) | `challenge.progressed.v1` |
| Community & Leaderboard | `rewards.issued.v1`, `impact.recorded.v1` | — (NFR-020: non-critical) |
| Notification | `activity.decided.v1`, `verification.deferred.v1` (FR-028 notify) | — |
| Payment | Future service only (owner, 2026-11-25, Q-F5); not in approved requirements (NFR-033 "where applicable"; Q-A3) — no contract | — |

## 9. Frontend
No Flutter code change: same paths/shapes; the gateway listens on 3000, so the default `API_BASE_URL`
(`activity_api.dart:36-43`) keeps working. New 429/503 codes fall back to the generic error message; a
localised text for them is optional later (en + ar, NFR-016).

## 10. Tasks and PR slices (all on branches from `feature`; < ~400 changed lines except pure renames)
| ID | Tag | Task | After | Parallel |
|---|---|---|---|---|
| T1 | [backend] | Move-only: `src/common`→`libs/common`, `src/modules/integration`→`libs/integration`; fix imports, Jest/tsconfig/ESLint/build paths; transitional `src/main.ts` still runs everything | owner approval (done) | — |
| T2 | [backend] | Move-only: activity → `apps/activity-service/src`, verification + audit → `apps/verification-service/src`; boundary lint rule (temporary allow-list for the T4 coupling) | T1 | with T13, T14 |
| T13 | [backend] | **TLS (new):** `libs/common/tls` — load CA/cert/key from `TLS_*`, `minVersion: 'TLSv1.2'`, HTTPS server options + client agent factory, production plaintext boot rule (incl. `mongodb+srv` = TLS, `tls=false`/`tlsInsecure` rejected) + specs (no package) | T1 | with T2, T3, T14 |
| T14 | [backend]+[qa] | **Local-DB guard (new, §6):** pure `assertLocalTestMongo` in `test/helpers/` + unit specs; called by `test/helpers/e2e.ts`, `activities.e2e-spec.ts` (own `SERVER_URI` copy) and later integration helpers before connect/`dropDatabase`; override `JUTHOOR_TEST_ALLOW_REMOTE_MONGO=1`; Mongo connection-error logging by name/code only | T1 (now; before the demo env is used) | with T2, T3, T13 (disjoint files: `test/**`) |
| T3 | [backend] | `libs/contracts` + `libs/messaging`: envelope, topics, `EventBus` port, in-memory adapter (ex `EventsService`), outbox relay + specs | T1 | with T2, T13, T14, T6, T7 |
| T4a | [backend] | activity-service: embedded outbox on submit/decide, consumers for decided/deferred, internal subject/photo controller + service-key guard | T2, T3 | with T4b |
| T4b | [backend] | verification-service: ports `SubjectSource`/`PhotoSource` (HTTP adapters **over HTTPS with the CA agent**), job outbox, drop `findWaiting`, narrow `buildAgentInput` type | T2, T3, T13 | with T4a |
| T5 | [backend] | Kafka adapter on `@confluentinc/kafka-javascript` (package check ✔), topic bootstrap, DLQ; **`sasl_ssl` + `ssl.ca.location`** config | T3, T13 | with T4a/b |
| T6 | [backend] | api-gateway app: routing whitelist, streaming proxy (fixed target allowlist; **HTTPS upstream with CA**), identity signing + `GatewayParticipantResolver`, throttler (§3.1 config), request id, health (package check ✔ ×2) | T1, T13 | with T3, T7 |
| T7 | [backend] | S3/MinIO `PhotoStorage` adapter selected by `STORAGE_PROVIDER`; `forcePathStyle`, **https endpoint + CA** (package check ✔) | T1, T13 | with T3, T6 |
| T8 | [backend] | Per-service `main.ts`/root modules/config (**HTTPS listeners + TLS config validation**; AI config loaded only by verification-service, gateway/activity config has no `AI_*`/`GEMINI_API_KEY`); remove transitional `src/main.ts`, `app.module.ts`; e2e harness via gateway (plaintext loopback, T14 guard kept) | T4a, T4b, T5, T6, T14 | — |
| T9 | [backend] | Dockerfiles (confluent install script runs, condition 2), `compose.yml` (default: local Mongo + mock), `compose.test.yml`, **`compose.demo.yml` (Atlas + Gemini via untracked per-service `.env.demo`; Mongo containers behind `profiles: [local-db]`; `.gitignore` adds `**/.env.demo`)**, `.dockerignore` (excludes `.env*`); **`scripts/dev-certs.sh`, `certs-init` service, `certs` volume, TLS flags for Kafka/Mongo/MinIO, `.gitignore certs/`** | T7, T8 | — |
| T10 | [qa] | Docker integration suite + `test:int` script (default/test compose only, mock AI, T14 guard), **incl. TLS negative tests (§6)** and rate-limit tests; manual demo smoke note (Atlas + Gemini, owner-run) | T9 | — |
| T11 | [ci] | e2e step (Q-E8) + docker-integration job (**fresh certs per run, `down -v`**, local Mongo + mock only, no Atlas/Gemini secrets) + `npm audit --audit-level=high --omit=dev` | T10 | — |
| T12 | [docs] | traceability prefixes, plan/ADR status, architecture.md + CLAUDE.md layout (`chore:` hotspot PR); add "connection strings and API keys" to `security.md` log/secret rules (§5.2); ADR-0004/0006 status notes already recorded 2026-11-25 | T8 | with T9–T11 |
**Reuse map (content unchanged, path only):** `src/common/**`→`libs/common/**`; `src/modules/integration/**`→
`libs/integration/**`; `src/modules/activity/**`→`apps/activity-service/src/activity/**`;
`src/modules/verification/**` (agent, decide-outcome, retry-policy, job store, worker) and `src/modules/audit/**`
→`apps/verification-service/src/{verification,audit}/**`; `src/dev/**`→`apps/activity-service/src/dev/**`
(seed) and `apps/api-gateway/src/dev/**` (dev participant). Changed in place: `events.service.ts` (→ adapter),
`verification.service.ts` deps, `verification.module.ts` imports, `activities.service.ts` publish points,
`agent-input.ts` imports.

## 11. Owner decisions (2026-11-25) and open questions
Owner, verbatim: *"1. Approve Kafka, single node. 2. Approve NestJS API Gateway. 3. Approve S3-compatible MinIO
storage. 4. Approve Verification Service ownership of the audit log. 5. Enable internal TLS in accordance with
NFR-005. 6. Approve the proposed packages, subject to security and compatibility checks. 7. Verify the proposed
rate limits against the approved requirements before finalizing them. 8. Keep Payment Service as a future service
only. 9. Accept ADR-0013 and supersede ADR-0004. Proceed with the migration ... Keep sign-in outside the current
implementation scope. ... Keep the migration limited to Add an Activity and retain the existing PR approval gates."*
Later the same day (demo environment, §5.2): *"GEMINI_API_KEY and MONGODB_URI are already configured in
backend/.env. Proceed using MongoDB Atlas and real Gemini verification for the demo. Retain the mock provider for
testing and continue the migration without exposing secrets."*
- OD-1 Kafka 4 KRaft single node — decided (Q-F1). OD-2 NestJS gateway — decided (Q-F2). OD-3 MinIO via
  `@aws-sdk/client-s3`, ADR-0006 superseded in part — decided (Q-F3). OD-4 audit in verification-service — decided.
  OD-5 internal TLS — decided (Q-F4), §5.1. OD-6 ADR-0013 accepted, ADR-0004 superseded, Q-A9 decided.
  OD-7 packages — approved subject to checks; checks passed (§12). Payment — future only (Q-F5).
  OD-8 demo environment — Atlas + real Gemini for the demo, mock + local Mongo for tests/CI — decided (§5.2).
- **Still open:** Q-F8 (owner confirms the engineering defaults in §3.1), Q-F9 (Redis throttler store before
  gateway scale-out), Q-F6 (CI runner budget), Q-F7 (`.env.example` per service), Q-F10 (Atlas tier/region),
  Q-F11 (separate Atlas database users per service).

## 12. Package checks (gate: before the first task adding each package)
security-reviewer, 2026-11-25: throwaway npm install with NestJS 12.6, `--ignore-scripts`, `npm audit` 0 vulnerabilities.
| Package | Version | License | Advisories | Compatibility | First task | Result |
|---|---|---|---|---|---|---|
| `@confluentinc/kafka-javascript` | 1.11.0 | MIT | 0 | Node ≥ 18, typed, KafkaJS-like API, TLS via librdkafka, prebuilt Node 24 win32-x64, linux x64/arm64 (glibc/musl), darwin; ~16 MB | T5 | **Approve with conditions** (chosen Kafka client) |
| `kafkajs` | 2.2.4 | — | — | no release since 2023, 419 open issues | — | Reject; `@nestjs/microservices` Kafka transport not used (needs kafkajs) |
| `@aws-sdk/client-s3` | 3.1177.0 | Apache-2.0 | 0 | MinIO with `forcePathStyle: true` + https endpoint | T7 | **Approve** |
| `http-proxy-middleware` | 4.2.2 | MIT | 0 | ESM-only; Express 5 via `app.use` | T6 | **Approve with conditions** |
| `@nestjs/throttler` | 6.8.0 | MIT | 0 | peer NestJS ^12; in-memory store per instance | T6 | **Approve with conditions** |
| `@nest-lab/throttler-storage-redis` | 1.2.0 | — | — | peer ≤ NestJS 11 | — | Reject for now; shared store → Q-F9 (not approved) |
| Dev CA / TLS | — | — | — | `node:crypto` / openssl image, no package | T13, T9 | n/a |
Atlas and Gemini need no new package (Mongoose already supports `mongodb+srv`; Gemini adapter uses built-in `fetch`, ADR-0012).
Conditions: (1) exact versions pinned in `package-lock.json`; (2) Confluent install script must run (or
`npm rebuild @confluentinc/kafka-javascript` after `npm ci --ignore-scripts`) — CI and Dockerfiles; (3) Kafka client
only behind the `libs/messaging` port (NFR-023), not the NestJS transport; (4) proxy: fixed target allowlist (no
request-derived targets, SSRF), `changeOrigin`, forwarded-header hygiene; (5) shared (Redis) throttler store before
more than one gateway instance (Q-F9); (6) `npm audit --audit-level=high --omit=dev` in CI (T11).
Gate: **passed** for the four approved packages. Any other new package (e.g. a Redis client) needs its own check.

## 13. Risks
Big-bang moves conflicting with teammates' branches (mitigate: move-only PRs first, announce freeze
window); Kafka memory/CI time; ESM + relative imports across `apps/`/`libs/` (lint-guarded); losing
exactly-once guarantees during T4 (mitigated by order-insensitive conditional updates + integration test);
NFR-002 30 s budget now includes relay + broker latency (poll interval ≤ 1 s); TLS handshakes on internal links
(mitigated by keep-alive agents and long-lived Kafka/Mongo connections); native Kafka client binary on dev machines.
Demo (§5.2): a test run accidentally pointed at Atlas drops data (mitigated by T14 guard + least-privilege users);
Atlas IP list / venue network blocks the demo (rehearse on the venue network); free-tier connection cap and
latency to the cluster region (set `maxPoolSize`; Q-F10); Gemini latency/cost within NFR-002 (ADR-0012 budgets);
a leaked URI or key (never logged; rotate the Atlas password / Gemini key if exposed).
