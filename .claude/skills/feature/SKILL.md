---
name: feature
description: Orchestrate a complete Juthoor feature end to end (analyze → plan → human approval → implement → test → review → document → verify → human approval) by delegating to the project agents. Use when the user asks to build a feature or FR set, e.g. "/feature FR-018,FR-021".
argument-hint: "<FR-IDs, comma-separated> [short-slug]"
disable-model-invocation: true
---

# /feature — orchestrated feature pipeline

Target: **$ARGUMENTS**. You (the main session) are the orchestrator. Subagents cannot start other
subagents, so you delegate each step, pass file paths (not long context), and consolidate results.

## 0. Preconditions (no agents yet)
- `git status` + current branch. If on `main`/`feature`, or uncommitted changes unrelated to this task
  exist, tell the user and suggest `/start-task` — do not stash or discard anything.
- Feature folder: `docs/features/<FR-ids>-<slug>/`. If `spec.md` / `plan.md` already exist and are
  approved, skip the steps that produced them.

## 1. Analyze → architect (Mode 1) → `spec.md`
If the summary says **BLOCKED**, stop and ask the user the listed open questions.

## 2. Plan → architect (Mode 2) → `plan.md`
**HUMAN GATE 1:** show the user the task list, contract summary and parallelism (≤ 15 lines) and wait
for explicit approval. Apply requested changes through the architect again, not by hand.

## 3. Implement (only tags present in the plan)
- `[backend]` tasks → `backend-engineer`; `[flutter]` tasks → `flutter-engineer`.
- Run both **in parallel in one message** only if plan.md fixes the API contract AND the task file sets
  are disjoint. Otherwise run in dependency order.
- A task touching < ~50 lines in one layer: do it yourself, no agent.
- If an agent reports BLOCKED or a failure it cannot fix, stop and report to the user.

## 4. Test → `qa-engineer`
Defects reported → send the failing test + defect to the owning engineer agent (max 2 loops), then
re-run qa-engineer only on the affected tests. Still failing → report to the user.

## 5. Review (parallel, one message)
- `security-reviewer` on the diff.
- Correctness review: run the built-in `/code-review` if the user wants it; otherwise review the diff
  yourself against spec.md. Save both result lists to `docs/features/<id>/review.md`.
Fix critical/high findings via the owning engineer agent; list medium/low for the user to decide.

## 6. Document — follow `/document` yourself (no agent).

## 7. Verify — `node .claude/scripts/verify.mjs` (or the changed area only).

## 8. Consolidated report + HUMAN GATE 2
One table: step · agent · result · files. Then the verify table, open findings, traceability rows
updated. Ask whether to commit and open a PR (`/open-pr`). Never commit or push without a yes.

## Token discipline
Start an agent only when its tag/step is needed. Give agents the feature folder path and task IDs,
not pasted code. Ask agents for ≤ 200-word summaries. Do not re-run an agent whose output file is
already current.
