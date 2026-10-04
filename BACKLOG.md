# Backlog — Tablero de proyectos

## Estado
- 2026-10-04 · rama `integraciones-vista` · S39 hecha, tests en verde (170 pasan, 2 omitidos): `generar.mjs` exporta `participar()` (validación + PATCH + parche de `externo-<p>.json`, compartida por los endpoints y el CLI), `textoTareas`, `lineasIntegraciones`; CLI `--tareas <p> [--sin-asignar|--mias] [--integracion]`, `--asignarme <p> <id> [--quitar]`, `--estado <p> <id> <estado>` (solo `participar`); el hook de inicio añade «N sin asignar, M mías abiertas». Tests nuevos en `tareas.test.mjs` (fetch simulado por `--import`; fallaron 4 antes). README «Pedírselo a Claude». Siguiente: **S40** (cierre, con el usuario; incluye la prueba en navegador pendiente de S38).
- Para retomar (2026-10-04): Ya puedes pedirle a Claude desde la terminal que liste las tareas de Azure (todas, sin asignar o las tuyas), que te asigne una o te la quite, y que cambie su estado; solo funciona en modo «participar» y siempre confirma con el título. Al abrir una sesión en el proyecto, el aviso inicial dice cuántas tareas hay sin asignar. Todo probado con Azure simulado; falta la revisión final contigo con la organización real y el navegador. No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · S38 hecha salvo la prueba en navegador, tests en verde (165 pasan, 2 omitidos; `node --check` del script de la plantilla OK). `plantilla.html`: selector «Modo» con `participar` (solo Azure) y una frase por modo; `cfgLimpia` manda `modo: participar` sin `backlog`/`auto`; `noEscribe(modo)`; `itemExterno(x, integ, pid)` y «Mis tareas» con `controlesParticipar` (Asignarme/Quitarme, `<select data-estado-item>` con `columnas`, «✓ Terminé» solo en Mis tareas), confirmación en línea (`pendItem`, `confirmarItem` → `/api/integraciones/asignar|estado`, repinta con `r.datos`), `detalleItem` («ver descripción» con prioridad/iteración/padre), `title` de ayuda en lectura. Test de plantilla escrito primero (falló 1); se actualizó la marca de `servidor.test.mjs` que buscaba `modo: lectura ? …` (línea reescrita). Decisión: «✓ Terminé» usa `estadoHecho(integ)` = primer estado de `columnas` que tenga algún ítem `hecha` (no `cfg.columnas.hecho[0]`). NO probado en navegador (casilla CDP abierta → S40). Siguiente: **S39** (Sonnet).
- Para retomar (2026-10-04): Ya están los botones en pantalla: en una integración de Azure en modo «participar» puedes asignarte o quitarte un ítem, cambiarle el estado con un menú, marcarlo como terminado desde «Mis tareas» y ver su descripción; antes de enviar siempre pide confirmación. Está probado solo con las pruebas automáticas, no abriendo el navegador con una organización real. Lo siguiente es poder pedírselo a Claude desde la terminal (listar tareas, asignarte, cambiar estado). No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · S37b hecha, tests en verde (164 pasan, 2 omitidos; los 7 de S37 pasan sin tocar los tests). `azure-devops.mjs`: `leer` trae `descripcion` (`textoDeHtml`, ≤ 600 con «…»), `prioridad`, `iteracion`, `padre`; `quienSoy` (connectionData de la organización, `api-version=7.1-preview` vía nueva opción `version` de `api()`, **sin verificar con la org real → S40**), `asignar`, `cambiarEstado` (valida contra `columnas` o `wit/workitemtypes` antes del PATCH); `traducirError` 400 → «Azure DevOps rechazó el cambio: <message>». `config.mjs`: modo `participar` (solo `azure-devops`), `noEscribeMd`. `generar.mjs`: `esLectura = noEscribeMd`, `SOLO_PARTICIPAR` en `sincronizar()`, `base.modo = cfg.modo || 'sincronizar'`, items con los 4 campos nuevos, adaptador de `contextoIntegracion` en participar con `asignar`/`cambiarEstado`/`quienSoy`; endpoints `POST /api/integraciones/asignar` y `/estado` (parchean el ítem en `externo-<p>.json` y en `c.datos` tras `fresco()` sin forzar; `yo` cacheado 1 h). README + ejemplo `equipo` en `proyectos.ejemplo.json`. Trampa para S38: `/estado` solo acepta estados de las `columnas` leídas en caché; «✓ Terminé» debe elegir el primer estado de `columnas` que sea «hecho» (`hecha`), no `cfg.columnas.hecho[0]` a ciegas (puede no existir en ese proceso, p. ej. `Closed`). Siguiente: **S38** (Sonnet).
- Para retomar (2026-10-04): El servidor ya sabe asignarte un ítem de Azure, quitártelo y cambiarle el estado, en un modo nuevo llamado «participar» que nunca crea nada ni toca tus archivos; también trae la descripción, prioridad y sprint de cada ítem. Todo está probado con Azure simulado, no con tu organización real. Lo que falta es ponerle los botones en la pantalla («Asignarme», cambiar estado, ver descripción), y luego poder pedírselo a Claude desde la terminal.
- 2026-10-04 · rama `integraciones-vista` · S37 a medias (relevo por contexto): solo tests escritos, fallan 7 a propósito (157 pasan, 2 omitidos): 5 en `azure-devops.test.mjs` (campos de `leer` + aserción `fields` actualizada, `quienSoy`, `asignar`, `cambiarEstado`), 1 en `config.test.mjs` (`participar`, `noEscribeMd`), 1 en `servidor.test.mjs` («participar (S37)…», con `adoFalso` ampliado: `quienSoy`/`asignar`/`cambiarEstado` registran en `participaciones`; id `999` simula rechazo). Fixture `azure-devops.json` con `yo` (connectionData), `asignado` y campos nuevos en el ítem 101. Sin código. Contrato detallado en S37b. Siguiente: **S37b** (Opus).
- Para retomar (2026-10-04): Empecé lo de asignarte tareas y cambiarles el estado en Azure desde el tablero. Por ahora solo quedaron escritas las pruebas que dicen cómo debe comportarse (el nuevo modo «participar», asignarme, quitarme, cambiar estado y nunca crear nada ni tocar los archivos); fallan a propósito porque falta el código. Lo siguiente es escribir ese código hasta que pasen. Fuera de esas pruebas nuevas, nada está roto.
- 2026-10-04 · rama `integraciones-vista` · S36 hecha, tests en verde (158 pasan, 2 omitidos): botón «Elegir…» junto a `repo`/`docs`/`notas`/`bitacora` en Nuevo y Editar proyecto (`selectorCarpeta`, `abrirSelector`, `elegirCarpeta`, `CAMPOS_CARPETA` en `plantilla.html`): pestañas «Recientes de Claude» (`/api/carpetas` con `{}`, caché `recientes`) y «Explorar» (subir, filtro local, «Elegir esta carpeta»), flechas/Esc, filas de 44 px en móvil. Al elegir `repo` en Nuevo rellena `id`/`nombre`/`docs` solo si están vacíos y muestra casillas de `docs` candidatas; `notas` = carpeta + `NOTAS_<ID>.md`, `bitacora` = carpeta + `BITACORA.md`. Probado por CDP contra el servidor real (Nuevo → sugerencia → campos → Explorar → vista previa; sin escribir). Test escrito primero (falló 1). Falta probar a mano Editar y los botones de `docs`/`notas`/`bitacora`. Siguiente: **S40** (cierre) tras H11–H14 pendientes (S37–S39).
- Para retomar (2026-10-04): En el formulario de Nuevo y Editar proyecto ya hay un botón «Elegir…» junto a cada carpeta: muestra tus proyectos recientes de Claude o te deja navegar por tus carpetas, y al elegir el repo rellena solo nombre y documentos. Lo probé en el navegador para crear un proyecto hasta la vista previa; falta probar a mano Editar. No hay nada roto; lo siguiente es lo de asignarme tareas en Azure (S37).
- 2026-10-04 · rama `integraciones-vista` · S35 hecha, tests en verde (157 pasan, 2 omitidos): `listarCarpetas(ruta, home)` (solo subcarpetas, sin ocultas/`node_modules`/enlaces; fuera de home por ruta léxica o `realpath` → 400; tope 200 con `aviso`), `sugerirProyectos(dir, proyectos, { home, tope })` (`cwd` de las primeras ~20 líneas de cada `.jsonl`, caché ruta+mtime+size; excluye `repo` exactos y carpetas `transcripciones` ya configuradas, home, fuera de home y carpetas borradas; una subcarpeta suma en su madre solo si esta es repo git), `propuestaProyecto(ruta, existentes, home)` (id sin acentos, sufijo `-2`; `docs` entre `docs`/`documentacion`/`.tablero`, si no el repo; `notas` = `NOTAS_<ID>.md`; rutas con `~`), `proyectoNuevo` con `docs = [repo]` e id propuesto, `POST /api/carpetas` `{ ruta? }` → `{ ok, home, ruta, padre, carpetas, aviso?, sugerencias | propuesta }` (solo local, con Origin). `TABLERO_HOME` cambia la raíz (tests). Con datos reales: 11 sugerencias en 9–20 ms. Tests escritos primero (fallaron 5). README «Elegir carpeta». Para S36: la vista llama `/api/carpetas` con `{}` al abrir (sugerencias) y con `{ ruta }` al navegar/elegir (trae `propuesta`; en home `propuesta: null`); acortar rutas con `home`. Siguiente: **S36** (Sonnet).
- Para retomar (2026-10-04): El servidor ya sabe listar tus carpetas (sin salir nunca de tu carpeta personal ni mostrar archivos) y sugerir como proyectos nuevos las carpetas donde abriste Claude hace poco, proponiendo nombre, carpeta de documentos y archivo de notas. Todavía no se ve en pantalla: lo siguiente es el botón «Elegir…» en el formulario de Nuevo/Editar proyecto. No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · S34 hecha, tests en verde (152 pasan, 2 omitidos): pestaña «Tablero» en `plantilla.html` (`vistaKanban`, tras Resumen; chip «▦ Tablero» en «Todos»): 4 columnas con contador, tarjetas de `P.kanban` + ítems de integraciones (borde azul, solo lectura; H14 aún no existe), filtros hito/backlog/«ver movidas», franja «Claude está trabajando…» desde `/api/sesiones` (sondeo propio cada 5 s, solo en la pestaña y con la página visible), mover por arrastre o `<select data-mover>` → `[ ]`/`[~]`/`[x]` vía `/api/guardar` con `previo` (optimista, 409 avisa), «En prueba» no se mueve a mano. Mobile: scroll horizontal con `scroll-snap`. Test escrito primero (falló 1). Verificado en Chrome headless (1200 y 390 px, datos reales, 0 errores); mover por arrastre/menú y el 409 NO se probaron en navegador. Trampa: con datos reales «En prueba» sale con 158 tarjetas porque la rama `integraciones-vista` está sin fusionar y los hitos la declaran (semántica de S33b, no error). Siguiente: **S35** (Opus).
- Para retomar (2026-10-04): Ya existe la pestaña Tablero: ves tu backlog en cuatro columnas, con una franja que dice si Claude está trabajando ahora y en qué, y puedes mover tarjetas arrastrándolas o con un menú, lo que reescribe la casilla en el archivo. Falta probar a mano el movimiento de tarjetas en el navegador. Lo siguiente es lo de crear proyectos sin pegar rutas (el servidor que lista carpetas). No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · S33b hecha, tests en verde (151 pasan, 2 omitidos): `estructura` con `[~]` (pendiente, `marca: '~'`) y `[-]` (movida, fuera de conteos; `frenteActivo` la ignora); `sesionesActivas` (cabeza+cola 64 KB, caché ruta+mtime+size; con datos reales: 107 ms en frío, 1 ms con caché); `columnasKanban` (rama del hito leída del texto crudo bajo el título, porque `descripcion` pasa por `plano` y pierde los backticks); `sinFusionar` en `leerGit` (`origin/HEAD` o `main`); `p.kanban` y `datos.sesiones` (sesiones calculadas una vez en `construir` y pasadas a `recolectar` por `opciones.sesiones`); `GET /api/sesiones` sin `construir` (usa `cache?.datos`) y fuera de la huella. README «Tablero (kanban)». Trampa: el test «/api/sesiones…» dependía de que «Uno» siguiera abierta, pero un test anterior la marca `[x]` → el test ahora la reabre. Siguiente: **S34** (Sonnet).
- Para retomar (2026-10-04): Quedó listo el servidor del tablero tipo kanban: ya sabe qué sesiones de Claude están trabajando ahora mismo en cada proyecto y en qué columna va cada tarea (por hacer, en curso, en prueba o hecha), y lo hace leyendo muy poco para poder preguntarlo cada pocos segundos. Todavía no se ve en pantalla: lo siguiente es dibujar la pestaña Tablero con sus columnas y poder mover las tarjetas. No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · S33 a medias (relevo por contexto): solo tests escritos — 4 en `generar.test.mjs` (`sesionesActivas` ×2, `estructura` con `[~]`/`[-]`, `columnasKanban`) y 1 en `servidor.test.mjs` (`/api/sesiones`), con fixtures `fixtures/transcripciones/-Users-x-kanban{,-web,Otro}/`; fallan los 5 a propósito, el resto en verde. Sin código en `generar.mjs`. Contrato detallado en S33. Trampa: las 3 primeras líneas de un `.jsonl` real son `custom-title`/`mode`/`file-history-snapshot`, sin `timestamp` ni prompt → leer cabeza más larga. Siguiente: **S33b** (Opus).
- Para retomar (2026-10-04): Empecé el servidor del tablero tipo kanban, el que cuenta qué está haciendo Claude en cada momento y en qué columna va cada tarea. Por ahora solo quedaron escritas las pruebas que dicen cómo debe comportarse; fallan a propósito porque falta el código. Lo siguiente es escribir ese código hasta que pasen. Fuera de esas pruebas nuevas, nada está roto.
- 2026-10-04 · rama `integraciones-vista` · S32 hecha, tests en verde (146 pasan, 2 omitidos): `plantilla.html` con `tarjetaRetomar(p, compacta)` (al inicio del Resumen, `data-retomar`; compacta en «Todos» para el proyecto más reciente; plegable con `<details>`, abierta salvo `diasSinActividad < 2`, preferencia en `localStorage` `tablero.retomar.<id>` vía listener `toggle`; botones «Copiar prompt de la siguiente sesión» y «Ver en backlog»; «Detalle técnico»), `queSeBusca` en `tarjetaEnCurso` (`hito.historia || descripcion || plan.contexto`; compacta = primera frase) y `estadoSinRetomar` para que `estadoResumido` salte la viñeta. Test escrito primero (falló 1). Verificado en Chrome headless con datos reales. Siguiente: **S33** (Opus).
- Para retomar (2026-10-04): Ya se ve en pantalla la tarjeta «Para retomar», con el resumen que se deja al cerrar cada sesión y los hechos en frases, y el bloque «Qué se busca» dentro de «En curso». Con eso queda completo lo de retomar en lenguaje natural. Lo siguiente es la pestaña Tablero tipo kanban: primero el servidor que cuenta qué está haciendo Claude en cada momento. No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · S31 hecha, tests en verde (145 pasan, 2 omitidos): `estructura()` da `historia` (`Historia:|Objetivo:|Para qué:`, también en viñeta/negrita) y `descripcion` (primer párrafo corrido bajo el título, ≤ 600); `contextoDePlan` → `plan.contexto`; `retomarDe(estado)` → `b.retomar` `{fecha, texto}` (la más reciente; líneas sangradas se unen); `hechosRetomar` → `p.retomar` (`ultimaActividad`, `diasSinActividad`, `rama`, `siguiente {clave,titulo}`, `pendientesSiguiente`, `ultimoCommit`, `prsAbiertos`, `commitsSinSubir`, `ultimaSesionClaude {titulo, fecha}`); `estasAqui` salta la viñeta «Para retomar»; `plantillaBacklog` trae ambas convenciones; skill `relevo` (fuera del repo) y README actualizados. Tests escritos primero (fallaron 6 de 6). Trampa para S32: `estadoResumido` en `plantilla.html` aún toma la primera línea del Estado (casilla añadida). Siguiente: **S32** (Sonnet).
- Para retomar (2026-10-04): El tablero ya sabe leer el resumen en lenguaje natural que se deja al cerrar cada sesión y la historia de cada hito («Como…, quiero…, para…»), y calcula solo cuánto hace que no se toca el proyecto, en qué rama estabas, qué sigue y cómo se llamó la última conversación con Claude. Todavía no se ve nada nuevo en pantalla: lo siguiente es pintar la tarjeta «Para retomar» y el bloque «Qué se busca» en la vista. No hay nada roto.
- 2026-10-04 · rama `integraciones-vista` · H11–H14 planeados (plan `~/.claude/plans/quiero-que-planes-las-woolly-globe.md`, Fable), sin código: cinco notas de `NOTAS_TABLERO.md` → H11 retomar en lenguaje natural + «Qué se busca» (S31 Opus, S32 Sonnet), H12 pestaña «Tablero» kanban en vivo con `/api/sesiones` y tarjetas que el usuario mueve (S33 Opus, S34 Sonnet), H13 elegir carpeta sin pegar rutas (S35 Opus, S36 Sonnet), H14 `modo: 'participar'` en Azure: asignarme, cambiar estado y CLI para Claude (S37 Opus, S38–S39 Sonnet), S40 cierre. Los cambios sin commit de «＋ Otro backlog» (`archivoDeNombre`, campo nombre, aviso `sesion-sin-casillas`) se intentan commitear en este relevo; si no, S31 paso 0. Siguiente: **S31** (Opus).
- 2026-10-04 · rama `integraciones-vista` · ajuste tras S25 (pedido del usuario, 139 pasan): tarjeta «Azure DevOps · avance» en el Resumen de cualquier proyecto con integración conectada (`avanceIntegracion`: barra de terminados, por estado, por tipo, cerrados por semana según `actualizado`, botón «Mis tareas») y botón fijo «Mis tareas N» en la cabecera (`#ir-mias`, `data-ir-mias`); `datos.integraciones[].items` ahora lleva `actualizado`. Verificado en Chrome headless con EAP10 real: 164 de 204 terminados; los 37 ítems míos están todos cerrados → «Mis tareas» sale con 0 abiertas (correcto).
- 2026-10-04 · rama `integraciones-vista` · S25 hecha, tests en verde (138 pasan, 2 omitidos): `POST /api/integraciones/importar` `{proyecto, integracion, soloMias?, archivo?, carpeta?, previa?}` (`importarBacklog` en `generar.mjs`; solo integraciones de solo lectura; `BACKLOG_<ID>.md` en la primera `docs`, `## estado` › `### tipo`, marcas `<!-- ado:ID -->`, título intacto; 409 si existe, 400 sin `docs`; respuesta con `total`/`tipos`) y botón «Crear backlog local desde Azure» en la tarjeta de la integración (panel `#panel-crear` con `tipo: 'importar'`, casilla «solo las asignadas a mí»); al crear abre el formulario de la integración en `sincronizar` con ese backlog y los tipos importados (queda pulsar Guardar). Tests escritos primero (fallaron 1+1). Verificado con la org real solo en vista previa (204 ítems, 37 míos; no se creó ningún archivo). Servidor reiniciado con el código nuevo. Siguiente: **S24b** (tests/PR, Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H10.
- 2026-10-04 · rama `integraciones-vista` · S30 hecha, tests en verde (136 pasan, 2 omitidos): vista «Mis tareas» (`#p=mias`, flag `mias` junto a `todos`; opción en el selector; `vistaMias`, `asignadasAMi`, `totalAsignadas` en `plantilla.html`): ítems `mio` no hechos (`!x.hecha`) por proyecto → integración → estado, aviso si una integración no trae `mio`, «Siguientes pasos» con `enCurso(p).falta` + prompt copiable, y contador «N asignadas a mí» en «Todos». Test de plantilla escrito primero (falló 1). Verificado en Chrome headless con datos de prueba y con los reales (sin ítems `mio` en caché). Sin cambios en `generar.mjs`. Siguiente: **S25** (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H10.
- 2026-10-04 · rama `integraciones-vista` · EAP10 configurado desde la vista (sin cambios de código): `proyectos.json` (ignorado por git) con `repo`, `docs` = [`.tablero`, `documentacion`], `notas` en `.tablero/NOTAS_EAP10.md` y `bitacora` compartida; `.tablero/` ignorada con `.git/info/exclude` del repo (local, no sale) y `.tablero/BACKLOG.md` creado desde el servidor. Siguiente: **S30** (Sonnet), luego S25 (puede apuntar a `.tablero/`). Los cambios sin commit de `coherencia*.mjs` no son de H10.
- 2026-10-04 · rama `integraciones-vista` · S29 hecha, tests en verde (135 pasan, 2 omitidos): «Editar proyecto» (botón en el Resumen; reutiliza `#panel-crear` con `tipo: 'editar'`, precarga de `P.editable`, vista previa y guardado con `mtime`), tarjeta «⚙ Configurar este proyecto» con acción por paso (comandos copiables para git/GitHub/`claude`) y «Ocultar guía» por proyecto, chip «⚙ N de M pasos» en «Todos». Verificado en Chrome headless con un proyecto vacío. Siguiente: **S30** (Sonnet), luego S25. Los cambios sin commit de `coherencia*.mjs` no son de H10.
- 2026-10-04 · rama `integraciones-vista` · S28 hecha, tests en verde (134 pasan, 0 fallan): `editarProyecto` en `integraciones/config.mjs` (solo `CAMPOS_PROYECTO`, en su sitio; integraciones, `planes`, `~`, orden y campos ajenos intactos; `''` quita salvo `nombre`), `POST /api/proyectos/editar` `{id, cambios, mtime, previa?}` (404/400/409, previa devuelve `proyecto` = bloque resultante), `validarCarpeta`/`validarArchivo`/`cambiosProyecto`/`transcripcionesDe` en `generar.mjs` (crear rellena `transcripciones` con `repo`; editar solo si falta), `p.configuracion` (`estadoConfiguracion`: repo, git, github, docs, backlog, sesiones, notas, integraciones) y `p.editable` (campos crudos con `~` para precargar). README documentado. Para S29: el formulario de editar manda solo los campos cambiados (`''` = quitar) y precarga desde `p.editable`; los `paso` de `p.configuracion` son esos 8 nombres. Trampa: el test de crear proyecto ahora espera `transcripciones`. Siguiente: **S29** (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H10.
- 2026-10-04 · rama `integraciones-vista` · H10 planeado (plan `~/.claude/plans/no-se-si-hay-streamed-lighthouse.md`), sin código: el usuario confirmó un solo equipo en EAP10 (S24b, sin `areaPath`) y pidió crear backlog en EAP10 (hoy imposible: sin `docs` y sin «Editar proyecto»), vista «Mis tareas», importar Azure a `.md` (S25) y guía de configuración de proyectos nuevos. Siguiente: **S28** (Opus), luego S29, S30 y S25 (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H10.
- 2026-10-04 · rama `integraciones-vista` · S27 hecha, tests en verde (130 pasan, 2 omitidos): `plantilla.html` con botón «＋ Nuevo proyecto» en la cabecera (solo con servidor) y panel `#panel-crear` (`crear`, `abrirCrear`, `enviarCrear`): formulario → vista previa (`previa: true`) → crear con `mtime: DATOS.configMtime`; tras crear abre el proyecto en Backlogs. «Crear backlog» en la pestaña Backlogs vacía y en el paso «Modo y backlog» (sin backlogs, modo sincronizar); al crear deja `cfg.backlog` puesto y el formulario de integración abierto. Verificado en Chrome headless por CDP con servidor y datos de prueba (id duplicado, previa sin escribir, crear proyecto → backlog → preselección). Trampa: en CDP, navegar solo con otro `#hash` no recarga la página (mtime viejo → 409); usar `?r=<ts>`. No se probó el flujo completo hasta guardar integración sincronizar (requiere credencial/red). Siguiente: **S24b** (Sonnet): tests/PR y opcional S25. Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S26 hecha, tests en verde (129 pasan, 2 omitidos): `POST /api/proyectos/crear` `{id, nombre, repo?, docs?, mtime, previa?}` (`proyectoNuevo` en `generar.mjs` valida id `[a-z0-9-]` único y carpetas existentes absolutas o con `~`, se guardan tal como se escribieron; `anadirProyecto` en `integraciones/config.mjs` añade al final sin tocar el resto; 409 si cambió el `mtime`, 400 sin `mtime`) y `POST /api/backlog/crear` `{proyecto, archivo?, carpeta?, previa?}` (`rutaBacklogNuevo` + `plantillaBacklog`: por defecto `BACKLOG.md` en la primera `docs`, `carpeta` debe ser una de las `docs`, nombre simple que cumpla `patronBacklogs`, escritura con `flag: 'wx'` → nunca sobrescribe, 409). Ambos solo desde 127.0.0.1; la respuesta trae `datos` frescos para repintar. README documentado. Para S27: la vista manda `mtime: datos.configMtime` al crear proyecto y usa `previa: true` para la vista previa; tras crear backlog, `r.archivo` es el que hay que preseleccionar. Siguiente: **S27** (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S24 a medias: EAP10 añadido a `proyectos.json` (ignorado por git; el PAT ya estaba) y `--probar-conexiones` OK con la org real (204 ítems, 13 columnas, solo lectura). El usuario probó en navegador pero no dio resultados → resto pasa a **S24b**. Después el usuario confirmó que todo funciona y pidió crear proyectos y backlogs desde la vista → **S26** (Opus, servidor) y **S27** (Sonnet, vista); S24b queda solo con tests/PR y el opcional. Sin cambios de código; tests no corridos. Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S23 hecha, tests en verde (127 pasan, 2 omitidos): vista con selector «Modo» (solo lectura preseleccionado sin backlogs), paso 4 «Modo y backlog», `auto` oculto en lectura, tipo de work item como casillas (+ «Todos» solo en lectura), tarjeta con chip de asignado/«Sin asignar», insignia de tipo, filtro Todas/Mías/Sin asignar (estado en `filtroInteg`, sobrevive al repintado; «Mías» desactivado si falta `mio`), sin «Sincronizar» ni «auto» en lectura, `cfgLimpia` manda `modo`, y la primera sincronía deja crear/traer sin marcar con aviso. Verificado en Chrome headless por CDP con servidor de prueba. Siguiente: **S24** (Sonnet, con el usuario). Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S22 hecha, tests en verde (126 pasan, 2 omitidos): `modo` (`sincronizar`|`lectura`) en `COMUNES` (exportado; `configVisible` lo usa), en lectura `backlog` opcional y `auto: true` rechazado; `contextoIntegracion` sin backlog y adaptador solo con `leer`; `sincronizar()` → 400 «solo lectura» (previa y aplicar); `/probar` y `--probar-conexiones` sin backlog (`vinculadas: 0`); primera sincronía (sin `datos/sync-…`): previa con `primera` y `conteo`, `auto` no aplica nada; ítems con `tipo/asignado/mio`; proyecto sin `docs`/`repo` genera; README y `proyectos.ejemplo.json` con `modo`, `tipoItem` lista y ejemplo EAP10. Trampa: el `get()` de `servidor.test.mjs` parsea JSON, para el HTML usar `fetch`. Siguiente: **S23** (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S21 hecha, tests en verde (123 pasan, 2 omitidos): `leer` con `tipoItem` texto/lista/`'*'` (WIQL `IN`, orden por fecha, tope 500 con aviso, lotes de 200 en paralelo máx. 4), ítems con `tipo`, `asignado` y `mio` (segunda WIQL `@Me`, aviso si falla), estados por unión con una sola llamada a `wit/workitemtypes`; `crear` usa el primer tipo; `config.mjs` valida `tipoItem` y rechaza `'*'` salvo `modo: 'lectura'` (S22 añade `modo`). Siguiente: **S22** (Opus). Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S20 hecha, tests en verde (118 pasan, 2 omitidos): `normalizarOrganizacion` exportada en `azure-devops.mjs` (nombre, URLs dev.azure.com / visualstudio.com, usuario@, proyecto decodificado), usada en `api()`, `urlItem` y `leer` con `encodeURIComponent`; `validarIntegracion` guarda solo el nombre y rellena `proyecto` desde la URL sin pisar el escrito; `/descubrir` y `/probar` devuelven `organizacion`; la vista reemplaza el campo. Después se arregló que «Buscar proyectos» quedaba deshabilitado al pegar la organización (`asignarFi` ahora lo habilita; commit 2e71e8b, sin verificar en navegador). Falta solo la casilla **del usuario** (probar con la org real y confirmar que el botón se activa). Siguiente: **S21** (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · H9 planeado (S20–S25, plan `~/.claude/plans/generic-cuddling-hellman.md`) y revisado por Opus (`~/.claude/plans/quiero-que-revises-el-logical-wave.md`): añadidas casillas para `modo` que se perdía al editar, `/probar` sin backlog, `auto` en primera sincronía, `crear()` con varios tipos, estados en una llamada, orden por fecha y `areaPath`. Casillas de S19b pasadas a S24. Sin código. Siguiente: **S20** (Sonnet). Los cambios sin commit de `coherencia*.mjs` no son de H9.
- 2026-10-04 · rama `integraciones-vista` · S19 hecha en código (commit 1119f1a; 114 tests pasan, 2 omitidos); falta confirmar la causa con la org real y probar en navegador → **S19b**. Antes: S18 hecha (formulario por pasos, Editar/Quitar, README; 112 tests pasan, 2 omitidos; prueba real en navegador con Trello simulado). H8 completo: PR #9 abierto contra `develop`; falta la revisión del usuario y fusionarlo. Antes: S17 hecha, tests en verde (112 pasan, 2 omitidos): `listar()` en GitHub/Trello/ADO (solo lectura, reutilizan `api`/`gql` y `traducirError`) y `POST /api/integraciones/descubrir` (`{tipo, clave?, consulta}`; 400 sin credencial, 502 con error traducido, 15 s). Todo con `fetch`/`gh` simulados, nada de red real. Los cambios sin commit de `coherencia*.mjs` no son de H8. Siguiente: **S19** (Sonnet, arreglar «Buscar proyectos» de Azure DevOps que se queda cargando).
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

## H11 — Retomar en lenguaje natural y «Qué se busca»

Plan: `~/.claude/plans/quiero-que-planes-las-woolly-globe.md` (todo H11–H14 y S40). Rama `integraciones-vista`. Notas 1 y 3 de `NOTAS_TABLERO.md`. Decisión: el texto natural lo escribe quien cierra la sesión (skill `/relevo`) como viñeta `- Para retomar (fecha): …` en `## Estado`; el tablero lo muestra con hechos automáticos en frases. Historia del hito: línea `Historia:|Objetivo:|Para qué:`, si no el primer párrafo bajo el título, si no `## Context` del plan.
Historia: Como desarrollador que vuelve tras días sin tocar un proyecto, quiero leer en dos párrafos qué estaba haciendo y qué sigue, para retomar sin descifrar claves ni commits.

### S31 — Datos para retomar y la historia · **Opus** · `generar.mjs`, `generar.test.mjs`, `fixtures/`, `README.md`, skill `relevo`
- [x] Paso 0: `node --test 2>&1 | tail -20`; si quedan cambios sin commit de «Otro backlog», commitearlos; confirmar que H11–H14 están en este backlog
- [x] **Tests primero** (`generar.test.mjs`, ver fallar y anotar cuántos): `estructura()` da `descripcion` (primer párrafo) e `historia` (`Historia:|Objetivo:|Para qué:` gana); `retomarDe(estadoTxt)` → `{ fecha, texto }` de la viñeta más reciente o `null`; `hechosRetomar(p, b)` → `ultimaActividad`, `diasSinActividad`, `rama`, `siguiente`, `pendientesSiguiente`, `ultimoCommit`, `prsAbiertos`, `ultimaSesionClaude` (`customTitle` + fecha del `.jsonl` más reciente, leyendo solo las primeras ~20 líneas) con fixture — 6 tests nuevos, fallaron los 6; fixture `fixtures/transcripciones/`; además `commitsSinSubir` y `estasAqui` ignora «Para retomar» (añadido en S31)
- [x] `estructura()`: `descripcion` (texto plano ≤ 600, sin casillas/listas/tablas) e `historia`; `cerrarSeccion` las conserva
- [x] `leerPlanes`: `contexto` = primer párrafo bajo `## Context|Contexto` (≤ 600)
- [x] `recolectar`: `b.retomar = retomarDe(b.estado)` y `p.retomar = hechosRetomar(p, principal)`
- [x] `plantillaBacklog`: añade `- Para retomar (fecha): …` en `## Estado` y `Historia: …` en `## S1`
- [x] Skill `~/.claude/skills/relevo/SKILL.md` (fuera del repo), paso 2: «**Para retomar:** viñeta `- Para retomar (fecha): …` con 2–4 frases en lenguaje natural, sin claves, commits ni conteos: qué estabas haciendo, qué quedó listo, por dónde seguir, si hay algo roto»; «si el hito nuevo no tiene `Historia:`, añádela»
- [x] README (convenciones `Para retomar` e `Historia:`), `node --test 2>&1 | tail -40`, commit

Prompt de arranque S31 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S31) y trabaja solo esa sesión en la rama `integraciones-vista`. Paso 0: tests y commit de los cambios pendientes. Escribe primero los tests de `generar.test.mjs` y míralos fallar. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S32 — Tarjeta «Para retomar» y «Qué se busca» en «En curso» · **Sonnet** · `plantilla.html`, `servidor.test.mjs`
- [x] **Test primero** en `servidor.test.mjs` (plantilla trae `tarjetaRetomar`, «Para retomar», «Qué se busca», `data-retomar`); ver fallar
- [x] `tarjetaRetomar(p)` al inicio del Resumen (antes de la guía y de «En curso») y compacta en «Todos» para el proyecto más reciente: «Para retomar · hace N días»; párrafo 1 = `b.retomar.texto` (si falta: «Nadie dejó un resumen al cerrar la última sesión; esto es lo que se ve:»); párrafo 2 = hechos en frases («La última vez trabajaste el <fecha> en la rama X; la última sesión de Claude se llamó “…”. Lo siguiente es “<sub-sesión siguiente>” con N pasos pendientes. Hay M PR abiertos / N commits sin subir.»); claves solo entre paréntesis al final
- [x] Botones «Copiar prompt de la siguiente sesión» (reutiliza `destacado`) y «Ver en backlog»; plegable «Detalle técnico» con el `Estado` actual
- [x] Plegada si `diasSinActividad < 2`; preferencia por proyecto en `localStorage` (try/catch)
- [x] `tarjetaEnCurso`: bloque «Qué se busca» con `hito.historia || hito.descripcion || plan.contexto` (≤ 3 líneas, «más» si recorta); en la compacta solo la primera frase
- [x] `estadoResumido` (plantilla.html:631) toma la primera línea no vacía del Estado: que salte la viñeta «Para retomar» y sus líneas sangradas (igual que `estasAqui`) (añadido en S31)
- [x] Mobile sin tablas ni chips largos. Chrome headless con `datos/` de prueba (con/sin `Para retomar`, con/sin `Historia:`), `node --test 2>&1 | tail -40`, commit

Prompt de arranque S32 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S32) y trabaja solo esa sesión en la rama `integraciones-vista`. Test de plantilla primero. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

## H12 — Pestaña «Tablero»: kanban en vivo

Nota 2. Tarjetas = casillas de primer nivel del backlog (+ ítems de integraciones), 4 columnas: **Por hacer** · **En curso** (Claude toca esa sección ahora, o `[~]`) · **En prueba** (hecha y su rama tiene PR abierto o commits sin fusionar) · **Hecho**. La actividad de Claude **no entra en la huella** de `/api/version`: la vista sondea aparte `GET /api/sesiones` cada 5 s (solo colas de `.jsonl` recientes). El usuario mueve tarjetas y eso escribe `[ ]`/`[~]`/`[x]` en el `.md`.
Historia: Como desarrollador, quiero ver mi backlog como un tablero que se mueve solo con lo que Claude y git van haciendo, y poder mover yo las tarjetas, para saber de un vistazo qué está en marcha, qué se prueba y qué falta.

### S33 — `/api/sesiones` y columnas del kanban (servidor) · **Opus** · `generar.mjs`, `generar.test.mjs`, `servidor.test.mjs`, `fixtures/transcripciones/`, `README.md`
- [x] **Tests primero**: fixture `.jsonl` (`custom-title`, `user` con `cwd`/`gitBranch`/`timestamp`, `assistant` con `tool_use` Edit/Write/Read); `sesionesActivas(proyectos, dir, { ahora, ventanaMs })` → por proyecto `[{ sid, titulo, rama, inicio, ultimo, activa, archivos (últimos 5 Edit/Write), ultimoPrompt ≤ 200 }]`; `columnasKanban(b, p, sesiones)` → `[{ texto, hecha, estado: 'por-hacer'|'en-curso'|'en-prueba'|'hecho'|'movida', seccion, hito, linea, marcas }]` con los 4 casos; ver fallar — 5 tests nuevos (4 en `generar.test.mjs`, 1 en `servidor.test.mjs`), fallan los 5; fixtures `fixtures/transcripciones/-Users-x-kanban{,-web,Otro}/`
- Contrato que fijan los tests (añadido en S33; lo implementa S33b): `sesionesActivas` devuelve **objeto** `{ [proyectoId]: [...] }` (proyecto sin `transcripciones` → `[]`), orden por mtime desc, salta `.jsonl` sin líneas JSON; `sid` = nombre del archivo sin `.jsonl`; `ultimo` = mtime ISO; `inicio` = primer `timestamp` de la cabeza (leer cabeza de 64 KB / ~20 líneas, no solo 3: las 3 primeras de un `.jsonl` real no traen `timestamp`); `rama` = último `gitBranch`; `archivos` = Edit/Write/MultiEdit/NotebookEdit (no Read) distintos, más reciente primero, máx. 5, solo de la cola; `ultimoPrompt` = último `user` con texto (string o `{type:'text'}`), sin `isMeta`, sin `tool_result`, sin empezar por `<`, ≤ 200; `foco = { claves: [HS]\d+[a-z]? de los prompts (cabeza+cola), backlogs: nombres *.md de los prompts }`; caché por ruta+mtime+size. `estructura`: `RE_TAREA` acepta `[~]`/`[-]` → `marca: '~'|'-'`, `hecha` solo con `x`; `[-]` fuera de los conteos de `cerrarSeccion` (`contarCasillas`: `[~]` como pendiente). `columnasKanban(b, p, sesiones)` → tarjetas de las casillas de primer nivel de cada sección con `{ archivo, texto, hecha, estado, seccion (id), clave, hito (clave del ##), linea, marcas?, sub?{hechas,total} }`; en-curso = `[~]` o sesión `activa` que (nombra `b.archivo` en `foco.backlogs` o tiene `b.ruta` en `archivos`) y (nombra la clave de la sección/hito o, sin claves, `b.activo.seccion` es esa sección; con `b.activo.tarea` solo la tarjeta que la contiene); en-prueba = hecha y rama (`meta.rama` de sección → hito → «Rama \`x\`» en `descripcion` del hito) con PR `OPEN` (`headRefName`) o en `p.git.sinFusionar` (añadir a `leerGit`: `git for-each-ref --no-merged=<origin/HEAD|main> refs/heads --format=%(refname:short)`). `/api/sesiones` → `{ sesiones, columnas: { [id]: [{archivo, linea, texto, estado}] } }` recalculando solo `columnasKanban` sobre la caché de datos (`cache?.datos`, sin `construir`)
- [-] `sesionesActivas`: solo `.jsonl` con mtime < 24 h en `transcripciones` (y `<carpeta>-…`), cola de 64 KB + primeras 3 líneas; `activa` = mtime < 5 min; caché por mtime → S33b
- [-] `columnasKanban`: `en-curso` si la sección es la que edita la sesión activa (sus archivos incluyen el backlog y `frenteActivo`/`historial` apuntan ahí) o `[~]`; `en-prueba` si `hecha` y `seccion.meta.rama` tiene PR `OPEN` o está sin fusionar (`fusionarRamas`); `movida` = `[-]` → S33b
- [-] `GET /api/sesiones` (Host/Origin; sin red; < 50 ms) y `p.kanban` en `recolectar`; `datos.sesiones` en `construir` para `file://` → S33b
- [-] README («Tablero»: columnas y origen de cada una, `/api/sesiones`), `node --test 2>&1 | tail -40`, commit → S33b

Prompt de arranque S33 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S33) y trabaja solo esa sesión en la rama `integraciones-vista`. Prioridad: `/api/sesiones` barato y nunca en la huella de `/api/version`. Tests primero. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S33b — continuación: implementar `/api/sesiones` y `columnasKanban` · **Opus** · `generar.mjs`, `README.md`
Los tests ya están escritos y fallan (5): «sesionesActivas…» ×2, «estructura: «[~]»…», «columnasKanban…» en `generar.test.mjs` y «/api/sesiones…» en `servidor.test.mjs`. Seguir el contrato anotado en S33; no cambiar los tests salvo error evidente.
- [x] `generar.mjs`: `RE_TAREA` con `[~]`/`[-]` y `marca`; `cerrarSeccion` sin `[-]`; `contarCasillas` con `[~]` como pendiente → pasa «estructura: «[~]»…»
- [x] `generar.mjs`: `export function sesionesActivas(proyectos, dir = TRANSCRIPCIONES, { ahora = Date.now(), ventanaMs = 24h, activaMs = 5 min })` con cabeza 64 KB (~20 líneas) + cola 64 KB (descartar primera línea parcial) y caché `Map` ruta→{mtime,size,res} → pasan los 2 tests «sesionesActivas…»
- [x] `generar.mjs`: `export function columnasKanban(b, p, sesiones)` y `sinFusionar` en `leerGit` → pasa «columnasKanban…»
- [x] `generar.mjs`: en `recolectar` calcular `sesionesActivas(proyectos)` una vez y `p.kanban` = `columnasKanban` de cada backlog no plan; `datos.sesiones` en `construir`; ruta `GET /api/sesiones` en `crearManejador` (Host ya validado; sin `construir`: usa `cache?.datos` para `columnas`) → pasa «/api/sesiones…»
- [x] README («Tablero»: columnas y origen de cada una, `/api/sesiones`), `node --test 2>&1 | tail -40` (esperado: 151 pasan, 2 omitidos), commit — 151 pasan, 2 omitidos
- [x] `servidor.test.mjs`: el test «/api/sesiones…» reabre «Uno» al empezar (un test anterior la deja `[x]`) (añadido en S33b)
- [x] `frenteActivo` ignora las casillas `[-]` al ubicar el frente (añadido en S33b)

Prompt de arranque S33b (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S33 + S33b) y trabaja solo S33b en la rama `integraciones-vista`. Los tests ya existen y fallan: implementa hasta verlos en verde. Prioridad: `/api/sesiones` barato y nunca en la huella de `/api/version`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.


### S34 — Pestaña «Tablero» (kanban) · **Sonnet** · `plantilla.html`, `servidor.test.mjs`
- [x] **Test primero**: plantilla trae pestaña `tablero`, `vistaKanban`, `'/api/sesiones'`, `data-kanban-col`, «Claude está trabajando», «Mover a»; ver fallar — falló 1
- [x] Pestaña **Tablero** por proyecto (en `VISTAS`, tras Resumen; acceso desde «Todos»): 4 columnas con contador, tarjeta = casilla (texto, chip `H3 › S3c`, `chipsExternos`, estrella de su sesión); filtro por hito y backlog (`sel.tablero`), «ver movidas»
- [x] Franja «● Claude está trabajando en “<titulo>” · rama X · tocando `archivo` · hace 20 s» (de `/api/sesiones`); gris «◌ sin sesión activa; última: hace 3 h». Sondeo cada 5 s solo en esta pestaña y con la pestaña visible
- [x] **El usuario mueve las tarjetas** por arrastre (`dragstart/drop`) o menú «Mover a…» accesible: → Hecho escribe `[x]`, → Por hacer `[ ]`, → En curso `[~]`; → En prueba no se admite a mano (derivada, lo explica el `title`). Reutiliza el guardado de casillas existente (`POST /api/guardar`, 409 si cambió). Optimista: la tarjeta se queda y vuelve si falla
- [x] Ítems de integraciones como tarjetas con borde propio en las mismas columnas (por `columna`/`hecha`); en `modo: 'participar'` (H14) arrastrarlos cambia el estado vía `/api/integraciones/estado`; en `lectura`, o si H14 no está, solo lectura con `title` — hecho solo lectura (H14 aún no existe)
- [x] Mobile: columnas con scroll horizontal y `scroll-snap`, tarjetas de una línea expandibles; probar a 390 px
- [x] CDP con (headless con datos reales y `file://` a 1200 y 390 px: columnas, franja activa, 0 errores; mover por arrastre/menú y 409 no probados en navegador, solo por código) — `datos/` de prueba y un `.jsonl` reciente (`TABLERO_TRANSCRIPCIONES`): franja activa, mover por menú y por arrastre, 409; `node --test 2>&1 | tail -40`, commit

Prompt de arranque S34 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S34) y trabaja solo esa sesión en la rama `integraciones-vista`. Test de plantilla primero. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

## H13 — Proyecto nuevo sin pegar rutas

Nota 4. El navegador no expone rutas absolutas, así que el servidor lista carpetas (nunca fuera de `~`). Dos vías: «Tus proyectos recientes de Claude» (carpetas `cwd` de `~/.claude/projects/*/*.jsonl` que no estén en `proyectos.json`) y «Explorar» (migas + subcarpetas con etiquetas git/backlog). Al elegir se proponen `id`, `nombre`, `docs` y `notas`.
Historia: Como usuario que crea o edita un proyecto, quiero elegir su carpeta con un clic entre mis proyectos recientes o navegando, para no pegar rutas a mano.

### S35 — `/api/carpetas` y sugerencias (servidor) · **Opus** · `generar.mjs`, `servidor.test.mjs`, `generar.test.mjs`, `README.md`
- [x] **Tests primero**: `listarCarpetas(ruta, home)` → `{ ruta, padre, carpetas: [{ nombre, ruta, esGit, tieneBacklog }] }` sin ocultas ni `node_modules`, 400 fuera de `home` o inexistente, `~` aceptado; `sugerirProyectos(dir, proyectos)` → `[{ ruta, nombre, ultimaActividad, sesiones, esGit }]` sin los ya configurados, tope 12; `propuestaProyecto(ruta)` → `{ id, nombre, docs, notas }`; ver fallar — 5 tests nuevos (4 en `generar.test.mjs`, 1 en `servidor.test.mjs`), fallaron los 5
- [x] `POST /api/carpetas` `{ ruta? }` (sin ruta: `~` + `sugerencias`), solo local, ≤ 200 carpetas con aviso; `cwd` de las primeras líneas de cada `.jsonl` (caché por mtime, compartida con S33 si existe)
- [x] `proyectoNuevo`: sin `docs` y con `repo` → `docs = [repo]`; `id` propuesto único (sufijo `-2`)
- [x] README («Crear proyecto»: elegir carpeta, sugerencias), `node --test 2>&1 | tail -40`, commit
- [x] `sugerirProyectos`: una subcarpeta solo suma en su madre si esta es repo git (con datos reales «~/Desktop/Desarrollo» se tragaba 56 sesiones) (añadido en S35)
- [x] `TABLERO_HOME` (raíz de `/api/carpetas`, para tests) y la respuesta trae `home` para que la vista acorte rutas con `~` (añadido en S35)

Prompt de arranque S35 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S35) y trabaja solo esa sesión en la rama `integraciones-vista`. Prioridad: `/api/carpetas` nunca sale de `~` ni lista archivos. Tests primero. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S36 — Selector de carpeta en Nuevo/Editar proyecto · **Sonnet** · `plantilla.html`, `servidor.test.mjs`
- [x] **Test primero**: plantilla trae `'/api/carpetas'`, `selectorCarpeta`, «Tus proyectos recientes», `data-carpeta`; ver fallar — 1 test nuevo, falló 1 (la marca `'/api/carpetas'`)
- [x] En `pintarCrear` (`proyecto` y `editar`): botón «Elegir…» junto a `repo`, `docs`, `notas`, `bitacora` → `selectorCarpeta(campo)` con pestañas «Recientes de Claude» (nombre, ruta con `~`, «hace N», chip git) y «Explorar» (migas, lista, filtro, «↑ subir»); teclado flechas/Enter/Esc
- [x] Al elegir `repo` en `proyecto`: rellenar `id`/`nombre`/`docs`/`notas` solo si están vacíos; `docs` como casillas de subcarpetas candidatas + «otra…»
- [x] El campo de texto sigue (pegar ruta vale) con placeholder «Elige con el botón o pega la ruta»
- [x] Mobile: filas de 44 px. CDP: crear proyecto desde una sugerencia sin escribir rutas → previa → crear → la guía marca repo/docs; `node --test 2>&1 | tail -40`, commit
- [ ] Por probar a mano: el botón «Elegir…» en Editar proyecto y en `docs`/`notas`/`bitacora`; CDP solo cubrió Nuevo → repo, Explorar y la previa (añadido en S36)

Prompt de arranque S36 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S36) y trabaja solo esa sesión en la rama `integraciones-vista`. Test de plantilla primero. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

## H14 — Asignarme y cerrar ítems en Azure DevOps, también vía Claude

Nota 5 (el usuario tiene permiso para asignarse). Nuevo `modo: 'participar'`: como `lectura` (sin backlog, nunca `.md`, nunca **crea** ítems) pero permite asignar/desasignar y cambiar el estado de ítems existentes. Identidad por `GET …/_apis/connectionData` (`authenticatedUser.properties.Account.$value` = correo); asignar = JSON-patch `System.AssignedTo`. Los ítems traen `descripcion`, `prioridad`, `iteracion`, `padre` para que Claude recomiende.
Historia: Como miembro del equipo, quiero asignarme ítems de Azure y marcarlos terminados desde el tablero o pidiéndoselo a Claude, para repartirme el trabajo sin entrar a Azure.

### S37 — Conector y endpoints de participar · **Opus** · `integraciones/azure-devops.mjs`, `azure-devops.test.mjs`, `integraciones/config.mjs`, `config.test.mjs`, `generar.mjs`, `servidor.test.mjs`, `fixtures/integraciones/azure-devops.json`, `README.md`
- [x] **Tests primero** (ver fallar, anotar): `quienSoy(cfg, cred, deps)` → `{ id, nombre, correo }`; `asignar(cfg, cred, id, correo|null)` → PATCH `System.AssignedTo` (add/remove); `cambiarEstado(cfg, cred, id, estado)` rechaza estados fuera de `columnas`; `leer` trae `descripcion` (HTML → texto ≤ 600), `prioridad`, `iteracion`, `padre`; `config.mjs`: `MODOS` con `participar`, `backlog` opcional, `auto` rechazado, `'*'` permitido; servidor: `/api/integraciones/asignar` y `/estado` → 400 en `lectura` y `sincronizar`, 200 en `participar`, nunca `crear`, parchean `externo-<p>.json` y responden `datos` — (fallaron 7: 5 conector, 1 config, 1 servidor)
- [-] `azure-devops.mjs`: `quienSoy`, `asignar`, `cambiarEstado`; `leer` con `System.Description`, `Microsoft.VSTS.Common.Priority`, `System.IterationPath`, `System.Parent`; `traducirError` para 400 al asignar → S37b
- [-] `config.mjs`: `modo: 'participar'`; `esLectura` → `noEscribeMd(cfg)` (`lectura|participar`); `contextoIntegracion` en `participar` adaptador con `leer`, `asignar`, `cambiarEstado` (sin `crear`/`actualizar`); `sincronizar()` sigue 400 → S37b
- [-] `POST /api/integraciones/asignar` `{ proyecto, integracion, id, aMi }` (correo por `quienSoy`, caché 1 h en `externo-*.json`) y `POST /api/integraciones/estado` `{ proyecto, integracion, id, estado }`; solo local; 15 s; `servidor.log` → S37b
- [-] GitHub Projects y Trello: 400 «este conector aún no participa»; documentarlo → S37b
- [-] README (modo `participar`, scope *Work Items: Read & write*), `proyectos.ejemplo.json`, `node --test 2>&1 | tail -40`, commit → S37b

Prompt de arranque S37 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S37) y trabaja solo esa sesión en la rama `integraciones-vista`. Prioridad: en `participar` nunca se crea un work item ni se toca un `.md`; en `lectura` sigue sin escribirse nada. Tests primero con `fetch` simulado, nada de red real. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.


### S37b — continuación: implementar participar (conector, config, endpoints) · **Opus** · `integraciones/azure-devops.mjs`, `integraciones/config.mjs`, `generar.mjs`, `README.md`, `proyectos.ejemplo.json`
Los tests ya están (S37) y fallan 7; esta sesión solo implementa hasta que pasen. Contrato:
- [x] `azure-devops.mjs` `leer`: añadir a `fields` `System.Description,Microsoft.VSTS.Common.Priority,System.IterationPath,System.Parent` (en ese orden) → `descripcion` (HTML → texto: `\n` por `<br>`/`</p>`/`</div>`/`</li>`, quitar etiquetas, entidades `&nbsp; &amp; &lt; &gt; &quot; &#NN;`, recortar, ≤ 600 con «…»), `prioridad`, `iteracion`, `padre` (String); `null` si faltan
- [x] `quienSoy(cfg, cred, deps)`: `GET connectionData` a nivel **organización** (`api()` añade el proyecto si `cfg.proyecto` → llamar con `{ ...cfg, proyecto: undefined }`; api-version probablemente `7.1-preview`, NO verificado con la org real → probar en S40) → `{ id, nombre: customDisplayName || providerDisplayName, correo: properties.Account.$value }`; sin correo lanza Error que mencione «correo»
- [x] `asignar(cfg, cred, id, correo|null, deps)`: id `/^\d+$/` (si no, Error con «id»), PATCH json-patch `add`/`remove` `System.AssignedTo` → `{ id, columna, hecha, asignado }` del ítem que responde ADO (`identidad`, `estados`); `traducirError` 400 → «Azure DevOps rechazó el cambio: <message del cuerpo JSON>»
- [x] `cambiarEstado(cfg, cred, id, estado, deps, { columnas }?)`: valida sin mayúsculas contra `columnas` dadas o la unión de `wit/workitemtypes` (como `leer`) ANTES del PATCH («… no es un estado …»); manda la grafía canónica; devuelve lo mismo que `asignar`
- [x] `config.mjs`: `MODOS` + `'participar'`; `export const noEscribeMd = (cfg) => lectura|participar`; en `validarIntegracion` `lectura` → `noEscribeMd` (backlog opcional, `auto` rechazado ««auto» no sirve en modo …», `'*'` permitido); `participar` con tipo ≠ `azure-devops` → «este conector aún no participa»
- [x] `generar.mjs`: `esLectura` → `noEscribeMd` (`sincronizar()` 400 con mensaje propio para participar; importar permitido), `base.modo = cfg.modo || 'sincronizar'` en `leerIntegraciones` y `/probar`; map de `items` (~l.909) con `descripcion, prioridad, iteracion, padre`; `contextoIntegracion` en participar añade `asignar`/`cambiarEstado` si el módulo los tiene (nunca `crear`/`actualizar`)
- [x] `POST /api/integraciones/asignar` `{ proyecto, integracion, id, aMi }` y `/estado` `{ proyecto, integracion, id, estado }`: solo local; 404 si no hay integración; 400 si modo ≠ participar (mensaje con «participar») o el módulo no tiene `asignar` («aún no participa»); id `/^\d+$/`; `aMi` boolean; `estado` debe estar en las `columnas` del caché (`externo-<p>.json`) y se pasan al adaptador como `{ columnas }`; correo por `quienSoy` cacheado en `externo-<p>.json` `[cfg.id].yo` con `fecha` (1 h); `conTiempo` 15 s; error → 502 y `registrar(\`asignar part/ado #999: …\`)`; tras el PATCH `c = await fresco()` **sin forzar** (no releer 500 ítems) y parchear el ítem en `c.datos` y en `externo-<p>.json` (`asignado`, `mio`, `columna`, `hecha`); responder `{ ok, item, datos }`
- [x] README (modo `participar`, scope *Work Items: Read & write*, GitHub/Trello aún no participan), `proyectos.ejemplo.json`; `node --test 2>&1 | tail -40` en verde; commit

Prompt de arranque S37b (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S37b) y trabaja solo esa sesión en la rama `integraciones-vista`. Los tests ya existen y fallan 7: implementa hasta que pasen, sin cambiar los tests salvo error evidente. Nada de red real. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S38 — Vista: asignarme y cambiar estado · **Sonnet** · `plantilla.html`, `servidor.test.mjs`
- [x] **Test primero**: plantilla trae `'/api/integraciones/asignar'`, `'/api/integraciones/estado'`, «Asignarme», `data-asignar`, opción `participar`; ver fallar — (falló 1)
- [x] Formulario: selector «Modo» con 3 opciones y una frase cada una («Participar: ver el backlog del equipo, asignarme ítems y cambiar su estado; no crea nada»); «Editar» conserva `participar`
- [x] `itemExterno` y `vistaMias`: en `participar`, «Asignarme»/«Quitarme» y `<select>` de estado con las `columnas`; confirmación en línea con el título; repintar con `datos` y aviso; en `lectura` sin controles, `title` explica cómo activar participar
- [x] «Mis tareas»: «✓ Terminé» = `columnas.hecho[0]`; el ítem sale de la lista al confirmar (corregido: primer estado de `columnas` que tenga ítems `hecha`, `estadoHecho(integ)`)
- [x] «ver descripción» plegable con `descripcion`, prioridad e iteración
- [ ] CDP con `fetch` de Azure simulado por `--import`: asignarme → PATCH visto → chip con mi nombre; cambiar estado → columna nueva; `node --test 2>&1 | tail -40`, commit — NO hecho: queda la prueba en navegador (tests en verde, 165 pasan, `node --check` del script OK) → S40

Prompt de arranque S38 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S38) y trabaja solo esa sesión en la rama `integraciones-vista`. Test de plantilla primero. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S39 — Pedírselo a Claude: CLI `--tareas`, `--asignarme`, `--estado` y hook · **Sonnet** · `generar.mjs`, `generar.test.mjs`/`servidor.test.mjs`, `README.md`
- [x] **Tests primero** (`fetch` simulado o `textoTareas(items, filtro)` exportada): `--tareas eap10 [--sin-asignar|--mias] [--integracion ado]` imprime Markdown por estado (`#id · tipo · prioridad · iteración · asignado · título · descripción corta · url`) con conteos; `--asignarme eap10 123` y `--estado eap10 123 "Doing"` solo en `participar` (si no, cómo activarlo), confirman con el título; ver fallar — (fallaron 4 de `tareas.test.mjs`: no existían `textoTareas` ni `lineasIntegraciones`)
- [x] Implementar reutilizando `contextoIntegracion` + `asignar`/`cambiarEstado` de S37 (misma ruta que los endpoints)
- [x] `hookInicio`: para proyectos con integración (desde `externo-<p>.json`, sin red) «- Azure DevOps `ado`: N sin asignar, M mías abiertas. Para recomendarte una: `node generar.mjs --tareas eap10 --sin-asignar`»
- [x] README «Pedírselo a Claude» con prompt ejemplo («Revisa las tareas pendientes de EAP10 con `node generar.mjs --tareas eap10 --sin-asignar`, recomiéndame cuál asignarme según prioridad e iteración y, cuando te confirme, asígnamela con `--asignarme eap10 <id>`»)
- [x] `node --test 2>&1 | tail -40`, commit

