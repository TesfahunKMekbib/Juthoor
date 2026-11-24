# ADR-0009: Initial scope — email/password auth; offline and hosting deferred; formatting fixed

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
Several open questions blocked planning without being needed for the current demo:
Q-A2 (prototype adds Google, guest flow, UAE PASS; FR-001 is email + password), Q-C2 (offline-first
scope, NFR-019 / prototype "Pending upload"), Q-C4 (hosting target), Q-D2 (unformatted Dart files).

## Decision
- Q-A2: authentication is email + password only (FR-001), passwords stored as salted hashes (NFR-006).
  Google, guest and UAE PASS sign-in are not implemented; adding them needs a requirements change.
- Q-C2: offline-first capture is deferred. The server-side Pending Technical Processing behaviour
  (FR-028, NFR-019) is still in scope; client-side offline queuing is not.
- Q-C4: the hosting decision is deferred. The backend stays container-ready (NFR-038) and
  configuration-driven so any standard cloud target remains possible.
- Q-D2: existing Dart formatting issues are fixed in Phase 0 (`dart format`), after which the Flutter
  format check can be made blocking in CI.

## Consequences
- The DB `signInMethod` values `google | uae_pass` are not implemented.
- The NFR-019 "offline-first data capture" clause is partly unmet until Q-C2 is revisited; this is a
  known, accepted gap.
- Deployment-dependent NFRs (NFR-018, NFR-021, NFR-026) cannot be verified until Q-C4 is decided.

Related: Q-A2, Q-C2, Q-C4, Q-D2, FR-001, FR-028, NFR-006, NFR-018, NFR-019, NFR-021, NFR-026, NFR-038.
