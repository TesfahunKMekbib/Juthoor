---
paths:
  - "frontend/**"
  - "lib/**"
  - "test/**"
---
# Flutter rules (Flutter 3.47 · Dart 3.13)

- Commands run from `frontend/`: `flutter pub get`, `flutter analyze`, `flutter test`,
  `dart format lib test`. `flutter analyze` must stay at "No issues found".
- Structure (adopt incrementally, don't mass-move existing files): `lib/screens/`, `lib/widgets/`,
  `lib/services/` (API clients), `lib/models/`, `lib/state/`, `lib/l10n/` (ARB files), `lib/theme/`.
- State management and HTTP client packages are not chosen yet: propose in the plan, decide via ADR,
  then use consistently. Do not add packages without listing them in the plan.
- All user-facing text goes through localization (English + Arabic ARB). No new hardcoded strings.
- Layouts must work in RTL: use `EdgeInsetsDirectional`, `AlignmentDirectional`, `start/end`, never `left/right`.
- Accessibility (NFR-015, WCAG 2.1 AA): semantic labels on icons/buttons, contrast ≥ 4.5:1, tap targets
  ≥ 48 dp, support text scaling.
- Colors and text styles come from one theme (`AppColors` today); do not redefine palettes per screen.
- Client-side validation mirrors the backend rules for UX only; the backend remains the authority.
- The submission flow must stay within four screen transitions from home (NFR-013).
- Location: request only at submission time; offer manual entry when denied (FR-012, NFR-007).
- Widget tests live in `frontend/test/`, mirroring `lib/` paths.
