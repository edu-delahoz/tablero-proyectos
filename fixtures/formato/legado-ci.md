# Backlog MVP — CI (formato legado)

## Estado
- **CI (S-CI1, 4-oct-2026):** cerrada; S-CI1b verificó lo post-merge. Siguiente: S-CI2.

## CI — optimización (S-CI1) — ✅ CERRADA (4-oct-2026, PR #32 a `develop`)

> Plan: `~/.claude/plans/pure-imagining-sutton.md`.

- [x] `ci.yml`: quitar `main` de `on.push` (dejar `[develop]`) + comentario de por qué — prueba: tras promover a `main`, sin run nuevo

### S-CI1b — verificación post-merge (Sonnet, ~10k; plugins/MCP: ninguno)

- [x] Mergear PR #32 a `develop` (CI en verde) — *mergeado 4-oct-2026 17:50 (`b634be1`)*
- [x] En la siguiente promoción a `main`: `gh run list --branch main --event push --limit 3` sin run nuevo

### S-CI2 — higiene de ci.yml tras la revisión de la IA de GitHub (Sonnet, ~15k; plugins/MCP: ninguno)

- [ ] `ci.yml`: fijar versiones de las acciones por SHA

Prompt de arranque: «Lee `BACKLOG_MVP.md` (sección S-CI2). Aplica la casilla y anota el run. Al terminar, ejecuta /relevo.»