Prompt de arranque S39 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S39) y trabaja solo esa sesión en la rama `integraciones-vista`. Tests primero; nada de red real. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S40 — Cierre de H11–H14 · **Sonnet**, con el usuario
- [ ] `node --test 2>&1 | tail -40` en verde; `node generar.mjs --abrir` y revisar con el usuario: «Para retomar» (IEP y tablero), «Qué se busca», pestaña Tablero con una sesión de Claude abierta en otro proyecto y moviendo tarjetas, crear un proyecto eligiendo carpeta, EAP10 en `participar`: asignarse un ítem real y devolverlo, cambiar estado y volver
- [ ] Responder las 5 notas en `notas/NOTAS_TABLERO.md` («→ respuesta (fecha)», moverlas a «Respondidas»); mobile y «vincularlo con todo» siguen abiertas
- [ ] `verificar_backlog.mjs`, actualizar PR #9 o abrir PR de `integraciones-vista` → `develop`

Prompt de arranque S40 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S40) y trabaja solo esa sesión en la rama `integraciones-vista`, con el usuario delante (PAT y navegador). Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

Orden recomendado: S31 → S32 → S37 → S38 → S39 → S33 → S34 → S35 → S36 → S40 (H13 y H14 independientes de H11/H12). Ningún plugin/MCP.

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
- [x] «+ Añadir integración»; el estado vacío pasa a ser el formulario (no el texto del README)
- [x] Formulario por pasos: tipo → credencial (guardar / «guardada · …ab12» + Cambiar) → destino (desplegable) → backlog → columnas → id propuesto → `auto` → Probar → Guardar
- [x] «Editar» y «Quitar» en cada tarjeta (avisos de marcas huérfanas y de que no se borra nada afuera); deshabilitados sin servidor
- [x] README «Conectores y credenciales»: primero la vista, el JSON a mano como alternativa
- [x] Prueba real en el navegador con `proyectos.json` y `HOME` de prueba: añadir, editar, probar y quitar (Trello o GitHub); `git diff` del json de prueba muestra solo el bloque; push y PR

