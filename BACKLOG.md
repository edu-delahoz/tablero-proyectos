# Backlog — Tablero de proyectos

## Estado
- 2026-10-04 · rama `integraciones-vista` · S17 hecha, tests en verde (112 pasan, 2 omitidos): `listar()` en GitHub/Trello/ADO (solo lectura, reutilizan `api`/`gql` y `traducirError`) y `POST /api/integraciones/descubrir` (`{tipo, clave?, consulta}`; 400 sin credencial, 502 con error traducido, 15 s). Todo con `fetch`/`gh` simulados, nada de red real. Los cambios sin commit de `coherencia*.mjs` no son de H8. Siguiente: **S18** (Sonnet, formulario en la vista Integraciones).
- 2026-10-04 · S15 hecha (mod `~/.claude/mods/panel-tablero`, sin git): rutas relativas y nombres sueltos de backlog resueltos contra el root, sesión pedida en el prompt («Sesión S3c de BACKLOG_MVP.md»), `seccionDe` entiende viñetas `- **S3c — …**` (tarea madre, casillas, fallback a la primera abierta), tarjeta con `H3 › Personas mal migradas › S3c  …` + hasta 4 casillas, y texto ajustado en vez de recortado. `claude plugin test` 11/11, `plugin validate` OK (solo aviso de `author`), `tsc` limpio. Con el `BACKLOG_MVP.md` real: pedida S3c → 3/3; sin pistas → S4c con 4 casillas. H7 cerrado.
- 2026-10-04 · rama `plan-en-curso` · S14 hecha, tests en verde (93 pasan, 2 omitidos): huella del código en `/api/version` (`codigo`), `POST /api/salir` (solo local), `asegurarServidor()` recicla (salir → SIGTERM al pid de `lsof` → arrancar) y el servidor se relanza solo cada 30 s si cambia el código — comprobado con el servidor real (viejo de S11 reciclado por SIGTERM; `touch plantilla.html` → «reinicio por código nuevo» en 30 s). `construirFrente`: abiertas por sub-sesión (Falta = la siguiente), `planDelFrente` (mención en la siguiente → en la hecha → nombre con la clave y el backlog → lo de antes) con `planDe`; tarjeta «Falta · S3c — …», «S3c 0/3», «Plan (de S3)». Con el `BACKLOG_MVP.md` real: S3c siguiente, 3 casillas, plan `sesi-n-s3c-de-backlog-mvp-md-swift-ember.md`. No se miró la tarjeta en el navegador (solo `/api/datos`). Los cambios sin commit de `coherencia.*` (aviso «sesión sin casillas») no son de S14. Siguiente: **S15** (mod).
- 2026-10-04 · fuera del repo · revisión del panel `panel-tablero` a 207 y ~120 col: no se pudo ver el panel real (`/tablero` solo se ve en la UI de Claude Code). Ampliado el test «plan solo leído» del mod a anchos 120 y 207: `claude plugin test` 7/7, ningún texto desborda. Sin cambios en el repo salvo este backlog. Pendiente solo: vistazo del usuario a `/tablero` (207 y ~120).
- 2026-10-04 · fuera del repo · verificación del mod `~/.claude/mods/panel-tablero` v2 hecha en lo automatizable: `claude plugin test` 7/7 (nuevo test: plan solo leído → «👁 leído» y ningún texto desborda a 40/60/100 col), `plugin validate` y `tsc` limpios; los casos «sin tocar → del proyecto», «✎ actualizando» y «↳ antes» ya los cubrían los tests existentes. No se pudo ver el panel real: pendiente solo un vistazo del usuario en Claude Code (`/tablero`, ancho 207 y ~120). Sin cambios en el repo salvo este backlog.
- 2026-10-04 · fuera del repo · mod `~/.claude/mods/panel-tablero` v2 hecho (plan `~/.claude/plans/con-relacion-al-plan-lovely-lightning.md`), sin git: tarjeta «Esta sesión» con plan y backlog sacados de `$.session.messages()` (`focoDeSesion`, `seccionDe`, `leerFoco`; quitado `userConfig.backlog`), refresco inmediato en Write/Edit/Read de plan/backlog. `claude plugin test` 6/6, `plugin validate` y `tsc` limpios. Pendiente: verificación manual en Claude Code (sin tocar nada → «del proyecto»; leer/editar → «✎ actualizando» y «↳ antes»; ancho 207 y ~120 col). Trampa: en el `.tsx` ninguna variable puede llamarse `h` (tapa la fábrica JSX).
- 2026-10-04 · rama `plan-en-curso` · S13 hecha, tests en verde (88 pasan, 2 omitidos): `linea` en secciones y tareas de `estructura()`; `frenteActivo(b, historial, planes)` (la entrada más reciente del historial manda; ignora Estado y hitos completos → `null` y vuelve el «estás aquí»; tarea abierta más profunda con hijas; sub-sesiones `**S\d+**`; plan por mención en la tarea o por clave del hito en el título); `b.activo` en `recolectar()`; `enCurso`/`tarjetaEnCurso` y el «estás aquí» de «Todos los proyectos» lo usan. CDP con copia de `datos/`: IEP → «H3 › Personas mal migradas», plan «cerrar los 5 pendientes de H3», S1·S1b·S2 ✓ y **S2b** siguiente (el backlog real ya avanzó desde S2), rama `h3-personas-s2`; tablero → H6/S13. H6 completa. Pendiente: que el usuario la pruebe (`node generar.mjs --abrir`).
- 2026-10-04 · rama `plan-en-curso` · S12 hecha, tests en verde (83 pasan, 2 omitidos): `protegerProceso`/`protegerManejador`, `enviar` seguro, `datos/servidor.log` (ya ignorado por `datos/`), `--asegurar-servidor` en el hook, `asignarPlanes` (mayoría; `federated-swing` ya solo en IEP). Comprobado: matar el servidor y abrir sesión (hook) lo revive. Siguiente: **S13** (Opus, B+C). Plan `~/.claude/plans/pasted-content-id-9662-se-callo-harmonic-waffle.md`.
- 2026-10-04 · rama `plan-en-curso` (sale de `notas-tablero`) · S11 hecha, tests en verde (80 pasan, 2 omitidos): `plan` y `modelo` en `estructura()`, `enCurso`/`tarjetaEnCurso` en `plantilla.html` (arriba del Resumen y franja en «Todos los proyectos»); probada por CDP con copia de `datos/` y con S10 desmarcada en una copia del backlog. Nota respondida. Pendiente: que el usuario la pruebe (`node generar.mjs --abrir`).
- 2026-10-04 · rama `notas-tablero` · S10 hecha, tests en verde (79 pasan, 2 omitidos): vista «Todos los proyectos» (`vistaTodos`, `resumenProyecto`, `abrirProyecto` en `plantilla.html`; `todos` es un flag aparte de `P`, `#p=todos`); probada por CDP con copia de `datos/` (clic en tarjeta/enlaces, hash, recarga, sin guardado). H5 completa. PR #7 (base `busqueda-favoritos`). Pendiente: que el usuario la pruebe (`node generar.mjs --abrir`).
- 2026-10-04 · rama `notas-tablero` · S9 hecha, tests en verde (79 pasan, 2 omitidos): bloque «Gastos» en Bitácora (`grafTiempo`, `grafRamas`, `grafModelos` en `plantilla.html`, SVG en línea, paleta dataviz slots 1-3 validada, tooltip, tabla accesible); nota 3 respondida. Revisado con captura headless. Siguiente: S10.
- 2026-10-04 · rama `notas-tablero` · S8 hecha, tests en verde (79 pasan, 2 omitidos): `bitacora.mjs` con `ramaDeTranscripcion` (cache por mtime), `sidsPorProyecto(…, rutas)` llena sid→.jsonl, `asociar(bit, mapa, rutas)` añade `rama` a cada fila, `agregar(registro, { por })` → `{ grupos, excluidas }`, `semanaISO`, `normalizarModelo`. Pendiente: probar S7 en el navegador. Siguiente: S9 (cargar skill `dataviz`).
- 2026-10-04 · rama `notas-tablero` (sale de `busqueda-favoritos`) · S7 hecha, tests en verde (76 pasan, 2 omitidos): `estasAqui` salta a la siguiente no hecha (IEP → S6), `segmentos` pinta los `###`, proyecto persistente por id (`#p=` + `tablero.proyecto`). Notas 1 y 2 respondidas. Pendiente: probar en el navegador (`node generar.mjs --abrir`; IEP → Resumen y refrescar). Siguiente: S8.
- 2026-10-04 · rama `busqueda-favoritos` (sale de `backlog-coherencia`) · S6 hecha: búsqueda en Backlogs/Planes y sesiones favoritas (`POST /api/favoritos`). Pendiente: PR y que el usuario la pruebe en el tablero real (`node generar.mjs --abrir`).
- 2026-10-04 · rama `bitacora` (sale de `mejoras-ui`, aún sin fusionar en `main`) · S3 hecha: `bitacora.mjs` (parser, asociación por sid, `editarFila`), `datos.proyectos[i].bitacora`, `POST /api/bitacora`. Pendiente de `mejoras-ui`: comprobar en el navegador y fusionar. Siguiente: S4 en `bitacora`.
- `integraciones` sigue sin fusionar en `main`; `mejoras-ui` sale de `backlog-mejoras` para tener este backlog y el código de integraciones.

