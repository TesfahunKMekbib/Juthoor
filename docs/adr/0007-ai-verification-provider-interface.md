# ADR-0007: Provider-independent AI verification; fully automated decisions

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
Q-C3: no AI vision provider is chosen for FR-025 (and FR-024 blurring). Q-A5: the proposal says
verification "can support manual review"; the FRs describe fully automated decisions (FR-026–028).

## Decision
- The Verification domain calls AI only through a provider-independent interface in
  `backend/src/modules/integration/` (NFR-023), e.g. assess(evidence, activityType, description) ->
  relevance score + flags + model version. The concrete provider is selected by configuration.
- A deterministic mock provider is the default for automated tests and local development.
- The concrete production provider is TBD (narrowed open item, Q-C3).
- Deterministic rules (FR-018–021) run first as pure functions; AI is invoked only if they pass.
- Decisions are automated only (Q-A5): Accepted / Returned for Correction / Rejected per FR-026–027;
  provider unavailability -> Pending Technical Processing with retries (FR-028). No manual review queue.
  FR-055 admin inspection and idempotent retry of failed jobs is not a review queue.
- Each decision records rule/model version for the audit log (FR-054).

## Consequences
- The demo can run end-to-end on the mock provider; swapping providers touches only the integration
  module and config.
- NFR-002 (30 s assessment) must be verified once a real provider is chosen.
- Adding manual review later requires a requirements change and a new ADR.

Related: Q-C3, Q-A5, FR-018–021, FR-024–028, FR-054, FR-055, NFR-002, NFR-023, NFR-024.
