# Architecture rules

- Domain boundaries follow the proposal's services: Identity & User, Activity, Verification, Rewards,
  Campaign & Challenge, Impact, Community & Leaderboard, Notification, Audit. Each owns its collections;
  other domains reference its records by ID only and never write to them directly.
- Physical shape (one NestJS app with modules vs. separate services) is undecided (Q-A9). Until decided,
  keep each domain self-contained (own module, schemas, service, controller, DTOs) so either shape works.
- Cross-domain effects (e.g. Accepted → award points → update impact) go through events with an
  idempotency key (activityId), so retries never double-credit (FR-015, FR-028, FR-046).
- Deterministic validation (FR-018–021) runs before any AI call and lives in pure functions
  (no I/O) so it is unit-testable.
- External providers (AI vision, maps, storage, email/push) sit behind an interface in one integration
  module selected by configuration (NFR-023). No provider SDK calls from domain services.
- REST + JSON only (NFR-030). API contracts are agreed in `docs/features/<id>/plan.md` before the
  backend and Flutter work start in parallel.
- Any decision that changes the above, adds a dependency of note, or resolves an open question → ADR.
