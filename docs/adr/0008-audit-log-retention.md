# ADR-0008: Append-only audit log with a defined, privacy-respecting retention policy

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
FR-054 requires an immutable audit log of every automated validation decision, AI confidence flag,
reward issuance and administrative configuration change. The DB design expires `auditLogs` after 90
days. NFR-031 requires complete account deletion / anonymization within 30 days. Indefinite retention
would conflict with NFR-031; unbounded mutation would conflict with FR-054 (Q-A6).

## Decision
- The audit log is append-only: entries are never updated by application code; the Audit domain exposes
  no update/delete API for entries.
- Entries capture timestamp, rule or model version and affected record ID (FR-054) and reference
  people and records **by ID only**; no free-text personal data, photos or coordinates are copied in,
  so an NFR-031 deletion can be satisfied by deleting/anonymizing the source records without rewriting
  audit entries.
- Retention is **defined, not indefinite**: entries are removed only by a system retention job applying
  a documented period, and the removal itself is recorded.
- The concrete retention period is not chosen; it remains open as Q-A6b. The DB-design 90-day TTL is not
  adopted until Q-A6b decides it.

## Consequences
- Audit module cannot enable a TTL index until Q-A6b is decided.
- FR-055 search works on IDs and versions, which is sufficient for inspection and retries.
- Whether ID-only entries are sufficient anonymization under NFR-031 should be confirmed with the
  retention period decision.

Related: Q-A6, Q-A6b, FR-054, FR-055, NFR-031.
