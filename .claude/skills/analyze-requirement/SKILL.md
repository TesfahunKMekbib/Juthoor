---
name: analyze-requirement
description: Analyze one or more Juthoor FR/NFR IDs into testable acceptance criteria, existing-code coverage, conflicts and open questions, written to docs/features/<id>/spec.md. Use when starting work on a requirement or when asked what a requirement means.
argument-hint: "<FR-IDs> [slug]"
---

# /analyze-requirement

1. Resolve the IDs in **$ARGUMENTS** (`grep -n` in `docs/requirements/*.md`). Unknown ID → stop and say so.
2. Delegate to the `architect` agent in **Mode 1** with: the IDs, the feature folder
   `docs/features/<FR-ids>-<slug>/`, and a pointer to `docs/traceability.md` and `docs/open-questions.md`.
3. Relay the architect's summary. If it reports **BLOCKED**, present the open questions to the user
   as concrete choices and wait. Do not answer them yourself.

For a single, clearly-scoped FR question that needs no file, answer directly without the agent.
