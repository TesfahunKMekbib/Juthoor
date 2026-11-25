---
paths:
  - "backend/**"
  - "frontend/**"
  - "lib/**"
  - "test/**"
---
# Security and privacy rules

- OWASP Top 10 (NFR-033): validate input, whitelist query fields, no string-built queries, no secrets in
  code or logs, safe error messages (no stack traces to clients), dependency hygiene (`npm audit`).
- AuthZ (NFR-012, NFR-025): every endpoint declares who may call it; ownership is checked server-side.
  Every permission rule gets tests for both the allowed and the denied path.
- Personal data (NFR-004–009): minimise what is stored. Exact GPS only transiently for validation
  (NFR-007, Q-A7). Strip EXIF before any image is shown to others (NFR-008). Evidence photos private by
  default; never expose photos of children/home interiors publicly (NFR-009).
- Passwords: salted slow hash only (NFR-006). Sessions expire after 15 min inactivity (NFR-011).
  Admins require MFA (NFR-010).
- Uploads: check MIME type and size server-side (FR-021); never trust file extensions or client metadata.
- Never log tokens, passwords, full emails, coordinates, or photo contents.
- Secrets: only via environment variables; commit `.env.example` with placeholder values only.
- AI outputs are advisory evidence, not proof (FR-025); record model version in the audit trail (FR-054).
