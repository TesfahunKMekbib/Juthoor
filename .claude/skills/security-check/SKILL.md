---
name: security-check
description: Run a Juthoor security and privacy review (OWASP Top 10, RBAC, NFR-004–012 privacy rules, secrets, dependency audit) on the current change using the security-reviewer agent.
argument-hint: "[feature-folder] [base-branch]"
---

# /security-check

1. Quick local scans yourself (cheap, no agent):
   - `git diff <base>...HEAD --name-only` — flag any `.env*`, key or credential files.
   - `cd backend && npm audit --audit-level=high --omit=dev` — temporarily unavailable when
     `backend/package.json` is missing (until PR #3); report it as skipped (CLAUDE.md "Layout status").
2. Delegate to `security-reviewer` with: base branch, feature folder (if any), the list of changed files.
3. Append the findings to `docs/features/<id>/review.md` under "Security" (the agent is read-only).
4. Critical/high → must be fixed before PR (route to the owning engineer agent). Report the rest.
The built-in `/security-review` command is an alternative for a generic pass; this skill adds Juthoor's
privacy NFRs.