Decisiones (S18): `datos.integraciones[].config` lleva los campos de la lista blanca (sin secretos) para precargar «Editar». El formulario vive en `plantilla.html` (`formInteg`, estado en JS, controles con `id` y `data-fi`; `pintarF()` conserva el foco). Los campos de texto solo copian al estado en `input`; repintar al soltar el foco se tragaba el clic en «Guardar» (el aviso de id renombrado se actualiza en su sitio). Editar carga destinos y luego el detalle; `hayEdicion()` frena el repintado en vivo mientras hay formulario o confirmación abiertos. Sin integraciones y con servidor, el estado vacío es el formulario (sin «Cancelar»). Prueba real: Playwright (chromium en caché de npx) contra `--servir` con `fetch` de Trello simulado por `--import` (sin red real); `proyectos.json`/credenciales de prueba por `TABLERO_PROYECTOS`/`TABLERO_CREDENCIALES`. Añadir → probar → guardar → editar/renombrar → quitar: todo OK, credenciales 0600, el JSON solo cambia en el bloque. No se probó con un Trello/GitHub reales. Ojo: el servidor se relanza solo a los 30 s si cambia el código, y el relanzado pierde el `--import` del simulador.


### S19 — Azure DevOps: «Buscar proyectos» se queda cargando · **Sonnet** · rama `integraciones-vista`
Contexto (sesión de diagnóstico, solo lectura): red, servidor y PAT están bien (`descubrir` con org falsa responde en 0,35 s con error legible; el servidor tiene timeouts de 10 s y 15 s). Causas sospechosas, no reproducidas: reinicio del servidor «por código nuevo» a media petición, `api()` sin timeout en el cliente, PAT sin scope «Project and Team: Read», mensaje «org/undefined». Plan: `~/.claude/plans/revisa-que-paso-estoy-optimized-candy.md`.
- [-] Confirmar primero con tu organización real: pestaña Red del navegador (¿petición «pending» o error?) y `datos/servidor.log`; anotar la causa real aquí — **pendiente del usuario** (S19: no hay navegador con su org). Pista del `servidor.log`: el servidor se reinició «por código nuevo» cada 1–2 min mientras se editaba, lo que corta peticiones en vuelo (causa probable). → S19b
- [x] `plantilla.html` · `api()` (~línea 777): timeout de cliente 20 s con `AbortController`, mensaje «El servidor no respondió; reintenta» y un reintento automático único si falla por red
- [x] `plantilla.html` · `cargarOpciones` (~línea 1014): `cargando` siempre se limpia; botón «Reintentar» junto al error
- [x] `integraciones/azure-devops.mjs` · `traducirError`: sin `cfg.proyecto` decir «No existe la organización X o el PAT no tiene acceso» (sin «/undefined»); en 401/403/203 de `listar` sugerir el scope «Project and Team: Read» o escribir el proyecto a mano
- [x] Pruebas: `azure-devops.test.mjs` (mensaje sin proyecto; 203 en `listar`) y `servidor.test.mjs` (conector que nunca responde → 502 en ≤15 s)
- [-] Opcional: `generar.mjs`, que el reinicio por código nuevo espere a que no haya peticiones en vuelo — no hecho → S19b
- [-] `node --test 2>&1 | tail -40`, prueba en navegador (org real, org falsa, servidor detenido a media petición), commit — tests 114 pasan, 2 omitidos; falta la prueba en navegador (S19 no la hizo) → S19b

