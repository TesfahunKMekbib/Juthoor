---
name: review
description: Review the current Juthoor change before a PR — correctness, requirement traceability, conventions and test adequacy — and record findings in docs/features/<id>/review.md.
argument-hint: "[feature-folder] [base-branch]"
---

# /review

1. Determine the base branch (argument, else `feature`; `main` once integrated) and collect
   `git diff <base>...HEAD --stat` plus uncommitted changes **in files this task touched**.
2. Correctness: run the built-in `/code-review` on the diff if the user wants a deep review; otherwise
   review it yourself. Do not start a separate agent for this.
3. Juthoor checklist (yourself):
   - Every changed behaviour traces to an FR/NFR cited in spec.md; no scope creep, no invented fields.
   - Rule files followed (`.claude/rules/*`); no `@ts-ignore`, no hardcoded single-language strings,
     no `left/right` paddings in Flutter, no provider SDK inside domain services.
   - Each acceptance criterion has a test; no skipped tests; traceability row updated.
   - No unrelated file changes or reformatting.
4. Write findings (severity · file:line · issue · fix) to `docs/features/<id>/review.md` if a feature
   folder exists, else report in chat. Suggest `/security-check` if not yet run.
