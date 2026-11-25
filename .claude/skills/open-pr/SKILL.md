---
name: open-pr
description: Commit the current Juthoor task by explicit paths, push its branch and open a pull request with the project template — only after explicit human approval in this conversation. Never merges.
argument-hint: "[base-branch] [issue-number]"
disable-model-invocation: true
---

# /open-pr

1. Preconditions: on a task branch (not `main`/`feature`); `node .claude/scripts/verify.mjs` has no FAIL;
   `/review` and `/security-check` have no open critical/high findings.
2. Show the user: files to commit (explicit list — only files this task changed; exclude unrelated
   modified files and anything matching `.env*`, `*.local.*`, credentials), the proposed Conventional
   Commit message with FR IDs, base branch, and PR title. **Wait for "yes".**
3. Commit by path: `git add -- <file1> <file2> …` then `git commit -m "<message>"`.
   If other files were already staged by the user, commit with `git commit -m "…" -- <paths>` so their
   staged work is not included.
4. Push (asks permission): `git push -u origin <branch>`.
5. PR (needs `gh`): `gh pr create --base <base> --title "<title>" --body-file <tmp>` where the body
   follows `.github/pull_request_template.md` (summary, FR IDs, tests, verify table, `Closes #<issue>`).
   If `gh` is missing, print the compare URL and the body for the user to paste.
6. Report the PR URL. Merging is done by a human reviewer on GitHub — never run `gh pr merge`.
