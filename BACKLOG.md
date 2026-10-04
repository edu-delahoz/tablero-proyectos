# Backlog — Integraciones

## Estado
- 2026-10-04 · rama `integraciones` · Parte D (T4) terminada: `node --test` en verde (56 pasan, 2 omitidos que ya existían).
- Commit 57a0a1f, empujado. Sin PR abierto.

## Hecho
- [x] `integraciones/trello.mjs` y `integraciones/azure-devops.mjs`, registrados en `index.mjs`
- [x] Fixtures y tests con `fetch` simulado
- [x] README: campos, credenciales de Trello y ADO, cómo hallar el `boardId`

## SN — Prueba real (opcional, Sonnet, ~10 min)
- [ ] Crear `~/.config/tablero/credenciales.json` (`chmod 600`)
- [ ] Poner `tablero` (Trello) y `organizacion`/`proyecto` (ADO) en el `proyectos.json` local (ignorado por git)
- [ ] `node generar.mjs --probar-conexiones` y corregir lo que aparezca

## Decisiones
- Solo código y tests en esta sesión; sin pruebas reales (faltaban IDs y credenciales).
- Los IDs reales no van en el repo.
- Trello: la sección se envía como etiqueta; ADO: como tag. ADO `columnas.hecho/pendiente` admiten texto o lista.
- ADO: un 203 o una respuesta que no sea JSON se trata como credencial inválida (página de login).

## Archivos tocados
`integraciones/{trello,azure-devops}{.mjs,.test.mjs}`, `integraciones/index.mjs`, `fixtures/integraciones/{trello,azure-devops}.json`, `README.md`.

## Trampas
- `proyectos.json` local no tiene bloque `integraciones`, así que `--probar-conexiones` no pudo comprobar el cableado de «Falta credencial …» (el plan lo pedía). Se comprobará en la sesión de prueba real.
