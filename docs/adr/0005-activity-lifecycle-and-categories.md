# ADR-0005: Activity lifecycle and categories follow the approved requirements

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
Q-A1: the DB design, `activity.schema.ts` and the prototype each define different status sets
(prototype adds "Possible duplicate", "Pending upload", "Needs more evidence", "Processing"; code lacks
a draft state). Q-A4: FR-007 lists six categories; the Flutter UI and prototype add Transport and Other.

## Decision
Lifecycle states are only those defined in the approved requirements:

| State | Source | Meaning |
|---|---|---|
| Draft | FR-010 ("unsubmitted activity draft") | editable, deletable by the owner |
| Submitted | FR-015 ("submitted revision") | details locked during automated validation |
| Accepted | FR-026 | all deterministic rules pass and AI score meets the threshold |
| Returned for Correction | FR-027 | evidence may be corrected; reason recorded |
| Rejected | FR-027 (also FR-019, FR-022 duplicates) | violates a rejection rule; reason recorded |
| Pending Technical Processing | FR-028 | AI/technical failure; retried per policy |

- The FR-028 label "Pending Technical Processing" is used. NFR-019's "Pending Processing" describes the
  same state (AI or mapping API unavailable) and is treated as a documentation naming inconsistency,
  not a separate status.
- Only Accepted produces points, progress or impact (FR-031, FR-032, FR-046); FR-051 notifications fire
  on Accepted, Returned for Correction and Rejected.
- Prototype-only states are not implemented.
- Categories are those of FR-007: tree planting, recycling, waste reduction, water conservation, energy
  conservation, cleanups. Transport and Other are **not removed silently**: they stay flagged in
  `docs/open-questions.md` (Q-A4b, open) for a stakeholder decision on a requirements change. Until then
  backend seed data contains only the FR-007 categories.

## Consequences
- `activity.schema.ts` gains a draft state and uses the labels above; FR-011 category-specific fields
  map onto the FR-007 categories.
- "Submitted" is the requirements' descriptive wording, not a formally titled status; if stakeholders
  rename it, only the label changes.
- Flutter category chips for Transport/Other must be reconciled once Q-A4b is decided.

Related: Q-A1, Q-A4, Q-A4b, FR-007, FR-010, FR-011, FR-015, FR-019, FR-022, FR-026–028, FR-031, FR-032,
FR-046, FR-051, NFR-019.
