# Backlog — Tablero (formato legado)

## Estado
- 2026-10-04 · rama `eficiencia` · E5b hecha. Siguiente: **S41** (Sonnet).

## H16 — Eficiencia de uso de Claude Code
Historia: Como usuario con plan Team, quiero gastar menos de las ventanas de 5 h y semanal.

### E5b — Costo por feature: no perder sesiones y sumar ramas hermanas (Opus; sigue a E5)
Origen (2026-10-04, pedido de Eduardo tras probar E5): «Costo por feature (rama)» deja sesiones fuera.
- [x] Entender primero (solo lectura, sin cambiar nada): explicar a Eduardo cómo funciona E4–E7.
- Resultado (2026-10-04, `../BITACORA.md`, 172 filas): casi nada sale del total; el problema es atribución.
- [x] **Test primero** (`bitacora.test.mjs`, verlos fallar y anotar cuántos): la rama de una fila es la más usada.
- [ ] `plantilla.html`: «Costo por feature» con el total por feature y desglose por rama al expandir.

## H15 — Trello: vista previa
Historia: Como Eduardo, quiero importar tarjetas de Trello con vista previa.

### S41 — Conector Trello: URL del tablero y «mías» · **Sonnet** · `integraciones/trello.mjs`, `integraciones/trello.test.mjs`
- [ ] **Test primero** (ver fallar y anotar cuántos): en `trello.test.mjs`, tabla de `normalizarTablero(texto)`.
- [ ] `trello.mjs`: exportar `normalizarTablero` y usarla en `cargar`/`descubrir`.

Prompt de arranque S41 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + H15/S41) y trabaja solo esa sesión en la rama `trello-vista-previa`.
> Al terminar, ejecuta /relevo.