## H8 — Configurar integraciones desde la vista Integraciones

Plan: `~/.claude/plans/quiero-que-planes-en-vivid-locket.md`. Rama `integraciones-vista` (sale de `plan-en-curso`). Crear, editar, quitar y probar integraciones, guardar credenciales (`chmod 600`, nunca vuelven al HTML ni a `/api/datos`: solo `{ guardada, fuente, fin }`) y elegir el destino en desplegables, sin tocar archivos a mano.

### S16 — Núcleo: config recargable, credenciales y endpoints · **Opus** · rama `integraciones-vista`
`generar.mjs`, `integraciones/config.mjs` (nuevo), `integraciones/credenciales.mjs`, `servidor.test.mjs`, `integraciones/*.test.mjs`.
- [x] `generar.mjs`: `proyectos` deja de ser `const`; `cargarProyectos()` recarga si cambia el mtime de `CONFIG`; `CONFIG` entra en `huella()`
- [x] `integraciones/config.mjs`: `validarIntegracion` (id `^[a-z0-9-]{1,30}$` único, tipo en `ADAPTADORES`, obligatorios por tipo, backlog existente, lista blanca de campos), `aplicarCambio` (sobre JSON crudo, conserva `~`, campos ajenos y orden), `escribirAtomico` (tmp + rename); tests
- [x] `integraciones/credenciales.mjs`: `guardarCredencial(clave, campos, ruta)` (mezcla, atómico, `0o600`, `mkdir -p`) y `resumenCredenciales(datos, env)` sin secretos; tests contra ruta temporal
- [x] Endpoints `POST /api/integraciones/guardar` y `/quitar` (409 si cambió el mtime de `proyectos.json`), `/probar` (sin guardar, con timeout) y `POST /api/credenciales` (solo campos de `REQUISITOS`, responde el resumen); mismas guardas Host/Origin/JSON
- [x] `recolectar` añade `datos.credenciales` (resumen) y `datos.configMtime`
- [x] Tests de servidor contra copia (`TABLERO_PROYECTOS`, ruta de credenciales inyectada): guardar/quitar, 409, `/api/credenciales` sin el secreto y archivo `0600`, `/api/datos` sin el valor de ningún token