Prompt de arranque S19 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` y haz la sesión S19 (Azure DevOps: «Buscar proyectos» se queda cargando) en la rama `integraciones-vista`. Confirma primero con la pestaña Red si la petición queda pending y anota la causa. Marca las casillas, `node --test 2>&1 | tail -40`, commit. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S19b — Azure DevOps: prueba en navegador y causa real · **Sonnet** · rama `integraciones-vista`
Hecho en S19 (commit 1119f1a, 114 tests pasan, 2 omitidos): `api()` con timeout 20 s y un reintento por red, botón «Reintentar» en destinos, mensajes de ADO sin «undefined» y con el scope «Project and Team: Read», pruebas (incluido conector que nunca responde → 502). Decisión: la causa real no se confirmó (S19 no tiene navegador con la org real); el `servidor.log` muestra reinicios «por código nuevo» cada 1–2 min durante la edición.
- [-] Con tu org real: pestaña Red (¿pending o error?) y `datos/servidor.log`; anotar aquí la causa real → S24 (el 400 ya se explica: URL pegada en «Organización», ver H9)
- [-] Prueba en navegador: org real, org falsa, servidor detenido a media petición (debe salir «El servidor no respondió; reintenta» y «Reintentar») → S24
- [-] Opcional: `generar.mjs` (~línea 773), que el reinicio por código nuevo espere a que no haya peticiones en vuelo; prueba en `generar.test.mjs` → S24

Prompt de arranque S19b (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S19b) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

## H9 — Azure DevOps: organización, backlog del equipo y mis tareas

Plan: `~/.claude/plans/generic-cuddling-hellman.md`. Rama `integraciones-vista`. Causa del 400: se pegó `https://dev.azure.com/CodeFactory2026-2` en «Organización» y `azure-devops.mjs:27` la deja en la ruta. EAP10 (org CodeFactory2026-2) es un proyecto nuevo **sin backlog local**: hace falta modo solo lectura antes de traer el backlog del equipo (si no, «Sincronizar» crearía work items por cada casilla de un backlog ajeno).

