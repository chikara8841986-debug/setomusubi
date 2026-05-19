# Runtime Status

As of 2026-05-12, this project is a Vite + React app deployed through Vercel.

Current authoritative surfaces:

- `index.html`
- `src/`
- `supabase/` for database, auth, and edge-function related behavior
- `vercel.json`

Notes:

- The primary UI runtime is the Vite entry under `src/`.
- Changes that depend on Supabase behavior may require checking both app code and Supabase-side execution surfaces.
- Do not assume a frontend-only fix is complete when the real behavior also depends on schema, RLS, or edge-function logic.