Decisiones y trampas (S16): la ruta de credenciales se inyecta con `TABLERO_CREDENCIALES` (los tests nunca tocan `~/.config/tablero`). `resumenCredenciales` va por tipo (`trello`, `azure-devops`, `github-projects` → `fuente: 'gh'`) y por id con entrada propia; `fin` solo si el valor tiene ≥ 8 caracteres; nunca nombres de campo (el test de `/api/datos` busca «token»). `guardarCredencial` no pisa un `credenciales.json` con JSON roto; campo vacío = borrarlo. `/api/credenciales` acepta como `clave` un tipo o el id de una integración ya configurada. `/probar` responde 502 con el error del conector si la lectura falla (400 si no valida). Editar conserva campos fuera de la lista blanca; renombrar responde `renombrada: true` (la vista debe avisar de marcas huérfanas). `proyectos.json` se reescribe con la sangría detectada (el real usa 2 → `git diff` solo del bloque). `CONFIG` y `credenciales.json` entran en `huella()`.

### S17 — Descubrir Projects, tableros y columnas · **Sonnet** · rama `integraciones-vista`
- [x] GitHub `listar()`: Projects del usuario y sus orgs (`gql` vía `gh`); con `{propietario, numero}` → campos de selección con opciones y campos de texto; tests con `gh` simulado
- [x] Trello `listar()`: tableros abiertos; con `tablero` → listas abiertas; tests con `fetch` simulado
- [x] ADO `listar()`: proyectos de la organización; con `proyecto` → tipos de work item y estados; tests con `fetch` simulado
- [x] `POST /api/integraciones/descubrir` `{ tipo, clave?, consulta }` (timeout 15 s, errores con `traducirError`); test de servidor

