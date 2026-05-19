# AGENTS.md - Setomusubi

This project uses the central AI organization workspace. Do not copy the full organization files into this repo.

## Read First

Resolve the central workspace:

```powershell
$centralHub = "C:\Users\chika\OneDrive\Desktop\AI_corp\ai-agent-org"
if (-not (Test-Path -LiteralPath (Join-Path $centralHub "AGENTS.md"))) {
  throw "Central AI organization hub not found: $centralHub"
}
```

Then read:

- `$centralHub\AGENTS.md`
- `$centralHub\intranet\40_context\local-pc-environment.md`
- `$centralHub\intranet\10_projects\existing-projects-overview.md`
- `$centralHub\intranet\10_projects\setomusubi-current-state.md`
- `$centralHub\intranet\10_projects\project-registry.json`

## Project ID

`setomusubi`

## Local Rules

- Use `npm.cmd run build` for validation on this Windows machine.
- Treat live Supabase schema as authoritative when local schema history and live state disagree.
- Keep `reservations.vehicle_id` nullable.
- Do not print or store `.env` values.

## Hard Stop Rules

- Before editing, identify the live runtime surface and the deployment surface. Do not guess.
- Before editing, name the exact files you will modify and why those files are on the live path.
- If the task may touch multiple execution surfaces, such as React, Supabase, Edge Functions, or external integrations, stop and map the full path before applying a partial fix.
- Do not report completion unless you separate: local code edits, local validation run, production deployment done, and items not verified.
