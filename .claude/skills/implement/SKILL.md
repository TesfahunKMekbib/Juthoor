---
name: implement
description: Implement approved tasks from a Juthoor docs/features/<id>/plan.md by routing [backend] tasks to backend-engineer and [flutter] tasks to flutter-engineer, in parallel only when safe.
argument-hint: "<feature-folder> [task IDs, e.g. T1,T3]"
---

# /implement

1. Open `docs/features/<id>/plan.md` for **$ARGUMENTS**. Refuse if it lacks `Status: approved`.
2. Select the tasks (all not-done tasks, or the IDs given). Group by tag and dependency.
3. Route:
   - `[backend]` → `backend-engineer` · `[flutter]` → `flutter-engineer` · `[qa]` → leave for `/test`.
   - Small single-layer tasks (< ~50 lines): implement yourself following the matching rule file.
   - Independent groups with a fixed contract and disjoint files → start both agents in **one message**.
4. Prompt each agent with: feature folder path, task IDs, and "return ≤ 200 words". No pasted code.
5. After agents return, mark finished tasks `[x]` in plan.md and summarise: tasks done, files changed,
   checks run, blockers. Suggest `/test` next.
