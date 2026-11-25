# Requirements discipline

- Every feature, task, branch, commit and PR references the FR/NFR IDs it satisfies.
  Use `no-FR` only for tooling, docs or chores.
- Write acceptance criteria as testable statements derived from the requirement text; quote the ID.
- Do not widen scope: implement what the cited requirement says, nothing "nice to have".
- If the requirement is ambiguous or conflicts with another source, add or update an entry in
  `docs/open-questions.md` (status `open`) and ask the human. Do not choose silently.
- `candidate-insights.md` items (CI-xx) are not requirements until Q-A10 is decided.
- MoSCoW priority guides ordering: Must before Should before Could, unless the demo scenario (★) needs it.
- When a requirement is implemented, update its row in `docs/traceability.md` (code path, test path, status).
