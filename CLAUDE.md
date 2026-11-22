# Juthoor (جذور) — Project Instructions

UAE sustainability participation platform. Participants log environmental activities (planting,
recycling, waste reduction, water, energy, cleanups) with photo evidence and location. Submissions pass
**deterministic rule checks first**, then **AI evidence screening**, and only **Accepted** activities
earn points, badges, levels, challenge progress and impact estimates — each exactly once.
Capstone project, Abu Dhabi University, Fall 2026–27.

**Current priority:** the end-to-end demo — *a participant submits an activity and it is verified by AI*
(★ rows in `docs/traceability.md`: FR-009–012, 015, 017–021, 023–028, 051, 054).

## Sources of truth (in priority order)
1. `docs/requirements/functional.md` and `non-functional.md` — **approved**. Cite IDs (`FR-018`, `NFR-007`).
2. `docs/adr/` — accepted architecture decisions.
3. `docs/open-questions.md` — known conflicts. If a task depends on an `open` item: **stop and ask**.
4. Everything else (prototype, DB design page, proposal, `docs/requirements/candidate-insights.md`) is
   reference only. Where it conflicts with 1–2, the requirement wins and you flag the conflict.

Never invent requirements, statuses, categories, or fields. Look requirements up with
`grep -n "FR-0xx" docs/requirements/*.md` instead of loading whole files.

## Stack and layout
- `frontend/` — Flutter 3.47 / Dart 3.13 mobile + web app (Android, iOS).
- `backend/` — NestJS 12 / TypeScript 6 / Mongoose 9 on Node 24 (`.nvmrc`). MongoDB.
- `docs/` — requirements, ADRs, traceability, open questions, per-feature specs and plans.
- `.claude/` — shared agents, skills, rules, hooks. `.github/` — CI, templates, CODEOWNERS.
Known baseline debt: the backend does not compile yet (Q-D1). Do not "fix" it outside an approved task.

## Commands
| Purpose | Backend (`cd backend`) | Frontend (`cd frontend`) |
|---|---|---|
| Install | `npm ci` | `flutter pub get` |
| Typecheck / analyze | `npm run typecheck` | `flutter analyze` |
| Lint / format | `npm run lint` · `npm run format:check` | `dart format --output=none --set-exit-if-changed lib test` |
| Test | `npm test` · `npm run test:cov` | `flutter test` |
| Everything CI runs | `/verify` | `/verify` |

## How work flows (details: `.claude/skills/feature/SKILL.md`)
`/start-task` → `/analyze-requirement` → `/plan-feature` → **human approves plan** → `/implement` →
`/test` → `/review` + `/security-check` → `/document` → `/verify` → **human approves** → `/open-pr`.
`/feature <FR-IDs>` runs the whole pipeline with those two human gates.

Agents: `architect`, `backend-engineer`, `flutter-engineer`, `qa-engineer`, `security-reviewer`.
Delegate only when the task needs that specialty; do small single-layer changes (< ~50 lines) yourself.
Agents hand off through files in `docs/features/<id>/`, and return short summaries.

## Non-negotiables
- Approved requirements are read-only (enforced by hook). Propose changes in chat instead.
- Never commit secrets, `.env*`, personal settings (`.claude/settings.local.json`, `CLAUDE.local.md`).
- Never commit, push, open PRs or merge without explicit human approval in the current conversation.
  Merging is always done by a human on GitHub. Stage files by explicit path, never `git add .` / `-a`.
- Preserve teammates' uncommitted work: never stash, reset, checkout over, or reformat files you did not change.
- Every user-facing string exists in English and Arabic; layouts must work RTL (NFR-016/017).
- Only Accepted activities may produce points, progress or impact (FR-032, FR-046).
- Report results honestly: failing checks are reported with their output, never hidden or skipped.

Personal preferences go in `CLAUDE.local.md` (gitignored), not here.