Decisiones (S17): `listar(cfg, cred, deps)` en cada conector, solo lectura, con la misma `api`/`gql` y `traducirError`. GitHub: `{}` → `{ proyectos: [{propietario, numero, titulo, url}] }` (usuario + orgs, sin cerrados); `{propietario, numero}` → `{ titulo, camposSeleccion: [{nombre, opciones}], camposTexto }`. Trello: `{}` → `{ tableros: [{id (shortLink), nombre, url}] }`; `{tablero}` → `{ titulo, listas }`. ADO: `{organizacion}` → `{ proyectos: [nombre] }` (la `api` omite el proyecto de la URL si no hay); `+ proyecto` → `{ tipos: [{nombre, estados}] }`. `POST /api/integraciones/descubrir` `{ tipo, clave?, consulta }`: solo pasa a `listar` `propietario/numero/tablero/organizacion/proyecto`; credencial por `credencialesPara({id: clave, tipo})` (400 `falta-credencial` + `paso`), 502 con el error traducido, 15 s. Nunca devuelve credenciales.

### S18 — Formulario en la vista Integraciones · **Sonnet** · rama `integraciones-vista`
- [ ] «+ Añadir integración»; el estado vacío pasa a ser el formulario (no el texto del README)
- [ ] Formulario por pasos: tipo → credencial (guardar / «guardada · …ab12» + Cambiar) → destino (desplegable) → backlog → columnas → id propuesto → `auto` → Probar → Guardar
- [ ] «Editar» y «Quitar» en cada tarjeta (avisos de marcas huérfanas y de que no se borra nada afuera); deshabilitados sin servidor
- [ ] README «Conectores y credenciales»: primero la vista, el JSON a mano como alternativa
- [ ] Prueba real en el navegador con `proyectos.json` y `HOME` de prueba: añadir, editar, probar y quitar (Trello o GitHub); `git diff` del json de prueba muestra solo el bloque; push y PR

## H7 — Sub-sesión exacta y sus casillas

Plan: `~/.claude/plans/problema-en-el-en-smooth-panda.md`. Rama `plan-en-curso`. Caso real: IEP en **H3 › Personas mal migradas › S3c** (tras S3 y S3b); la tarjeta mostraba el plan viejo (servidor arrancado antes de S13) y el mod decía «sin backlog».

### S14 — Servidor que se recicla, Falta y plan por sub-sesión · **Opus** · rama `plan-en-curso`
`generar.mjs`, `plantilla.html`, `generar.test.mjs`, `servidor.test.mjs`, README (parte A del plan).
- [x] `servir()`: huella (mtime de `generar.mjs`, `plantilla.html`, `bitacora.mjs`, `coherencia.mjs`) en `/api/version`; `POST /api/salir` solo desde 127.0.0.1
- [x] `arrancarServidor()` (`--asegurar-servidor`): huella distinta → pedir salida y arrancar uno nuevo; el servidor la comprueba cada ~30 s y se relanza solo; `servidor.log` «reinicio por código nuevo»; test en `servidor.test.mjs`
- [x] `construirFrente`: cada sub-sesión guarda sus `abiertas`; `tarea.abiertas` = las de la sub-sesión siguiente (o la tarea si no hay sub-sesiones); test con fixture de la forma de `BACKLOG_MVP.md` (S3/S3b hechas, S3c abierta, S4 con casillas → Falta = solo S3c)
- [x] Plan por sub-sesión: mención en la siguiente → en la hecha más reciente → plan cuyo nombre/título lleva la clave (`s3c`, si no `s3`) y el backlog o el hito → lo de hoy; `planDe` indica la sub-sesión de origen; tests
- [x] `tarjetaEnCurso`: rótulo «Falta · S3c — …» con sus casillas, «S3c 0/3» junto a la barra, «Plan (de S3): …»
- [x] Prueba con el `BACKLOG_MVP.md` real del IEP: S3c con sus 3 casillas; README

Decisiones y trampas (S14): el bloque de una sub-sesión acaba en la siguiente línea con igual o menor sangría (por eso «- Después: **S4**» no se lleva casillas); con un plan propio de la sub-sesión en `~/.claude/plans` (p. ej. `sesi-n-s3c-…`), manda sobre el de una anterior y no se rotula «(de …)»; las fichas del nombre se comparan enteras («s3» no casa con «s3c»). Para matar un servidor viejo, el último «arranque (pid …)» del log no sirve (suele ser un intento muerto por EADDRINUSE): se usa `lsof -ti tcp:PUERTO -sTCP:LISTEN`. Antes de relanzarse, el servidor suelta el puerto (`close` + `closeAllConnections`) para que el nuevo no choque.

