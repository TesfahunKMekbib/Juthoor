---
name: start-task
description: Start a Juthoor task safely — confirm ownership of a GitHub issue, create a correctly named branch (optionally in a separate git worktree for a parallel session) without disturbing uncommitted work.
argument-hint: "<issue-number | FR-ID> <short-slug> [--worktree]"
disable-model-invocation: true
---

# /start-task

1. `git status --short` and current branch. If there are uncommitted changes, list them and ask the user
   whether they belong to this task. Never stash, reset or discard them.
2. Ownership (needs `gh`; if missing, ask the user to confirm ownership manually):
   - `gh issue view <n> --json title,assignees,labels,state`. If assigned to someone else, stop.
   - If unassigned, ask the user before running `gh issue edit <n> --add-assignee @me`.
3. Base branch: `feature` until the team integrates into `main` (see docs/factory/README.md).
   `git fetch origin` then branch name `feat/FR-0xx-<slug>` (or `fix/` `test/` `docs/` `chore/`).
4. Create it:
   - Default: `git switch -c <branch> origin/<base>` — only if the working tree is clean; otherwise
     ask, or offer the worktree option.
   - `--worktree`: `git worktree add ../Juthoor-<slug> -b <branch> origin/<base>` and tell the user to
     open that folder in a new VS Code window and run `claude` there (independent session).
5. Report: branch, base, worktree path (if any), issue link. Suggest `/feature <FR-IDs>` next.
