---
name: test
description: Write and run Juthoor tests (unit, integration, widget/e2e) that prove the acceptance criteria of a feature, and report coverage, using the qa-engineer agent. Also use to run the existing test suites and summarise results.
argument-hint: "[feature-folder | backend | frontend]"
---

# /test

- **Run only** (argument `backend`, `frontend`, or nothing and no feature folder): run
  `node .claude/scripts/verify.mjs <area>` yourself and summarise. No agent.
- **Feature** (argument is a feature folder): delegate to `qa-engineer` with the folder path and the base
  branch for `git diff`. Relay: criteria → tests mapping, pass/fail, coverage vs NFR-024 (≥ 80% branch),
  defects with failing test names. Do not fix production code here; defects go back to the engineer agent.