### S15 — Mod `panel-tablero`: rutas relativas, sub-sesiones y casillas · **Opus** · fuera del repo (`~/.claude/mods/panel-tablero`, sin git)
`hooks/register.tsx`, `register.test.ts`, `types/index.d.ts` (parte B del plan). Cargar la skill `plugin-authoring`; en el `.tsx` ninguna variable puede llamarse `h`.
- [x] `focoDeSesion(mensajes, home, root)`: rutas `./`/`../…backlog*.md` y nombres sueltos `BACKLOG*.md` resueltos contra `$.session.root()`; test: prompt con ruta relativa → backlog encontrado
- [x] Clave pedida en el primer mensaje (`Sesión S3c de BACKLOG_MVP.md`) manda sobre el fallback; test → H3 › … › S3c, 0/3, 3 abiertas
- [x] `seccionDe` entiende viñetas `- **S\d+[a-z]? — …**` (rango por sangría, hito del `## H…`, título = tarea abreviada + sub-sesión, `hechas/total`, `abiertas`); fallback: primera sub-sesión con casillas abiertas; test sin pistas
- [x] Tarjeta «Esta sesión»: línea `H3 › Personas mal migradas › S3c  …` y hasta 4 casillas `[ ] …` + «… y N más»; test sin desborde a 40/120/207 col
- [x] `claude plugin test`, `plugin validate` y `tsc` limpios; resultado en `## Estado`
- [x] (añadido en S15, pedido por el usuario) Ningún texto del panel se recorta con «…»: `ajustar()` parte por palabras al ancho (respeta dobles espacios); las casillas, hasta 3 líneas cada una; la nota de la derecha de PLAN/BACKLOG baja de línea si no cabe

Decisiones y trampas (S15): un nombre suelto (`BACKLOG_MVP.md`) se resuelve primero contra una ruta ya vista en la sesión con ese nombre y, si no, contra el root (al revés que el plan: la ruta vista casi siempre es la buena); el activo salta a la siguiente candidata si no se puede leer. Orden en `seccionDe`: fragmento editado → sesión pedida → «Siguiente:/sigue **SX**» de `## Estado` → primera `###` abierta → primera viñeta abierta tras la última hecha. «Sesión/sección SX de BACKLOG…md» cuenta como pedida. No se abrió una sesión real en el IEP para ver el panel (solo test con su `BACKLOG_MVP.md` real).

## H6 — Plan en curso a la vista

Plan: `~/.claude/plans/planea-para-resolver-mi-lazy-patterson.md`. Rama `plan-en-curso` (sale de `notas-tablero`). Sesión en **Sonnet**.

### S11 — Tarjeta «En curso» · **Sonnet** · rama `plan-en-curso`
`generar.mjs`, `generar.test.mjs`, `plantilla.html`, README.
- [x] `estructura()` guarda `plan` (de «Plan: …/plans/x.md») y saca `modelo` de la etiqueta del prompt («S7 — Sonnet»); tests
- [x] `enCurso(p)` y `tarjetaEnCurso(p, compacta)`: avance por sesión, gasto de la rama, qué falta y prompt destacado con Copiar
- [x] Tarjeta arriba del Resumen y franja «En curso» en «Todos los proyectos»
- [x] Prueba por CDP con copia de `datos/` (incluida una con S10 desmarcada) y README
- [x] Responder la nota en `NOTAS_TABLERO.md` y moverla a «Respondidas»

### S12 — Servidor robusto y fuga de planes · **Sonnet** · rama `plan-en-curso`
Plan: `~/.claude/plans/pasted-content-id-9662-se-callo-harmonic-waffle.md` (secciones A y D).
- [x] `servir()`: `uncaughtException`/`unhandledRejection` registran y siguen; manejador con `.catch`; `enviar` no escribe si `headersSent`/`destroyed`
- [x] Log `datos/servidor.log` (arranque, salida por inactividad, errores; recorte ~200 KB; en `.gitignore`)
- [x] `--asegurar-servidor` desde el hook SessionStart (`arrancarServidor()` común con `abrir()`)
- [x] `leerPlanes`: cada plan al proyecto con más menciones (lo manual en `proyectos.json` manda); tests

