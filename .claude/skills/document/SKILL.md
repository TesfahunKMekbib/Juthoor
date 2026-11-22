---
name: document
description: Update Juthoor project documentation after a change — traceability rows, feature plan/contract, ADRs, open questions — so future sessions and teammates have the knowledge.
argument-hint: "[feature-folder]"
---

# /document (do it yourself — no agent)

1. `docs/traceability.md`: for each FR in the feature, update Status, Code, Tests, Notes. Use `done` only
   if code + tests + review exist. Touch only the affected rows (avoids merge conflicts).
2. `docs/features/<id>/plan.md`: make the API contract match what was built; tick finished tasks.
3. Decisions made during the work → draft `docs/adr/NNNN-*.md` with `Status: proposed` and tell the user.
4. Questions resolved by the user → set `Status: decided` + decision + date in `docs/open-questions.md`;
   new questions → add as `open`.
5. Never edit `docs/requirements/*` (protected). If requirements seem wrong, tell the user.
Report the files you changed in one line each.
