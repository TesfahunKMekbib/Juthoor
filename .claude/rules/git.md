# Git and GitHub conventions

- Branches: `feat/FR-018-submission-rules`, `fix/<short>`, `test/<short>`, `docs/<short>`, `chore/<short>`,
  created from the target branch (currently `feature`; `main` once integrated — see docs/factory/README.md).
  One task (GitHub issue) = one branch = one owner.
- Commits: Conventional Commits — `type(scope): summary [FR-018]`. Types: feat, fix, test, docs,
  refactor, chore, ci, style. Scope = domain or `frontend` / `backend` / `factory`.
- Stage by explicit path. Never `git add .`, `git add -A`, `git commit -a` (blocked by hook) — teammates'
  and your own unrelated uncommitted work must not be swept in.
- Never: force-push, `reset --hard`, `--no-verify`, rewrite shared history, merge PRs (blocked).
- Commit, push and `gh pr create` only after the human approves in the current conversation.
- PRs: small (aim < 400 changed lines), filled template, linked issue (`Closes #N`), green CI,
  one human approval, merged by a human (squash merge).
- Rebase your branch on the target before opening a PR; resolve conflicts yourself, never by
  discarding a teammate's changes.
- Shared hotspot files (`CLAUDE.md`, `.claude/**`, `.github/**`, `docs/requirements/**`) change only in
  dedicated `chore:`/`docs:` PRs.
