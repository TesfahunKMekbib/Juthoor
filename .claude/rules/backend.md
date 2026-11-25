---
paths:
  - "backend/**"
---
# Backend rules (NestJS 12 · TypeScript 6 · Mongoose 9 · Node 24)

- Commands run from `backend/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:cov`.
- Structure per domain: `<domain>.module.ts`, `<domain>.controller.ts`, `<domain>.service.ts`,
  `<name>.schema.ts`, `dto/*.dto.ts`, pure rule files (`*-rules.ts`), tests next to code (`*.spec.ts`).
- ES modules (ADR-0003): relative imports end in `.js` (`import { x } from './x.js'`); `.cjs` for CommonJS config files.
- Strict TypeScript. No `any` unless justified in a comment; no `@ts-ignore` / `@ts-nocheck` (lint error).
- Validate all input at the boundary (DTOs / explicit parsing). Return field-level errors as
  `422 { message, errors: [{ field, message }] }` — the shape already used in the codebase (FR-023).
- User-facing messages must be available in English and Arabic (NFR-016); never hardcode one language
  in a response that reaches the app.
- Mongo: define indexes in the schema file with a comment naming the FR they serve. Use unique indexes
  for idempotency; use partial indexes when the key can be null (see Q-B1). Never build queries from
  raw user objects (operator injection) — whitelist fields.
- Use `Types.ObjectId` / `isValidObjectId` for IDs; never trust IDs from the client for ownership —
  derive the user from the authenticated request.
- Configuration and secrets come from environment variables via a config module; commit only `.env.example`.
- No business logic in controllers. No provider SDKs inside domain services (NFR-023).
- Do not repair the pre-existing compile errors (Q-D1) unless the current task is to do so.