### S13 — Frente activo en la tarjeta «En curso» · **Opus** · rama `plan-en-curso`
Plan: `~/.claude/plans/pasted-content-id-9662-se-callo-harmonic-waffle.md` (secciones B y C).
- [x] `linea` en secciones y tareas de `estructura()`; `frenteActivo(backlog, historial, planes)` puro con tests
- [x] Sub-sesiones `- **S\d+[a-z]? — …**` dentro de la tarea activa; plan por mención en la tarea o por clave del hito en el título
- [x] `enCurso`/`tarjetaEnCurso` usan `b.activo` (rama de `p.git` como respaldo); CDP: IEP → H3 › Personas mal migradas, S2 siguiente

Decisiones y trampas: «Personas mal migradas» está anidada (sangría 2) bajo «Revisión H3 en iPhone», así que `linea` va en **todas** las tareas, no solo en las de primer nivel, y se elige la tarea abierta más profunda que tenga hijas. Si la sección tocada ya está hecha pero el hito no, el frente pasa a la primera sección abierta del hito (por eso el tablero muestra S13 y no S12). Con sub-sesiones, el prompt destacado se busca **solo en el plan** (en el backlog, «S2» puede ser de otro hito); si no está, se copia el texto de la viñeta. Los segmentos de sub-sesión comparten el id de la sección: `segmentos()` marca la actual con `s.actual`.

## H5 — Notas del usuario y vista general

Plan: `~/.claude/plans/quiero-que-planes-las-compressed-duckling.md`. Rama `notas-tablero` (sale de `busqueda-favoritos`). Todas las sesiones en **Sonnet**.

### S7 — Arreglos de Resumen y proyecto persistente · **Sonnet** · rama `notas-tablero`
`generar.mjs`, `generar.test.mjs`, `plantilla.html`.
- [x] `estasAqui`: si la sección a la que apunta (con `sig` o sin él) ya está `hecho`, pasar a la siguiente no hecha; test con el Estado de `BACKLOG_H4` («S5c hecha … Siguiente: **S5c**» → S6)
- [x] `segmentos(b)` usa `aplanar(b.estructura)`: los `###` salen como subsegmentos (S2b/S5b/S5c) y el `actual` coincide con `b.aqui`
- [x] `lineaAqui` y el Mapa resaltan bien con `aqui` en un `###` (cadena H4 → S6 en IEP)
- [x] Proyecto persistente: `tablero.proyecto` (id) en `guardar()`/`leer()` y `location.hash` `#p=iep` (el hash manda); restaurar al cargar; la actualización en vivo busca por id
- [x] Responder notas 1 y 2 en `NOTAS_TABLERO.md` y moverlas a «Respondidas»

### S8 — Datos de la bitácora para los gráficos · **Sonnet** · rama `notas-tablero`
`bitacora.mjs`, `bitacora.test.mjs`, `generar.mjs`, fixtures.
- [x] Rama por sesión: `sidsPorProyecto` guarda la ruta del `.jsonl`; primer `gitBranch` no vacío en las ~50 primeras líneas; cache por sid y mtime; cada fila con `rama` (o `null`)
- [x] `agregar(registro, { por: 'dia'|'semana'|'mes'|'rama'|'modelo' })` → `[{ clave, costo, minutos, sesiones }]`; semana ISO, modelo normalizado, fechas incompletas y costos «?» excluidos y contados aparte
- [x] Tests con fixture de transcripciones (`TABLERO_TRANSCRIPCIONES`) con `gitBranch`

### S9 — Gráficos en la pestaña Bitácora · **Sonnet** · rama `notas-tablero`
`plantilla.html`, README. Cargar antes la skill `dataviz`.
- [x] Bloque «Gastos» con SVG en línea (sin librerías, funciona en `file://`) y colores del tema: costo por día/semana/mes (selector, duración en tooltip), costo por feature (rama, top 10 + «otras») y reparto por modelo
- [x] Respetan el filtro «este proyecto / todas»; cada gráfico con tabla accesible o `aria-label`
- [x] Responder la nota 3 y moverla a «Respondidas»

