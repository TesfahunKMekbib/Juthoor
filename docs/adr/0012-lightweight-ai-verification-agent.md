# ADR-0012: Lightweight in-house AI verification agent over a multimodal model port

- Status: accepted (decided directly by the project owner in conversation, 2026-11-25)
- Date: 2026-11-25

## Context
ADR-0007 fixed a provider-independent `assess(evidence, type, description) → score + flags` interface.
A single model call returning a score is fragile: no per-photo reasoning, no claim-consistency check
(FR-011 before/after, amount vs. visible evidence), free-text outputs that are hard to audit (FR-054) and
easy to steer by prompt injection. Owner decision (2026-11-25, quoted):
> "Develop our own lightweight AI verification agent using an existing multimodal AI API as its
> intelligence engine. Do not merely implement a single API call. Keep the AI provider configurable and
> retain the mock provider for automated testing. Avoid unnecessary complexity, additional microservices
> and heavy agent frameworks."

## Decision
1. **Placement.** The agent is domain code in the Verification module of the monolith (ADR-0004):
   `backend/src/modules/verification/agent/`. No new service, no agent framework (no LangChain etc.),
   plain TypeScript, no new npm package (response validation is a small pure checker for the schema
   subset we use; `sharp` already present).
2. **Port.** `modules/integration/ai/` exposes a provider-independent `MultimodalModel` (NFR-023):
   `generate({ requestTag, system, parts: (text|image)[], responseSchema, maxTokens, timeoutMs })
   → { json, modelVersion, providerId, usage }`; failures throw a typed `ModelError{kind: unavailable |
   timeout | refused | invalid_output}`. Adapters are selected by `AI_PROVIDER` (`mock` default | `gemini`).
   **First real adapter (owner, 2026-11-25): Google Gemini API, paid service** — a configurable Gemini
   multimodal model (`AI_MODEL`, no model name pinned here), key from `GEMINI_API_KEY` (env/secret only;
   placeholder in `.env.example`), in `modules/integration/ai/gemini/`, implemented with Node's built-in
   `fetch` against the REST API — no SDK dependency. Contract tests use recorded/fake HTTP responses; no real
   network in automated tests. Adapters own provider-specific
   formatting (structured-output mode, image encoding, temperature 0 where supported) and must not enable
   provider tools, web access or function calling. Prompts are provider-neutral so a provider swap touches
   only the adapter and config.
3. **Bounded pipeline** (fixed step budget, deterministic control flow):
   1. `evidence` — one call with all downscaled photos (index + kind) and the type's evidence criteria
      (FR-009): per photo relevance 0..1, quality, criteria met (ids from the given list), flags
      (`screenshot`, `stock_or_watermark`, `ai_generated`, `people_visible`, `embedded_instructions`,
      `unrelated_scene`), confidence.
   2. `claim` — one call: photos + description + answers + amount/unit + `doneAt` date + emirate vs. the
      type's rules: amount plausible, before/after consistent (FR-011 types, else `n_a`), description
      matches, date context plausible — each `yes|no|unclear`, plus confidence.
   3. `followup` — at most one call, only if a confidence < `AI_FOLLOWUP_BELOW` or steps 1/2 conflict; asks
      about the listed unresolved issue codes only; its answers replace those fields.
   4. `aggregate` — pure function → `score 0..1`, flags; then the existing pure `decideOutcome` (Q-E2).
      The model never outputs a decision; hard flags (`screenshot`, `stock_or_watermark`, `ai_generated`,
      `embedded_instructions`) and unresolved low confidence cap the score below the accept threshold
      (→ Returned, never Accepted); `people_visible` is recorded only and never changes the outcome
      (FR-024 deferred). Weights/caps are versioned constants (`AGGREGATION_VERSION`) calibrated with
      the real provider (Q-C3).
4. **Output contract.** Every response is validated against its schema (enums and numbers only, no free
   text). Invalid → one repair call per step quoting only the validator's error paths; still invalid →
   technical failure → FR-028 retry path. Invalid output can never yield Accepted.
5. **Injection hardening.** Participant text is JSON-encoded inside data delimiters (delimiter tokens
   stripped from input); the system prompt states it is untrusted data in Arabic or English and never
   instructions; text inside photos is to be ignored and reported as `embedded_instructions`.
6. **Guards (NFR-002, cost).** `AI_MAX_CALLS` per attempt (3 steps + 2 repairs), total `AI_TOTAL_BUDGET_MS`
   per attempt with per-call timeout `min(AI_TIMEOUT_MS, remaining)`; repair/follow-up skipped when
   remaining < `AI_MIN_CALL_MS`; photos downscaled to `AI_IMAGE_MAX_PX` and re-encoded (EXIF-free) before
   sending; `AI_MAX_OUTPUT_TOKENS`.
7. **Audit (FR-054, ADR-0008).** Decision entry records providerId, per-step model version, prompt
   version, schema version, aggregation version, call count, score, outcome; one entry per flag. IDs and
   codes only — never photo bytes, description, answers or model output text. Logs: same rule.
8. **Mock.** `MockMultimodalModel` is deterministic and keyed by `requestTag`: `fixed` (valid findings
   that aggregate to `AI_MOCK_SCORE`), `scripted` (tests queue per-step responses/errors), `unavailable`,
   `malformed` (schema-invalid output). No network in tests.
9. **Prompts** are versioned code: `agent/prompts/*.ts` exporting `PROMPT_VERSION`.
10. **Production guard (owner, 2026-11-25; NFR-009, FR-024 deferred).** A real provider may be enabled only
    outside production: `AI_PROVIDER != mock` with `NODE_ENV=production` → boot fails fast (same pattern as
    the ADR-0010 dev-participant check, unit-tested). Production stays on the mock until a privacy review.
    In every environment only the sanitized copy is sent (EXIF stripped, downscaled to ~1024 px).

## Consequences
- Partially supersedes ADR-0007 on interface shape only (score now comes from the agent, not the
  provider); ADR-0007's rules-first, automated-only and mock-default decisions stand.
- 2–5 model calls per attempt; worst case per activity `VERIFY_MAX_ATTEMPTS × AI_MAX_CALLS`. NFR-002 must be
  measured on the real provider; retries fall in the 5 % tail.
- Privacy: photos and participant text leave the platform only when Gemini is configured, and only in
  non-production environments (decision 10). Before any production use a privacy review must confirm the
  provider's data-processing terms (retention, training use, region) and a new ADR must lift the guard;
  FR-024 blurring is deferred, so dev photos are sent unblurred (EXIF stripped, downscaled, no coordinates,
  no user identifiers) — use test photos without people where possible.
- Q-C3 is resolved for development (Gemini); production provider use remains open pending the privacy review.
- Risk: prompt tuning for a new provider would edit the Verification module (NFR-023 tension); mitigated
  by provider-neutral prompts and adapter-side formatting; a provider-specific prompt need → new ADR.
- Pure parts (prompt builder, validator, aggregate, follow-up trigger, budget) carry NFR-024 coverage.

Related: FR-009, FR-011, FR-018, FR-024–028, FR-054, NFR-002, NFR-007, NFR-023, NFR-024, Q-C3, Q-E2, Q-E4,
ADR-0004, ADR-0006, ADR-0007, ADR-0008.
