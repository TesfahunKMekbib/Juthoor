# Juthoor Software Factory — Team Guide

The factory is shared, version-controlled Claude Code configuration. Everyone who clones the repo gets
the same instructions, agents, skills, rules, hooks and CI. Each teammate runs their own independent
Claude Code session with their own login.

## 1. One-time setup (each teammate)
1. Install: Git, Node 24 (`.nvmrc`), Flutter 3.47.6, VS Code + the Claude Code extension.
   Optional for GitHub automation: GitHub CLI (`winget install GitHub.cli`, then `gh auth login`).
2. Clone and install:
   ```
   git clone https://github.com/TesfahunKMekbib/Juthoor.git && cd Juthoor
   cd backend && npm ci && cd ../frontend && flutter pub get && cd ..
   ```
   Until the Phase 0 layout (PR #3) is on your branch: run `flutter pub get` in the folder that holds
   `pubspec.yaml` (the repo root today) and skip `npm ci` if `backend/package.json` does not exist yet.
   `/verify` reports those checks as SKIP (CLAUDE.md "Layout status").
3. Open the repo root in VS Code and start Claude Code (`claude` in the terminal, or the extension).
   On first start Claude Code asks you to trust the project settings/hooks in `.claude/settings.json` — accept.
4. Check: `/agents` lists the 5 Juthoor agents; typing `/` shows the skills below; the session starts with a
   `[juthoor] branch: …` line (SessionStart hook). Run `/verify`.
5. Personal preferences only in `CLAUDE.local.md` or `.claude/settings.local.json` (both gitignored).

## 2. What is where
| Path | Purpose |
|---|---|
| `CLAUDE.md` | Always-loaded project instructions (kept short) |
| `.claude/rules/*.md` | Standards; backend/flutter/security/testing/docs rules load only for matching paths |
| `.claude/agents/` | `architect`, `backend-engineer`, `flutter-engineer`, `qa-engineer`, `security-reviewer` |
| `.claude/skills/` | Workflows (table below) |
| `.claude/hooks/` | `guard.mjs` (blocks risky actions), `format.mjs` (formats edited file), `session-start.mjs` |
| `.claude/scripts/verify.mjs` | Same checks as CI, locally |
| `.claude/settings.json` | Shared permissions + hook registration |
| `docs/requirements/` | Approved FR/NFR (read-only) + unapproved interview candidates |
| `docs/open-questions.md` | Conflicts that need a team decision — agents stop on these |
| `docs/traceability.md` | FR → status → code → tests |
| `docs/adr/` | Architecture decisions |
| `docs/features/<id>/` | Per-feature `spec.md`, `plan.md`, `review.md` (agent hand-off files) |
| `.github/` | CI workflows, PR/issue templates, CODEOWNERS, Dependabot |

## 3. Skills
| Command | Does | Agents used |
|---|---|---|
| `/start-task <issue> <slug> [--worktree]` | Checks ownership, creates branch (or worktree) | — |
| `/feature <FR-IDs>` | Full pipeline with 2 human approval gates | as needed |
| `/analyze-requirement <FR-IDs>` | Acceptance criteria + conflicts → `spec.md` | architect |
| `/plan-feature <id>` | Contract + tasks → `plan.md`, waits for approval | architect |
| `/implement <id> [tasks]` | Builds approved tasks, parallel when safe | backend / flutter engineer |
| `/test [id\|backend\|frontend]` | Tests + coverage | qa-engineer (feature mode) |
| `/review [id]` | Correctness + traceability checklist | — (optionally built-in `/code-review`) |
| `/security-check [id]` | OWASP + privacy NFRs + audit | security-reviewer |
| `/document [id]` | Traceability, ADRs, open questions | — |
| `/verify [backend\|frontend]` | Runs CI checks locally | — |
| `/open-pr` | Commit by path, push, open PR — after your "yes" | — |

`/feature`, `/start-task`, `/open-pr` are user-triggered only (Claude will not start them on its own).

**Token efficiency:** agents are started only for the steps a plan needs; small single-layer changes are
done in the main session; agents read the feature files instead of the whole chat and return ≤ 200-word
summaries; stack rules load only when relevant.

## 4. Collaboration workflow
1. **Pick work:** a GitHub issue (template "Feature task") with FR IDs. Assign yourself — that is the claim.
   One issue = one owner = one branch. Unassigned work is not started.
2. **Branch:** `/start-task 12 submission-rules` → `feat/FR-018-submission-rules`.
   Parallel work on one machine: `--worktree` creates `../Juthoor-<slug>`; open it in a new VS Code window
   and run a separate Claude session there.
3. **Build:** `/feature FR-018,FR-021` (or run the individual skills).
4. **PR:** `/open-pr` after you approve. The PR template asks for FR IDs, tests and the verify table.
5. **Review & merge:** CI must be green; one human approval (CODEOWNERS routes reviewers); a human merges
   (squash). Agents are blocked from merging.
6. **Avoid conflicts:** keep PRs small; rebase on the target before opening; change shared hotspot files
   (`CLAUDE.md`, `.claude/**`, `.github/**`, `docs/requirements/**`) only in dedicated `chore:`/`docs:` PRs;
   edit only your FR rows in `docs/traceability.md`.

**Branch strategy (decided at setup, ADR-0002 context):** the factory PR targets `feature`. After it is merged,
the team merges `feature` into `main` once; from then on task branches start from and merge into `main`
(update `.claude/rules/git.md` and `/start-task` when that happens). Dependabot and CODEOWNERS take effect
from `main`.

**Ownership:** replace the commented placeholders in `.github/CODEOWNERS` with teammates' GitHub usernames.

## 5. CI quality gates
| Workflow | Blocking checks | Reporting-only (baseline debt) |
|---|---|---|
| Backend CI | Jest + coverage threshold (NFR-024), `npm ci` | `tsc`, ESLint (Q-D1) |
| Frontend CI | `flutter analyze`, `flutter test` (when `frontend/test/` exists) | `dart format` (Q-D2) |
| Security | gitleaks, `npm audit` (high+, prod deps) | — · CodeQL + dependency review run only on public repos |
| PR checks | Conventional title, FR reference or `no-FR` | — |

Each job writes a pass/fail table to the run's **Summary** tab. When the baseline debt is fixed, set the
repository variable **`STRICT_CHECKS=true`** (Settings → Secrets and variables → Actions → Variables) to make
every check blocking. Locally: `STRICT_CHECKS=true node .claude/scripts/verify.mjs`.

**Repository owner, one time (GitHub → Settings → Branches → add rule for `main` and `feature`):**
require a pull request, 1 approval, review from Code Owners, status checks "TypeScript · ESLint · Jest",
"Dart format · Flutter analyze · Flutter test", "Secret scan (gitleaks)", "Dependency audit (npm)",
"Title and traceability"; block force pushes. (Private repos on a free plan cannot enforce branch
protection; the team then follows the same rules by agreement.)

## 6. Safety rails (enforced)
- Hook-blocked: editing approved requirements, writing `.env`/key files, force-push, push to `main`,
  `reset --hard`, `git clean -f`, `stash`, `git add .`/`-A`, `commit -a`, `--no-verify`, `gh pr merge`.
- Permission prompts: commit, push, branch switch, PR creation, package installs.
- Denied: reading `.env` files, merging, deleting the repo.
- Never committed: `.env*`, `.claude/settings.local.json`, `CLAUDE.local.md`, `.idea/workspace.xml`, coverage.
