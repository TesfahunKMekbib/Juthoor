# ADR-0011: Packages and privacy mechanisms for the Add an Activity flow

- Status: accepted (approved by project owner 2026-11-25)
- Date: 2026-11-25

## Context
`.claude/rules/flutter.md` requires an ADR before choosing an HTTP client and state management. The
Add an Activity plan (`docs/features/FR-009-028-054-add-activity/plan.md`) also needs image metadata
removal (NFR-007, NFR-008, FR-021) and AES-256 encryption of user-linked location (NFR-004, ADR-0006).

## Decision
Flutter (`frontend/pubspec.yaml`):
| Package | Why | Alternative rejected |
|---|---|---|
| `http` (dart.dev) | REST + multipart (`MultipartRequest`), `MockClient` for hermetic widget tests | `dio`: more features than needed |
| `provider` (+ `ChangeNotifier`) | Smallest learning curve for a 4-person team; DI of `ActivityApi` so tests inject a fake | Riverpod / bloc: more concepts, no need yet |
| `image_picker` (flutter.dev) | Camera/gallery evidence capture, Android + iOS (NFR-037) | — |
| `geolocator` | Permission + one-shot position at submission only (FR-012, FR-020, NFR-007) | `location`: less maintained |
`http_parser` is declared explicitly (multipart `MediaType`); it is already a transitive dependency.
API base URL via `--dart-define=API_BASE_URL`.

Backend (`backend/package.json`):
- `sharp`: decode + re-encode every evidence image before storage; output carries no EXIF/XMP/ICC GPS
  metadata (NFR-007, NFR-008) and a failed decode proves the file is not a real image (FR-021).
  Prebuilt binaries for Linux containers (NFR-038). Magic-byte checks are our own pure function (no package).
- **No package** for encryption: `node:crypto` AES-256-GCM in `backend/src/common/crypto/field-cipher.ts`.
  The generalized location `{emirate, area}` is stored as `{ v, iv, tag, ct }`; key from
  `LOCATION_ENCRYPTION_KEY` (32 bytes, base64); boot fails if missing or wrong length; `v` allows rotation.
  MongoDB CSFLE / Queryable Encryption rejected: needs Atlas/Enterprise and `mongodb-client-encryption`.

## Consequences
- Encrypted emirate cannot be filtered in queries. ADR-0006 expects leaderboard emirate filters (FR-034,
  out of scope now); that future feature must use a non-user-linked aggregate or revisit this ADR.
- Key management (KMS vs env var) is tied to hosting (Q-C4, deferred).
- `sharp` is a native dependency; CI and the container image must use a supported platform.

Related: ADR-0006, Q-C4, FR-012, FR-020, FR-021, FR-034, NFR-004, NFR-007, NFR-008, NFR-013, NFR-037, NFR-038.