### S20 — Normalizar la organización · **Sonnet**
Hecho (commit en `integraciones-vista`). Trampa: `new URL` pasa el host a minúsculas, por eso el nombre en `*.visualstudio.com` se saca del texto original.
- [x] `integraciones/azure-devops.mjs`: exportar `normalizarOrganizacion(texto) → { organizacion, proyecto? }` (casos: nombre solo; https/http; barra final; espacios; `dev.azure.com/Org[/Proyecto/…]`; `usuario@dev.azure.com/Org`; `Org.visualstudio.com[/DefaultCollection|/Proyecto]`; inválido → Error en español). Usarla en `api()`, y `encodeURIComponent` en `urlItem` (l.21) y en la URL de `leer` (l.70). Prueba: tabla de casos en `azure-devops.test.mjs`; una config guardada con URL completa llama a `https://dev.azure.com/CodeFactory2026-2/_apis/...`
- [x] (añadido en revisión Opus) Proyecto sacado de la URL con `decodeURIComponent` (`dev.azure.com/Org/Mi%20Proyecto/_boards` → «Mi Proyecto»). Caso en la tabla de `azure-devops.test.mjs`
- [x] `integraciones/config.mjs`: `validarIntegracion` guarda solo el nombre (y no pisa un `proyecto` ya escrito). Prueba en `config.test.mjs`
- [x] `generar.mjs`: `/api/integraciones/descubrir` y `/probar` devuelven `organizacion` normalizada. Prueba en `servidor.test.mjs`
- [x] `plantilla.html`: el campo «Organización» se reemplaza con la normalizada al buscar/probar; el placeholder/ayuda dice «acepta la URL». Prueba: `node --test 2>&1 | tail -40`
- [ ] Con tu org real: pegar `https://dev.azure.com/CodeFactory2026-2` y pulsar «Buscar proyectos» (debe listar EAP10) — **del usuario**; anotar el resultado aquí