### S10 — Vista general de todos los proyectos · **Sonnet** · rama `notas-tablero`
`plantilla.html`, README (y `generar.mjs` solo si falta algún dato).
- [x] Opción «Todos los proyectos» primera en `#proyecto`; vista por defecto sin proyecto guardado; se recuerda con el mecanismo de S7 (`#p=todos`)
- [x] Una tarjeta por proyecto: progreso y «estás aquí», rama/cambios/PRs, notas abiertas y bitácora pendiente (enlazan a su pestaña), costo de 7 días y última actividad
- [x] Clic en la tarjeta abre el Resumen del proyecto; fila de totales globales
- [x] Prueba en navegador por CDP con una copia de `datos/` y PR de `notas-tablero`

## H4 — Búsqueda y favoritos

### S6 — Búsqueda en Planes y sesiones favoritas · **Sonnet** · rama `busqueda-favoritos` (sale de `backlog-coherencia`)
`generar.mjs`, `plantilla.html`, `servidor.test.mjs`, README. (Esta sección no existía en el backlog: se añadió al hacer la sesión, según el prompt.)
- [x] Búsqueda en Backlogs y Planes: campo que filtra sobre el DOM ya pintado (sin repintar, el foco no se pierde), abre lo que coincide y cuenta coincidencias; en Planes filtra también la lista lateral (título y contenido)
- [x] Favoritos en `datos/favoritos.json` vía `POST /api/favoritos` `{ titulo, favorito }`, clave por título de sesión (sin marcas de markdown), no por `s.id`; entra en `datos.favoritos` y en la huella de `/api/version`
- [x] Estrella en cada sesión `S…`, filtro «★ Solo favoritas» y tarjeta «Sesiones favoritas» en el Resumen
- [x] Tests en `servidor.test.mjs` (403 por Host/Origin/tipo, 400 por cuerpo inválido, alternar, idempotencia); prueba en el navegador por CDP con una copia de `datos/` (estrella, filtro, búsqueda, Planes, Resumen)
Decisión: el POST parchea la caché (`datos.favoritos`) en vez de reconstruir todo (de ~4 s a ~0,25 s).

## H1 — Ajustes visuales

### S1 — Alturas y grafo legible · **Sonnet** · rama `mejoras-ui`
Solo `plantilla.html`. Causa probable del corte: `.panel-falta` (`max-height: calc(100dvh - 40px)`) y `.gh-grafo` (`calc(100dvh - 56px)`) son `sticky` y no descuentan la barra de estado sticky (`#barra-estado`) ni el rótulo que sube `-.8em`. Confirmado: el rótulo `-.8em` quedaba cortado por el `overflow` del panel sticky; ahora baja dentro del borde. Nota: main/develop se fijan por color de su carril según el `refs` de cada commit (no se tocó `generar.mjs`).
- [x] Variable `--alto-barra` (medida con un `ResizeObserver` sobre `#barra-estado`) y `max-height` de `.panel-falta` y `.gh-grafo` = `100dvh − top − --alto-barra − margen del rótulo`; comprobar en el navegador que no se cortan (escritorio y ventana baja)
- [x] Grafo: `main`/`master` siempre en el carril 0 con color fijo (acento) y `develop` en el carril 1 con su color fijo; el resto rota la paleta (`svgGrafo`, `color(col)`)
- [x] Cabecera de carriles sobre el SVG: el nombre de cada rama en su carril y su color, para leer qué línea es cuál sin buscar la etiqueta ⎇
- [x] `badgeRama`: `main` y `develop` con estilo propio (relleno + icono); la rama actual resaltada; leyenda que liste rama → color en vez del texto genérico de `vistaGrafo`

### S2 — Barra de estado, favicon y actualización en vivo · **Sonnet** · misma rama `mejoras-ui`
`plantilla.html`, `generar.mjs`, `servidor.test.mjs`, README. PR de `mejoras-ui` al terminar.
- [x] `--estado-fondo` con colores del tema (p. ej. `--panel`/`--barra` con texto `--texto` y la rama en chip `--acento`), contraste AA en claro y oscuro; ajustar `#barra-estado :focus-visible`
- [x] Favicon SVG en línea (`<link rel="icon" href="data:image/svg+xml,…">`) con el acento del tema, en el `<head>` de `plantilla.html`
- [x] `GET /api/version`: huella barata (mtimes, sin `construir`) de backlogs, carpetas `docs`, `~/.claude/plans`, archivos de notas, `.git/HEAD` y `.git/refs` de cada repo, y la bitácora
- [x] `GET /api/datos`: devuelve `(await fresco(true)).datos`
- [x] Cliente: si `editable()`, sondear `/api/version` cada ~3 s (pausar con la pestaña oculta, sondear al volver); si cambia, pedir `/api/datos` y repintar conservando proyecto, pestaña, scroll y borradores sin guardar (no repintar con un textarea en edición). En `file://` sigue manual (el hook Stop ya regenera `index.html`)
- [x] Indicador «● en vivo» / «◌ manual» en la barra de estado
- [x] Tests de las dos rutas nuevas en `servidor.test.mjs` (Host/Origin igual que las demás)

