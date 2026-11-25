# ADR-0006: Generalized location persistence and GridFS photo storage

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
Q-A7: the DB design stores an exact GeoJSON `location.point` on every activity, but NFR-007 requires
removing exact residential GPS coordinates from persistent storage once location validation completes.
Q-A8: the DB design/proposal assumes object storage with `originalUrl`/`blurredUrl` signed URLs; the code
uses GridFS `fileId` with no blurred copy.

## Decision
Location (Q-A7):
- Exact coordinates are received at submission, used in memory for FR-020 validation (UAE boundary,
  emirate/geofence scope), and never persisted (NFR-007).
- Only the generalized location (emirate / area) is stored; as user-linked location data it is
  encrypted at rest (NFR-004).
- FR-012 manual entry yields the same generalized form.

Photos (Q-A8):
- Storage goes through a provider-independent storage interface in
  `backend/src/modules/integration/` (NFR-023); the first adapter is MongoDB GridFS. Domain records hold
  an opaque file ID, never a provider URL.
- Originals are private by default and never served to other users (NFR-009).
- Any copy made accessible to other users or feeds has EXIF metadata removed first (NFR-008).
- A blurred copy is added when FR-024 (Should) is implemented; not part of the current demo.
- Evidence format/size/count checks (FR-021) run before storage.

## Consequences
- No geospatial index on exact points; geofence checks happen only at validation time.
- Leaderboard/emirate filters (FR-034) use the stored emirate.
- Moving to object storage later is a new adapter plus configuration only.
- GridFS capacity must be watched against NFR-034 (500 GB) and NFR-028.

Related: Q-A7, Q-A8, FR-012, FR-020, FR-021, FR-024, FR-034, NFR-004, NFR-007, NFR-008, NFR-009,
NFR-023, NFR-028, NFR-034.