Prompt de arranque S20 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S20) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S21 — Conector: varios tipos, asignado y «mías» · **Sonnet**
- [x] `azure-devops.mjs` `leer`: `tipoItem` texto o lista o `'*'` (WIQL `IN (...)` con comillas escapadas; sin campo = `Task`). Prueba: lista de 2 tipos, `'*'`, y config antigua `tipoItem: 'Task'` intacta
- [x] `leer`: pedir `System.AssignedTo,System.WorkItemType`; ítem `{ asignado: {nombre,correo}|null, tipo }` (identidad como objeto o como texto). Prueba con fixture nuevo en `fixtures/integraciones/azure-devops.json` (asignado, sin asignar, texto)
- [x] `leer`: segunda WIQL `[System.AssignedTo] = @Me` → `mio: true`; si falla, `avisos` y `mio` ausente (no tumba la lectura). Prueba: ambas rutas
- [x] Estados = unión por tipo con **una sola** llamada a `wit/workitemtypes` (ya trae `states`, como en `listar()`; vale también para `'*'`), fallback a deducir de los ítems (añadido en revisión Opus). Lotes de 200 en paralelo (máx. 4) y tope 500 con aviso «mostrando 500 de N». WIQL con `ORDER BY [System.ChangedDate] DESC` para que el tope conserve los recientes (añadido en revisión Opus). Prueba del tope
- [x] (añadido en revisión Opus) `crear()` (l.~98, `$${tipoItem(cfg)}`) con lista usa el primer tipo; `config.mjs` rechaza `tipoItem: '*'` si `modo` es `sincronizar` (no se sabe qué tipo crear). Prueba
- [x] `config.mjs`: `tipoItem` acepta texto o lista (≤10) o `'*'`. Prueba en `config.test.mjs`
- [x] `node --test 2>&1 | tail -40`, commit
- Nota (añadido en S21): `'*'` en `config.mjs` solo se acepta con `modo: 'lectura'` (el campo `modo` lo añade S22 a la lista blanca; hasta entonces `'*'` se rechaza).

