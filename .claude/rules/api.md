---
glob: src/api/**
---

# API layer rules

These rules load only when Claude is editing files under `src/api/**`.

- All API responses are typed. Define request/response shapes as `type` aliases at the top of the route file or in a shared `src/api/types.ts`.
- Validate untrusted input at the boundary. Use `zod` schemas — never trust the request body shape.
- Never log raw request bodies in production code paths; child health data may flow through these endpoints (see CLAUDE.md → Legal Review Required).
- Errors return `{ error: { code, message } }` with a stable `code` string clients can branch on.
- New endpoints get a corresponding test in `src/api/__tests__/` covering: happy path, auth-failure, validation-failure.
- Supabase calls in API routes use the service-role key only when strictly necessary; default to the user's session client so RLS applies.