## H2 — Bitácora en el tablero
Integrar `../BITACORA.md`: verla y completar Calidad / Seguridad / Notas de las filas `_pendiente_`.

### S3 — Núcleo de la bitácora · **Opus** · rama `bitacora`
`bitacora.mjs`, `bitacora.test.mjs`, `generar.mjs`, `servidor.test.mjs`, `fixtures/BITACORA.md`. Respetar el formato de fila de `../registrar_sesion.sh`.
- [x] `bitacora.mjs`: parsear la tabla `## Registro` (fecha, tarea, sid corto entre paréntesis, modo, modelo, duración, costo, contexto ini→fin + semáforo, calidad, seguridad, notas), `## Resumen semanal`, `## Experimentos en curso` y `## Lecciones aprendidas`. Escapar/desescapar `|`
- [x] Asociar filas a proyectos: el sid corto se busca en `~/.claude/projects/<transcripciones>/<sid>*.jsonl` de cada proyecto; las que no casan van a «sin proyecto»
- [x] Campo opcional `bitacora` por proyecto en `proyectos.json` (documentar en `proyectos.ejemplo.json` y README); los proyectos sin el campo no muestran la pestaña
- [x] `POST /api/bitacora` `{ sid, calidad, seguridad, notas, hash }`: reescribe solo esa fila, valida valores (calidad ✅/🟡/🔴, texto sin saltos de línea), 409 si el archivo cambió desde que se cargó (mismo patrón que `/api/guardar`), añade la ruta a `permitidas`
- [x] Tests con `fixtures/BITACORA.md`: parseo, asociación, edición, 409, rechazo de ruta no permitida (nunca escribir la bitácora real)

Para S4 (forma de los datos): `proyecto.bitacora` = `{ ruta, modificado, hash, registro: [{ sid, fecha, tarea, modo, modelo, duracion, minutos, costoTxt, costo, contextoTxt, contexto: { ini, fin, semaforo }, calidad, seguridad, notas, pendiente, proyecto }], semanal: { columnas, filas }, experimentos: [{ titulo, texto }], lecciones: [{ fecha, texto }] }` o `null` sin el campo. Guardar: `POST /api/bitacora` `{ ruta, sid, calidad, seguridad, notas, hash }` → `{ ok, datos }`; 409 si cambió, 400/404 con `error` legible. Filas sin sid (las antiguas) no son editables. El `proyectos.json` local ya tiene `bitacora` en los tres proyectos.

Decisiones S3: el cuerpo lleva `ruta` (además de lo del plan) y solo se acepta si es la `bitacora` de algún proyecto; calidad debe *empezar* por ✅/🟡/🔴 (admite texto detrás, como la fila antigua «✅ CI verde (PR #12)»); seguridad obligatoria; notas vacías conservan la razón del hook. Variable `TABLERO_TRANSCRIPCIONES` para los tests.
Trampas: los tests del servidor comprueban que `datos` no contenga «token», así que el fixture no puede usar esa palabra en minúscula. `metodologia-claude/` no es repo git: para revisar el diff de `BITACORA.md` en S4, copia el archivo antes y usa `diff`.

### S4 — Pestaña Bitácora · **Sonnet** · misma rama `bitacora`
`plantilla.html`, README. PR de `bitacora` al terminar.
- [x] Pestaña «Bitácora» por proyecto: totales (sesiones, costo, duración, % sesiones 🔴), tabla de filas con filtro «este proyecto / todas» y «solo pendientes», resumen semanal y lecciones (solo lectura)
- [x] Filas `_pendiente_` editables: selector de Calidad, campo Seguridad y Notas, botón Guardar → `POST /api/bitacora`; manejar 409 con aviso y recarga
- [x] En la barra de estado: «✎ N filas de bitácora pendientes» que abre la pestaña
- [x] Probar en el navegador completando una fila real y verificar el diff de `BITACORA.md` (CDP sobre una copia: diff de una sola línea; el usuario confirmó la pestaña y el guardado en el tablero real)

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
