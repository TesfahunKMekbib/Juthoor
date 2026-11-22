---
paths:
  - "docs/**"
---
# Documentation rules

- Update docs in the same PR as the change: the FR row in `docs/traceability.md`, any API contract in
  `docs/features/<id>/plan.md`, and an ADR for architecture decisions.
- Keep docs short and factual; link to code paths instead of copying code.
- Public classes/functions with non-obvious behaviour get a one-line doc comment that cites the FR.
- Never mark something `done` in traceability unless code, tests and review all exist.
- Do not create new top-level docs or reports unless asked; extend the existing files.
