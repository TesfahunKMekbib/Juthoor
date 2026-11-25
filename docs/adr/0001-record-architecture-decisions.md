# ADR-0001: Record architecture decisions

- Status: accepted
- Date: 2026-11-22

## Context
Four developers and several Claude Code sessions work on Juthoor in parallel. Decisions made in chat
are lost between sessions and teammates.

## Decision
Every decision that shapes architecture, data ownership, external providers, or cross-cutting
conventions is written as a short ADR in `docs/adr/NNNN-kebab-title.md` using this template:
Status (proposed | accepted | superseded by ADR-XXXX), Date, Context, Decision, Consequences,
Related (FR/NFR IDs, open questions). ADRs are never rewritten after acceptance; they are superseded.

Agents may draft ADRs with status `proposed`. Only a human sets `accepted`.

## Consequences
Future sessions read `docs/adr/` instead of re-deriving decisions. Resolving an item in
`docs/open-questions.md` that affects architecture requires an ADR.