Prompt de arranque S21 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S21) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S22 — Modo solo lectura sin backlog · **Opus**
Hecho. En lectura `contextoIntegracion` da `backlog: null` y un adaptador **solo con `leer`** (defensa extra: aunque algo llegara a aplicar, no hay con qué escribir); `sincronizar()` lanza 400 «solo lectura» antes de leer nada. La vista recibe `modo` en cada integración y en `config`; hasta S23 el botón «Sincronizar» sigue visible y responde ese 400.
- [x] `config.mjs`: campo `modo` (`'lectura'|'sincronizar'`, por defecto sincronizar). En `lectura`: `backlog` opcional, `auto` rechazado. Prueba: guarda sin backlog; sincronizar sigue exigiéndolo
- [x] (añadido en revisión Opus) `modo` en `COMUNES` (`config.mjs:8`) y en `configVisible` (`generar.mjs:~600`); si no, editar una integración de solo lectura la devuelve a `sincronizar` en silencio. Prueba: guardar → editar → sigue `modo: 'lectura'`
- [x] (añadido en revisión Opus) `/api/integraciones/probar` (`generar.mjs:~897`, usa `ctx.backlog.contenido`) y `--probar-conexiones`: en lectura no leen backlog y responden `vinculadas: 0`. Prueba en `servidor.test.mjs`
- [x] (añadido en revisión Opus) `sincronizar()` con `elegidas === 'auto'` y **sin instantánea** no aplica nada (aviso «primera sincronía: usa la vista previa»). Prueba: ningún `crear` llamado
- [x] `generar.mjs` `contextoIntegracion`: en `lectura` no exige backlog ni enlaza `crear`/`actualizar`; `sincronizar()` responde 400 «solo lectura» (también `/api/sincronia/aplicar`). Prueba en `servidor.test.mjs`: ningún `crear`/`actualizar` se llama y el `.md` no cambia
- [x] `generar.mjs` `leerIntegraciones`: en `lectura` sin `planificarSincronia`; pasar `asignado/tipo/mio` en el `.map` de ~l.622 (la caché ya guarda `fuera.items` completo). Prueba: aparecen en `datos.integraciones[].items`
- [x] Primera sincronía (sin instantánea): `/api/sincronia/previa` devuelve `primera: true` y el conteo de `crear-fuera`/`traer` (el desmarcado va en S23). Prueba en `servidor.test.mjs` (necesita `TABLERO_DATOS` temporal, que `generar.test.mjs` no monta)
- [x] Proyecto sin `docs` ni `repo` (como eap10) genera sin errores. Prueba con `proyectos` de fixture
- [x] `proyectos.ejemplo.json` y `README.md` (sección «Conectores y credenciales»): `modo`, `tipoItem` lista, organización como URL, ejemplo EAP10
- [x] (añadido en S22) `leerIntegraciones`: con `auto: true` y sin instantánea no marca `_auto` y añade el aviso de primera sincronía a `avisos` (sin prueba propia: la de primera sincronía llama a `sincronizar()` directo)
- [x] `node --test 2>&1 | tail -40`, commit

Prompt de arranque S22 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S22) y trabaja solo esa sesión en la rama `integraciones-vista`. Prioridad: que una integración de solo lectura NO pueda escribir nada, ni en Azure ni en ningún .md. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S23 — Vista: formulario y tarjeta · **Sonnet**
- [x] `plantilla.html` formulario: selector «Modo» (preseleccionar solo lectura si `archivosBacklog()` está vacío); paso 4 condicional con el texto «Este proyecto no tiene backlog: solo se mostrará lo de Azure…»; ocultar `auto`; «Tipo de work item» como casillas + «Todos»
- [x] `plantilla.html` `tarjetaIntegracion`: chip de asignado (nombre) / «Sin asignar» gris, insignia de tipo; filtro Todas / Mías / Sin asignar (desactivado con aviso si falta `mio`); sin botón «Sincronizar» ni «auto: no» en solo lectura; el filtro sobrevive al repintado (`hayEdicion`)
- [x] (añadido en revisión Opus) `cfgLimpia` (`plantilla.html:~1045`) manda `modo`; `filaAccion` (l.~917, `caja(true)`) deja `crear-fuera`/`traer` **sin marcar** cuando la previa trae `primera: true`, con aviso «se crearían N work items en el proyecto real»
- [x] Pruebas: test en `servidor.test.mjs` (la plantilla trae filtro, chips, modo y primera sincronía; EAP10 llega en lectura sin backlog). Playwright no está instalado: se verificó en Chrome headless por CDP (filtro sobrevive al repintado, modo, casillas de tipo, previa de primera sincronía sin marcar)
- [x] (añadido en S23) `tarjetaIntegracion` tolera `items`/`columnas` ausentes (integración en «falta credencial» rompía la pestaña)
- [x] `node --test 2>&1 | tail -40`, commit

Prompt de arranque S23 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S23) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S24 — Org real (EAP10) y prueba en navegador · **Sonnet**, con el usuario
- [x] (hecho en S24; `proyectos.json` está ignorado por git; el PAT de `azure-devops` ya estaba guardado; `--probar-conexiones` → OK, 204 ítems, 13 columnas, solo lectura) `proyectos.json`: añadir `{ "id": "eap10", "nombre": "EAP10", "integraciones": [{ "id": "ado", "tipo": "azure-devops", "modo": "lectura", "organizacion": "CodeFactory2026-2", "proyecto": "EAP10", "tipoItem": "*" }] }` (sin `docs`) y PAT en credenciales (scopes: Work Items Read; «Project and Team: Read» para buscar proyectos)
- [-] Confirmar con la org real: «Buscar proyectos» lista EAP10; la lectura trae el backlog; «Mías» coincide con lo que ves en Azure (confirma que `@Me` funciona con tu PAT); anotar aquí si el PAT no alcanzó algún scope → S24b
- [-] (añadido en revisión Opus) Ver en Azure si EAP10 tiene más de un equipo (el backlog del equipo es por *Area Path*); si sí, anotar aquí para una sesión con campo opcional `areaPath` → S24b
- [-] (S19b) Prueba en navegador: org real, org falsa, servidor detenido a media petición («El servidor no respondió; reintenta» + «Reintentar»); anotar causa real de «cargando» → S24b
- [-] (S19b, opcional) `generar.mjs` ~l.773: el reinicio por código nuevo espera a que no haya peticiones en vuelo; prueba en `generar.test.mjs` → S24b
- [-] Verificar que ningún `.md` cambió (`git status`), `node --test 2>&1 | tail -40`, actualizar PR #9 / abrir PR nuevo → S24b

Prompt de arranque S24 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S24) y trabaja solo esa sesión en la rama `integraciones-vista`, con el usuario delante (necesita su PAT y navegador). Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S24b — Resultados de la prueba real y cierre · **Sonnet**, con el usuario
El usuario revisó EAP10 en el navegador al final de S24 pero no dictó los resultados (el relevo se pidió sin ellos); hay que pedírselos.
- [x] (el usuario confirmó «todo eso funciona»; sin detalle de equipos/`areaPath`) Preguntar al usuario y anotar aquí: ¿«Buscar proyectos» lista EAP10? ¿«Mías» coincide con Azure (`@Me`)? ¿EAP10 tiene más de un equipo (→ `areaPath`)? ¿org falsa y servidor detenido dieron los mensajes esperados? ¿causa real de «cargando»?
- [x] (el usuario confirmó que todos están en el mismo equipo: no hace falta `areaPath`) Si hay más de un equipo: añadir sesión nueva con campo opcional `areaPath`
- [ ] Opcional: `generar.mjs` ~l.773, el reinicio por código nuevo espera a que no haya peticiones en vuelo; prueba en `generar.test.mjs`
- [ ] `git status` (ningún `.md` cambió salvo BACKLOG), `node --test 2>&1 | tail -40`, actualizar PR #9

