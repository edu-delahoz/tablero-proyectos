# Backlog — Tablero de proyectos

## Estado
- 2026-10-04 · rama `backlog-mejoras` (sale de `integraciones`) · Paso 0 hecho: backlog nuevo con H1–H3. Siguiente: S1.
- `integraciones` sigue sin fusionar en `main`; `mejoras-ui` sale de `backlog-mejoras` para tener este backlog y el código de integraciones.

## H1 — Ajustes visuales

### S1 — Alturas y grafo legible · **Sonnet** · rama `mejoras-ui`
Solo `plantilla.html`. Causa probable del corte: `.panel-falta` (`max-height: calc(100dvh - 40px)`) y `.gh-grafo` (`calc(100dvh - 56px)`) son `sticky` y no descuentan la barra de estado sticky (`#barra-estado`) ni el rótulo que sube `-.8em`. Confirmar en el navegador.
- [ ] Variable `--alto-barra` (medida con un `ResizeObserver` sobre `#barra-estado`) y `max-height` de `.panel-falta` y `.gh-grafo` = `100dvh − top − --alto-barra − margen del rótulo`; comprobar en el navegador que no se cortan (escritorio y ventana baja)
- [ ] Grafo: `main`/`master` siempre en el carril 0 con color fijo (acento) y `develop` en el carril 1 con su color fijo; el resto rota la paleta (`svgGrafo`, `color(col)`)
- [ ] Cabecera de carriles sobre el SVG: el nombre de cada rama en su carril y su color, para leer qué línea es cuál sin buscar la etiqueta ⎇
- [ ] `badgeRama`: `main` y `develop` con estilo propio (relleno + icono); la rama actual resaltada; leyenda que liste rama → color en vez del texto genérico de `vistaGrafo`

### S2 — Barra de estado, favicon y actualización en vivo · **Sonnet** · misma rama `mejoras-ui`
`plantilla.html`, `generar.mjs`, `servidor.test.mjs`, README. PR de `mejoras-ui` al terminar.
- [ ] `--estado-fondo` con colores del tema (p. ej. `--panel`/`--barra` con texto `--texto` y la rama en chip `--acento`), contraste AA en claro y oscuro; ajustar `#barra-estado :focus-visible`
- [ ] Favicon SVG en línea (`<link rel="icon" href="data:image/svg+xml,…">`) con el acento del tema, en el `<head>` de `plantilla.html`
- [ ] `GET /api/version`: huella barata (mtimes, sin `construir`) de backlogs, carpetas `docs`, `~/.claude/plans`, archivos de notas, `.git/HEAD` y `.git/refs` de cada repo, y la bitácora
- [ ] `GET /api/datos`: devuelve `(await fresco(true)).datos`
- [ ] Cliente: si `editable()`, sondear `/api/version` cada ~3 s (pausar con la pestaña oculta, sondear al volver); si cambia, pedir `/api/datos` y repintar conservando proyecto, pestaña, scroll y borradores sin guardar (no repintar con un textarea en edición). En `file://` sigue manual (el hook Stop ya regenera `index.html`)
- [ ] Indicador «● en vivo» / «◌ manual» en la barra de estado
- [ ] Tests de las dos rutas nuevas en `servidor.test.mjs` (Host/Origin igual que las demás)

## H2 — Bitácora en el tablero
Integrar `../BITACORA.md`: verla y completar Calidad / Seguridad / Notas de las filas `_pendiente_`.

### S3 — Núcleo de la bitácora · **Opus** · rama `bitacora`
`bitacora.mjs`, `bitacora.test.mjs`, `generar.mjs`, `servidor.test.mjs`, `fixtures/BITACORA.md`. Respetar el formato de fila de `../registrar_sesion.sh`.
- [ ] `bitacora.mjs`: parsear la tabla `## Registro` (fecha, tarea, sid corto entre paréntesis, modo, modelo, duración, costo, contexto ini→fin + semáforo, calidad, seguridad, notas), `## Resumen semanal`, `## Experimentos en curso` y `## Lecciones aprendidas`. Escapar/desescapar `|`
- [ ] Asociar filas a proyectos: el sid corto se busca en `~/.claude/projects/<transcripciones>/<sid>*.jsonl` de cada proyecto; las que no casan van a «sin proyecto»
- [ ] Campo opcional `bitacora` por proyecto en `proyectos.json` (documentar en `proyectos.ejemplo.json` y README); los proyectos sin el campo no muestran la pestaña
- [ ] `POST /api/bitacora` `{ sid, calidad, seguridad, notas, hash }`: reescribe solo esa fila, valida valores (calidad ✅/🟡/🔴, texto sin saltos de línea), 409 si el archivo cambió desde que se cargó (mismo patrón que `/api/guardar`), añade la ruta a `permitidas`
- [ ] Tests con `fixtures/BITACORA.md`: parseo, asociación, edición, 409, rechazo de ruta no permitida (nunca escribir la bitácora real)

