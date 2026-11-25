---
name: verify
description: Run the same quality checks as Juthoor CI locally (backend typecheck/lint/Jest/audit, frontend format/analyze/test) and report a pass/fail table. Use before opening a PR or when asked whether the code is green.
argument-hint: "[all|backend|frontend]"
allowed-tools: Bash(node .claude/scripts/verify.mjs:*)
---

# /verify

Run `node .claude/scripts/verify.mjs $ARGUMENTS` from the repository root (no argument = all) and show
its table.

- `WARN (baseline)` = known pre-existing debt that CI also treats as non-blocking (Q-D1, Q-D2 in
  `docs/open-questions.md`). Mention it, but do not try to fix it unless that is the task.
- `FAIL` = blocking. Show the failing check's detail and, if the failure is in files this task changed,
  propose a fix. Never skip or weaken a check to make it pass.
- Set `STRICT_CHECKS=true` in the environment to treat baseline checks as blocking.