Prompt de arranque S24b (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S24b) y trabaja solo esa sesión en la rama `integraciones-vista`, con el usuario delante. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S26 — Crear proyecto y backlog desde el tablero (servidor) · **Opus** (escribe archivos)
Pedido del usuario al cerrar S24: en la vista no puede elegir backlog si el proyecto no tiene ninguno, y no puede añadir un proyecto nuevo sin editar `proyectos.json` a mano (notas abiertas de NOTAS_TABLERO.md: «crear un nuevo proyecto»).
- [x] (`proyectoNuevo` + `anadirProyecto` en `config.mjs`; `repo`/`docs` se guardan como se escribieron, `~` incluido) `generar.mjs`: `POST /api/proyectos/crear` `{id, nombre, repo?, docs?}` → valida `id` (`[a-z0-9-]`, único), `repo`/`docs` rutas existentes, escribe `proyectos.json` con control de `mtime` (como `/api/integraciones/guardar`, 409 si cambió); solo local
- [x] (`rutaBacklogNuevo` + `plantillaBacklog`; escribe con `flag: 'wx'`; opcional `carpeta` = una de las `docs`; el nombre debe cumplir `patronBacklogs`) `generar.mjs`: `POST /api/backlog/crear` `{proyecto, archivo?}` → crea `BACKLOG.md` (o `BACKLOG_<ID>.md`) con plantilla mínima (título, «## Estado», una sección con casilla) dentro de `docs` del proyecto; **nunca sobrescribe** (existe → 409), nombre sin `/` ni `..`, requiere que el proyecto tenga `docs`
- [x] Vista previa: ambos endpoints aceptan `{previa: true}` y devuelven lo que escribirían sin escribir
- [x] (2 tests nuevos; también Origin ajeno → 403 y sin `mtime` → 400) Pruebas en `servidor.test.mjs`: id duplicado → 400, archivo existente → 409, ruta fuera de `docs` → 400, `mtime` viejo → 409; tras crear, `/api/datos` lista el backlog
- [x] (129 pasan, 2 omitidos; README documenta ambos endpoints) `node --test 2>&1 | tail -40`, commit

Prompt de arranque S26 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S26) y trabaja solo esa sesión en la rama `integraciones-vista`. Prioridad: no sobrescribir nunca archivos ni escribir fuera de `docs`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S27 — Crear proyecto y backlog desde el tablero (vista) · **Sonnet**
- [x] `plantilla.html`: botón «Nuevo proyecto» (selector de proyectos / «Todos los proyectos») con formulario id, nombre, repo, docs y vista previa antes de crear
- [x] `plantilla.html`: en el paso «Modo y backlog» de integraciones y en la pestaña Backlogs, botón «Crear backlog» cuando el proyecto no tiene (con vista previa); al crearlo se preselecciona en el selector «Archivo»
- [x] Verificar en Chrome headless por CDP (copia de `datos/`): crear proyecto → crear backlog → crear integración en modo sincronizar con ese backlog
- [x] Test de que la plantilla trae el botón y el formulario; `node --test 2>&1 | tail -40`, commit, actualizar PR #9

Prompt de arranque S27 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S27) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

## H10 — Mis tareas, editar proyecto y guía de configuración

Plan: `~/.claude/plans/no-se-si-hay-streamed-lighthouse.md`. Rama `integraciones-vista`. Pedido del usuario (2026-10-04) tras confirmar que EAP10 funciona: (1) ¿dónde creo un backlog en EAP10? Hoy no se puede: «＋ Crear backlog» (`rutaBacklogNuevo`) exige `docs`, EAP10 se creó sin `docs`/`repo` (aún no tiene carpeta en el Mac) y no hay forma de **editar** un proyecto desde la vista; (2) ver **mis tareas** para hacerlas: vista «Mis tareas» **y** importar lo de Azure a un `.md` (S25); (3) guía de configuración para un proyecto nuevo (carpeta/repo, GitHub, sesiones de Claude, backlog, integraciones; nota abierta «crear un nuevo proyecto, forma fácil de vincularlo con todo»). Mientras tanto, a mano: crear la carpeta de EAP10, poner `repo` y `docs` en su bloque de `proyectos.json`, recargar → Backlogs → «＋ Crear backlog». Orden: S28 → S29 → S30 → S25 (S30 puede ir antes que S29; S25 después de S28).

### S28 — Editar proyecto y estado de configuración (servidor) · **Opus** (escribe `proyectos.json`)
Archivos: `generar.mjs`, `integraciones/config.mjs`, `config.test.mjs`, `servidor.test.mjs`, `generar.test.mjs`, `README.md`.
- [x] (`CAMPOS_PROYECTO` exportado; `{}` devuelve el texto igual) `integraciones/config.mjs`: `editarProyecto(jsonCrudo, id, cambios)` sobre el JSON crudo (como `aplicarCambio`/`anadirProyecto`): solo `nombre, repo, docs, notas, transcripciones, bitacora`; conserva `~`, orden, integraciones y campos ajenos; campo vacío = quitarlo (salvo `nombre`). Prueba en `config.test.mjs`
- [x] (`validarCarpeta` exportada, `validarArchivo` y `cambiosProyecto(cambios, actual)` en `generar.mjs`) `generar.mjs`: extraer `validarCarpeta` de `proyectoNuevo` y reutilizarla; `notas`/`bitacora` = archivo existente o carpeta padre existente
- [x] (también 400 por campo no editable o `transcripciones` con `/`; quitar con `''`) `POST /api/proyectos/editar` `{id, cambios, mtime, previa?}`: solo local, `exigirMtime`, `escribirAtomico`, devuelve `datos` frescos; `previa` muestra el bloque resultante sin escribir. Pruebas en `servidor.test.mjs`: id inexistente → 404, carpeta inexistente → 400, `mtime` viejo → 409, previa no escribe, integraciones intactas tras editar
- [x] (`proyectoNuevo` la añade con `repo`; editar solo si falta y no se pidió quitarla; los valores reales existentes no se tocan: IEP usa la carpeta padre del repo a propósito) `transcripcionesDe(repo)`: nombre de carpeta de `~/.claude/projects` derivado de la ruta expandida (no alfanumérico → `-`); crear/editar lo rellena si falta. Prueba con los 3 proyectos reales como casos (p. ej. `-Users-edudelahoz-Desktop-Desarrollo-Instituto-de-estudios-politicos`)
- [x] (exportada; sesiones = `.jsonl` en la carpeta exacta o `<carpeta>-…`; github = `p.git.url`) `estadoConfiguracion(p)` en `recolectar` → `p.configuracion = [{ paso, hecho, detalle }]`: carpeta del repo, es git, remoto GitHub + `gh` autenticado (reusar `p.git`), `docs`, backlog, sesiones de Claude (≥1 `.jsonl` en transcripciones), notas, integraciones. Sin red nueva. Prueba en `generar.test.mjs` (proyecto vacío → todo `false`; tablero → casi todo `true`)
- [x] (134 pasan, 0 fallan) README («Editar proyecto» y guía), `node --test 2>&1 | tail -40`, commit
- [x] (añadido en S28) `datos.proyectos[].editable`: los campos editables tal cual están en `proyectos.json` (con `~`) para que S29 precargue el formulario sin rutas expandidas

Prompt de arranque S28 (Opus, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S28) y trabaja solo esa sesión en la rama `integraciones-vista`. Prioridad: editar un proyecto nunca debe perder sus integraciones ni campos ajenos de `proyectos.json`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S29 — Vista: editar proyecto y guía de configuración · **Sonnet**
Archivos: `plantilla.html`, `servidor.test.mjs`. Depende de S28.
- [x] (`abrirCrear('editar')` precarga desde `P.editable`; campos nombre, repo, docs, notas, bitácora; previa → guardar con `mtime`) `plantilla.html`: botón «Editar proyecto» (Resumen, solo con servidor) que reutiliza `#panel-crear` (`abrirCrear`/`pintarCrear`/`enviarCrear`) con `tipo: 'editar'`, campos precargados, vista previa → guardar con `mtime: DATOS.configMtime`
- [x] (`tarjetaGuia` al inicio del Resumen, chip «⚙ N de M pasos» en «Todos», «Ocultar guía» en `localStorage` `tablero.guia.<id>`) `plantilla.html`: tarjeta «Configurar este proyecto» al inicio del Resumen si algún paso de `p.configuracion` está en `false`, y «⚙ N de M pasos» en la tarjeta de «Todos los proyectos». Acción por paso: carpeta/docs → «Editar proyecto»; backlog → `data-crear="backlog"`; integraciones → pestaña Integraciones con «+ Añadir»; GitHub → comandos copiables (`gh auth login`, `gh repo create` / `gh repo clone`); sesiones de Claude → `cd "<repo>" && claude` copiable. «Ocultar guía» por proyecto (localStorage en try/catch)
- [x] (CDP con proyecto vacío: guía 0/8 → editar repo+docs → 3/8 → crear backlog → 4/8; ocultar y chip en Todos) Verificar en Chrome headless por CDP con datos de prueba: proyecto vacío → guía completa → editar (poner docs) → crear backlog → la guía marca los pasos
- [x] (`servidor.test.mjs`; 135 pasan, 0 fallan, 2 omitidos) Test de plantilla en `servidor.test.mjs`; `node --test 2>&1 | tail -40`, commit

Prompt de arranque S29 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S29) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S30 — Vista «Mis tareas» · **Sonnet**
Archivos: `plantilla.html`, `generar.mjs` (solo si a los ítems les falta `url`/estado), `servidor.test.mjs`.
- [x] (test de plantilla escrito primero y visto fallar: 1 fallo) `plantilla.html`: «Mis tareas» en el selector de proyectos junto a «Todos los proyectos» (`#p=mias`, mismo patrón que el flag `todos` y `vistaTodos`)
- [x] Bloque «Asignadas a mí»: ítems `mio: true` de todas las integraciones que no estén en la columna de hecho (`col.hecho` o la última), agrupados por proyecto → estado, con tipo, enlace al ítem y fecha; aviso si alguna integración no trae `mio`
- [x] Bloque «Siguientes pasos en mis backlogs»: por proyecto, casillas abiertas de la siguiente sesión (`enCurso(p).falta`) con enlace a Backlogs y prompt copiable
- [x] Contador «N asignadas a mí» en la cabecera de «Todos los proyectos»
- [x] Verificar por CDP con `datos/` de prueba (ítems `mio` en varias integraciones); test de plantilla; `node --test 2>&1 | tail -40`, commit

Prompt de arranque S30 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S30) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

### S25 — Importar el backlog de EAP10 a un `.md` propio · **Sonnet**
El usuario lo pidió (2026-10-04). Depende de S28: EAP10 necesita `docs` (o ponerlos a mano en `proyectos.json`).
- [x] `generar.mjs`: `POST /api/integraciones/importar` → vista previa del `BACKLOG_<ID>.md` (casillas con `<!-- ado:ID -->`, agrupadas por estado/tipo) y creación solo si el archivo no existe y el proyecto tiene `docs`; nunca sobrescribe. Prueba: archivo existente → 409
- [x] (añadido en H10) Opción «solo las mías» (`mio: true`) en la vista previa de la importación. Prueba
- [x] `plantilla.html`: botón «Crear backlog local desde Azure» con la vista previa; al crear, la integración pasa a `modo: 'sincronizar'` con ese backlog
- [x] `node --test 2>&1 | tail -40`, commit

Prompt de arranque S25 (Sonnet, sin plugins/MCP):
> Lee `BACKLOG.md` (Estado + S25) y trabaja solo esa sesión en la rama `integraciones-vista`. Al terminar, o si recibes el aviso de contexto, ejecuta /relevo.

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
