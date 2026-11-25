---
name: plan-feature
description: Produce a Juthoor feature plan (API contract, data/index changes, events, tasks tagged [backend]/[flutter]/[qa] with dependencies and parallelism) in docs/features/<id>/plan.md from an existing spec.md, then stop for human approval.
argument-hint: "<feature-folder or FR-IDs>"
---

# /plan-feature

1. Locate `docs/features/<id>/spec.md` for **$ARGUMENTS**. Missing → run `/analyze-requirement` first.
2. Delegate to the `architect` agent in **Mode 2** with the feature folder path.
3. Present to the user (≤ 15 lines): endpoints, data changes, task list with tags/dependencies,
   which tasks may run in parallel, new packages, open questions.
4. **Wait for explicit approval.** On approval, add `Status: approved (<date>, by <user>)` at the top of
   `plan.md`. Implementation skills refuse plans without that line.