### S4 — Pestaña Bitácora · **Sonnet** · misma rama `bitacora`
`plantilla.html`, README. PR de `bitacora` al terminar.
- [ ] Pestaña «Bitácora» por proyecto: totales (sesiones, costo, duración, % sesiones 🔴), tabla de filas con filtro «este proyecto / todas» y «solo pendientes», resumen semanal y lecciones (solo lectura)
- [ ] Filas `_pendiente_` editables: selector de Calidad, campo Seguridad y Notas, botón Guardar → `POST /api/bitacora`; manejar 409 con aviso y recarga
- [ ] En la barra de estado: «✎ N filas de bitácora pendientes» que abre la pestaña
- [ ] Probar en el navegador completando una fila real y verificar el diff de `BITACORA.md`

## H3 — Integraciones: prueba real

### S5 — Prueba real de conectores · **Sonnet** · rama `integraciones` (~10 min, opcional)
- [ ] Crear `~/.config/tablero/credenciales.json` (`chmod 600`)
- [ ] Poner `tablero` (Trello) y `organizacion`/`proyecto` (ADO) en el `proyectos.json` local (ignorado por git)
- [ ] `node generar.mjs --probar-conexiones` y corregir lo que aparezca

Hecho antes (parte D): `integraciones/trello.mjs` y `integraciones/azure-devops.mjs` registrados en `index.mjs`, fixtures y tests con `fetch` simulado, README con campos, credenciales y cómo hallar el `boardId`.

Decisiones:
- Los IDs reales no van en el repo.
- Trello: la sección se envía como etiqueta; ADO: como tag. ADO `columnas.hecho/pendiente` admiten texto o lista.
- ADO: un 203 o una respuesta que no sea JSON se trata como credencial inválida (página de login).

Trampas:
- `proyectos.json` local no tiene bloque `integraciones`, así que `--probar-conexiones` no pudo comprobar el cableado de «Falta credencial …». Comprobarlo aquí.

## Verificación
- `node --test 2>&1 | tail -20` en verde tras cada sesión.
- `node generar.mjs --abrir`: paneles sin corte (ventana alta y baja), grafo con `main`/`develop` identificables, barra en tonos del tema (claro y oscuro), favicon en la pestaña.
- En vivo: con el tablero abierto, crear un plan en `~/.claude/plans` o marcar una casilla en un `.md` → aparece en ≤ 5 s sin refrescar.
- Bitácora: completar una fila `_pendiente_` desde el navegador, `git diff ../BITACORA.md` muestra solo esa fila; editar el archivo a la vez → 409.

## Cómo ejecutarlo
Ningún plugin/MCP necesario. S1 y S2 comparten `mejoras-ui` (PR al final de S2); S3 y S4 comparten `bitacora` (PR al final de S4).

| Sesión | Modelo | Qué hace |
|---|---|---|
| S1 | Sonnet | Alturas + grafo legible (solo `plantilla.html`) |
| S2 | Sonnet | Barra de estado, favicon, actualización en vivo |
| S3 | Opus | Parser y endpoint de escritura de la bitácora |
| S4 | Sonnet | Pestaña Bitácora en la UI |
| S5 | Sonnet | Prueba real de Trello/ADO (opcional) |

Prompt S1:
> Lee `BACKLOG.md` y haz la sesión S1 (H1 — Alturas y grafo legible) en la rama `mejoras-ui` (créala desde `backlog-mejoras`). Solo toca `plantilla.html`. Confirma primero en el navegador (`node generar.mjs --abrir`) por qué se cortan «Qué falta» y «Grafo de ramas». Marca las casillas al terminar, `node --test 2>&1 | tail -20`, commit. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

Prompt S2:
> Lee `BACKLOG.md` y haz la sesión S2 (barra de estado, favicon y actualización en vivo) en la rama `mejoras-ui`. La huella de `/api/version` debe ser barata (mtimes, sin `construir`). Prueba en el navegador que un plan nuevo en `~/.claude/plans` aparece sin refrescar. Tests en `servidor.test.mjs`, marca casillas, commit, push y abre el PR de `mejoras-ui`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

Prompt S3:
> Lee `BACKLOG.md` y haz la sesión S3 (núcleo de la bitácora) en la rama `bitacora` (desde `main` con `mejoras-ui` ya fusionada; si no lo está, desde `mejoras-ui`). Respeta el formato de fila de `../registrar_sesion.sh`; la escritura solo puede tocar la fila pedida y responde 409 si el archivo cambió. Tests con `fixtures/BITACORA.md`, nada de escribir la bitácora real en los tests. Marca casillas, commit. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

Prompt S4:
> Lee `BACKLOG.md` y haz la sesión S4 (pestaña Bitácora) en la rama `bitacora`, usando la API de S3. Prueba completando una fila real desde el navegador y revisa `git diff` de `BITACORA.md`. Actualiza README, marca casillas, commit, push y abre el PR de `bitacora`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

Prompt S5:
> Lee `BACKLOG.md` y haz la sesión S5 (prueba real de conectores Trello y Azure DevOps) en la rama `integraciones`. Pídeme las credenciales e IDs; no los pongas en el repo. Ejecuta `node generar.mjs --probar-conexiones`, corrige lo que falle, marca casillas, commit. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.
