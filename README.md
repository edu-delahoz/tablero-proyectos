# Tablero de proyectos

Un único `index.html` local que junta, por proyecto, los backlogs en Markdown, los
planes de Claude Code, el historial de cambios, el estado de GitHub y unas notas
para Claude. Sin dependencias: solo Node.js.

## Qué muestra

Cada proyecto tiene estas pestañas:

- **Todos los proyectos** (primera opción del selector y vista por defecto; `#p=todos`): una tarjeta por proyecto con avance y «estás aquí», rama, PRs abiertos, notas y bitácora pendiente (enlazan a su pestaña) y costo de 7 días; totales globales arriba. Clic en la tarjeta abre su Resumen.
- **Resumen**: arriba, la tarjeta **▶ En curso** (hito donde estás: mini gráfico de sesiones, avance, gasto de su rama, qué falta y el **prompt de la siguiente sesión** con «Copiar»; si el hito está completo sale «✓ completo»; con sub-sesiones `- **S3c — …**` en la tarea activa, «Falta · S3c — …» lista solo las casillas de la sub-sesión siguiente y el plan es el que mencione esa sub-sesión, la última hecha, o el de `~/.claude/plans` cuyo nombre lleve su clave y el backlog — «Plan (de S3)» si es de una anterior); debajo, avance global, «estás aquí» y pendientes más cercanos. «Todos los proyectos» muestra la misma tarjeta (compacta) del proyecto con actividad más reciente. Para enlazar el plan, pon en el hito una línea `Plan: ~/.claude/plans/x.md`; sus prompts de «Cómo ejecutarlo» (etiqueta «**S7 — Sonnet.** Prompt:») salen en la tarjeta.
- **Backlogs**: mapa de hitos y sesiones con casillas `[ ]`/`[x]`, avance por sección y subtareas anidadas.
  Un campo de búsqueda filtra sesiones y tareas (abre las que coinciden y cuenta las coincidencias); la
  estrella ☆/★ de cada sesión `S…` la marca como favorita y «★ Solo favoritas» filtra por ellas. El Resumen
  lista las favoritas.
- **Planes**: los planes de `~/.claude/plans` relacionados con el proyecto, con su esquema; el campo de
  búsqueda filtra la lista (título y contenido) y las secciones del plan abierto.
- **Historial**: qué casillas cambiaron entre una generación y la siguiente.
- **GitHub**: ramas, grafo de ramas y pull requests (requiere `gh`).
- **Notas**: notas abiertas para Claude, que ve al iniciar cada sesión.
- **Bitácora** (solo con el campo `bitacora`): bloque «Gastos» (SVG en línea: costo por día/semana/mes, por feature/rama y por modelo; sigue el filtro «todas», con tabla y tooltip), totales (sesiones, costo, duración, % con contexto 🔴),
  la tabla de sesiones del proyecto (casilla para ver todas y para «solo pendientes»), resumen semanal y
  lecciones. Con el servidor local, las filas `_pendiente_` se completan ahí mismo (Calidad, Seguridad,
  Notas → Guardar; Enter también guarda) y la barra de estado avisa «✎ N filas de bitácora pendientes».
  Si la bitácora cambió afuera, recarga y conserva lo que habías escrito.
- **Integraciones**: estado de cada conector (GitHub Projects, Trello y Azure DevOps), sus
  tarjetas por columna y el botón **Sincronizar** con vista previa. En el Mapa, cada casilla vinculada
  lleva un chip (`GH ↗`) y la barra de estado avisa «⇄ N cambios por sincronizar».

## Instalación

Requisitos: Node.js ≥ 20. Opcional: [`gh`](https://cli.github.com) autenticado para la pestaña GitHub.

```sh
git clone https://github.com/edu-delahoz/tablero-proyectos.git
cd tablero-proyectos
cp proyectos.ejemplo.json proyectos.json   # y edítalo
node generar.mjs                           # genera index.html
node --test                                # tests del parser
```

## `proyectos.json`

Lista de proyectos (ignorado por git; ver `proyectos.ejemplo.json`):

| Campo | Para qué |
|---|---|
| `id`, `nombre` | Identificador y nombre visible |
| `autor` | Opcional: nombre que aparece en «X dejó N nota(s) abierta(s)» |
| `repo` | Repositorio git (ramas, PRs) |
| `docs` | Carpetas donde buscar backlogs y planes |
| `patronBacklogs` | Expresión regular de los archivos a leer |
| `notas` | Archivo de notas para Claude (se crea si no existe) |
| `transcripciones` | Carpeta de `~/.claude/projects` para relacionar sesiones |
| `bitacora` | Opcional: `BITACORA.md` de sesiones (la que llena `registrar_sesion.sh`); sin el campo no hay pestaña «Bitácora». Varios proyectos pueden apuntar al mismo archivo: cada fila se asocia a su proyecto por el id corto de sesión, buscando `<sid>*.jsonl` en las carpetas `transcripciones` (el prefijo más largo gana); las demás quedan «sin proyecto» |
| `planes` | Opcional: nombres de planes de `~/.claude/plans` asignados a mano; mandan sobre la transcripción y desaparecen de los demás proyectos |
| `integraciones` | Conectores externos (GitHub Projects, Trello, Azure DevOps); ejemplos en el archivo de muestra |

Las rutas aceptan `~`. Los backlogs usan `## H1 — Título`, `### S2 — Título · **Modelo** · rama \`x\``
y casillas `- [ ]`; los bloques de código no cuentan.

## Hooks de Claude Code

En `~/.claude/settings.json` (ajusta la ruta):

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "node \"$HOME/ruta/tablero/generar.mjs\" --silencioso", "timeout": 30 }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node \"$HOME/ruta/tablero/generar.mjs\" --hook-inicio", "timeout": 10 }] }]
  }
}
```

`Stop` regenera el tablero al terminar cada respuesta; `SessionStart` entrega a
Claude el estado del backlog y las notas abiertas, y regenera en segundo plano.

### Backlog obligatoriamente al día (`coherencia.mjs` + `verificar_backlog.mjs`)

Casillas: `[x]` hecho · `[ ]` pendiente · `[~]` a medias (cuenta como pendiente) · `[-]` movido o
descartado, con nota («→ S5b»). Se detectan dos desajustes: **sesión con PR mergeado y casillas
abiertas**, y **sub-backlog `BACKLOG_Hn` ↔ hito «## Hn» del padre** (hijo completo con padre abierto,
o padre cerrado con hijo abierto).

- `SessionStart` (`--hook-inicio`) los muestra como «⚠️ BACKLOG DESACTUALIZADO» para que la sesión
  los corrija antes de empezar (también cubre los merges hechos desde la web de GitHub).
- `PreToolUse` sobre Bash bloquea `gh pr create` (casillas de trabajo abiertas o «Resultado» vacío en las
  secciones de esa rama; tolera las de PR/commit/CI) y `gh pr merge` (cualquier casilla abierta):

```json
"PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"$HOME/ruta/tablero/verificar_backlog.mjs\" --hook", "timeout": 15 }] }]
```

- A mano: `node verificar_backlog.mjs <carpeta del repo>` (exit 1 si hay desajustes).

## Servidor local

```sh
node generar.mjs --servir   # http://127.0.0.1:47321
node generar.mjs --abrir    # regenera y abre el navegador (arranca el servidor si hace falta)
node generar.mjs --asegurar-servidor   # regenera; arranca el servidor si no corre o lo recicla si su código es viejo (hook SessionStart)
```

Con servidor se pueden marcar casillas y añadir notas desde el navegador; abierto
como `file://` el tablero es de solo lectura.

El servidor registra arranques, salidas y errores en `datos/servidor.log` (se recorta a ~200 KB); un error
en una petición no lo tumba, y se cierra solo tras 6 h sin uso (queda anotado en el log). Cada sesión de Claude
lo revive vía `--asegurar-servidor`. El servidor guarda al arrancar la huella de su código (mtimes de `generar.mjs`,
`plantilla.html`, `bitacora.mjs`, `coherencia.mjs`, visible en `/api/version`): cada ~30 s la compara con el disco y,
si cambió, se relanza solo («reinicio por código nuevo» en el log). `--asegurar-servidor` hace lo mismo al momento
(`POST /api/salir`, solo desde 127.0.0.1; si un servidor viejo no lo entiende, SIGTERM al pid que escucha).

**Actualización en vivo.** Con servidor, el tablero sondea `GET /api/version` cada ~3 s (una huella
de mtimes de backlogs, planes de `~/.claude/plans`, notas, `.git/HEAD` y `.git/refs`; no lee contenido)
y, si cambia, pide `GET /api/datos` y repinta conservando proyecto, pestaña, scroll y borradores. No
repinta mientras editas un textarea ni con la pestaña oculta. La barra de estado muestra «● en vivo»
o «◌ manual» (como `file://` sigue manual: el hook Stop regenera `index.html`).

Seguridad: escucha solo en `127.0.0.1`, exige `Host` y `Origin` propios, solo
acepta JSON y únicamente escribe los archivos `.md` que el tablero ya muestra.
Si el archivo cambió desde que lo cargaste, responde 409 en vez de pisarlo.

**Bitácora.** `POST /api/bitacora` `{ ruta, sid, calidad, seguridad, notas, hash }` reescribe solo
Calidad, Seguridad y Notas de la fila de esa sesión (calidad empieza por ✅, 🟡 o 🔴; sin saltos de
línea; notas vacías conservan las que puso el hook; `|` se escapa como `\|`). `hash` es el de la bitácora
cargada (`datos.proyectos[i].bitacora.hash`): si el archivo cambió —p. ej. cerró otra sesión y el hook
añadió su fila— responde 409. Solo acepta la ruta declarada en `bitacora`.

**Favoritos.** `POST /api/favoritos` `{ titulo, favorito }` (booleano) añade o quita una sesión de
`datos/favoritos.json` (`{ "favoritos": ["S1 — Título", …] }`, ignorado por git). La clave es el **título**
de la sesión sin marcas de markdown, no su id posicional, así que sobrevive a reordenar el backlog; si se
renombra la sesión, deja de ser favorita. Solo escribe ese archivo (nunca un `.md`) y los títulos se
comparan en todos los proyectos. Sin servidor las estrellas se ven pero no se pueden cambiar.

## Conectores y credenciales

**Lo normal es hacerlo desde la vista.** Con el tablero abierto con el servidor local (Tablero.app o
`node generar.mjs --abrir`), la pestaña **Integraciones** tiene «+ Añadir integración»: eliges el conector,
pegas la credencial (se guarda con permisos 600 y nunca vuelve a mostrarse; solo «guardada · …ab12»),
eliges el Project/tablero/proyecto y las columnas en desplegables, pruebas la conexión y guardas. Cada
tarjeta tiene «Editar» y «Quitar» (solo modifican el bloque de la integración en `proyectos.json`; no se
borra nada en el backlog ni en la herramienta externa, y cambiar el id deja huérfanas las marcas antiguas).
Como archivo suelto, sin servidor, esos botones están deshabilitados. **A mano** sigue valiendo: es lo
que la vista escribe.

Cada proyecto puede declarar `integraciones` en `proyectos.json`. Se sincronizan las casillas **de
primer nivel** del backlog indicado: el título afuera es el texto plano de la casilla, la sección
(`S3`, `H4`…) va como etiqueta/campo y las subtareas van como checklist en la descripción (solo hacia
afuera).

```json
"integraciones": [
  { "id": "gh", "tipo": "github-projects", "propietario": "usuario", "numero": 3,
    "backlog": "BACKLOG_MVP.md", "auto": false }
]
```

| Campo | Para qué |
|---|---|
| `id` | Nombre corto; es el prefijo de la marca en el `.md` (`<!-- gh:… -->`) y de `## Entrante (gh)` |
| `tipo` | `github-projects`, `trello` o `azure-devops` |
| `modo` | `sincronizar` (por defecto) o `lectura`: solo muestra lo de afuera; nunca escribe ni afuera ni en un `.md`, `backlog` es opcional y `auto` no se admite |
| `backlog` | Archivo (dentro de `docs`) cuyas casillas se sincronizan (obligatorio salvo en `modo: "lectura"`) |
| `auto` | `true`: al regenerar se aplica todo lo que no sea conflicto, sin vista previa. La **primera** sincronía (sin `datos/sync-…`) nunca es automática: hay que hacerla desde la vista previa |
| `propietario`, `numero` | GitHub Projects: usuario u organización y número del Project (`github.com/users/<propietario>/projects/<numero>`) |
| `campoEstado`, `columnas` | GitHub Projects, opcionales: campo de selección (por defecto `Status`) y opciones `{ "pendiente": "Todo", "hecho": "Done" }` |
| `campoSeccion` | GitHub Projects, opcional: campo de **texto** donde va la sección (por defecto `Sección`; si no existe, no se envía) |
| `tablero` | Trello: id del tablero (el código de la URL `trello.com/b/<id>/…`, o el `id` que devuelve añadir `.json` a esa URL) |
| `organizacion`, `proyecto`, `tipoItem` | Azure DevOps: `dev.azure.com/<organizacion>/<proyecto>`; en `organizacion` vale el nombre o la URL pegada (`https://dev.azure.com/Org/Proyecto/…`, `Org.visualstudio.com`), y se guarda solo el nombre. `tipoItem` es el tipo de work item: texto (por defecto `Task`), lista (`["Task", "Bug"]`, hasta 10; al crear se usa el primero) o `"*"` (todos, solo en `modo: "lectura"`). Cada ítem trae `tipo`, `asignado` y `mio` (asignado a quien es dueño del PAT) |
| `columnas` (Trello) | Nombres de lista: `hecho` (por defecto «Hecho» o «Done») y `pendiente` (por defecto «Por hacer», «To Do» o la primera lista distinta de hecho). La sección se envía como etiqueta de la tarjeta |
| `columnas` (Azure DevOps) | Estados: `hecho` (por defecto `Done`, `Closed`, `Completed`) y `pendiente` (por defecto `To Do`, `New`); admiten texto o lista. La sección se envía como tag |

**Solo lectura (proyecto sin backlog).** Para ver el backlog de un equipo ajeno sin tocarlo, sin
carpeta `docs` ni `repo` (si «sincronizara», crearía un work item por cada casilla de un backlog ajeno):

```json
{ "id": "eap10", "nombre": "EAP10",
  "integraciones": [{ "id": "ado", "tipo": "azure-devops", "modo": "lectura",
    "organizacion": "CodeFactory2026-2", "proyecto": "EAP10", "tipoItem": "*" }] }
```

**Cómo funciona la sincronía.** El vínculo casilla ↔ tarjeta es un comentario al final de la línea,
invisible en el Markdown renderizado: `- [ ] Probar el login <!-- gh:PVTI_… -->` (puede haber varias
marcas en la misma casilla). En `datos/sync-<proyecto>-<id>.json` queda la foto de la última
sincronía, y con ella se compara a tres bandas:

| Situación | Acción propuesta |
|---|---|
| Casilla sin marca | Crear afuera y escribir la marca |
| Cambió solo en el backlog (estado o texto) | Actualizar afuera |
| Cambió solo afuera | Actualizar el backlog (marcar/desmarcar o renombrar) |
| Cambió en los dos lados y difiere | Conflicto: la vista previa obliga a elegir lado |
| Tarjeta afuera sin casilla | Traerla bajo `## Entrante (<id>)` |
| Marca cuya tarjeta ya no existe | Solo se informa |

**Nunca se borra nada** en ningún lado. «Hecha» equivale a la columna/estado de hecho; «en curso»
solo existe afuera y en el backlog cuenta como pendiente. Al aplicar, primero se escribe afuera y
luego el `.md` en una sola escritura; si el `.md` cambió desde la vista previa, el servidor responde
409 y no toca nada. Sincronizar requiere el servidor local (`--abrir`); como `file://` la pestaña es
de solo lectura.

```sh
node generar.mjs --probar-conexiones   # lectura mínima de cada integración: OK o el error en español
```

### Credenciales

Las credenciales **nunca** van en el repo ni llegan al navegador (el HTML solo recibe «conectado» o
«falta credencial X»). Se leen de `~/.config/tablero/credenciales.json` o de variables de entorno,
que tienen prioridad:

```json
{
  "trello": { "key": "<api key>", "token": "<token>" },
  "azure-devops": { "pat": "<personal access token>" }
}
```

```sh
mkdir -p ~/.config/tablero
$EDITOR ~/.config/tablero/credenciales.json
chmod 600 ~/.config/tablero/credenciales.json   # el tablero avisa si los permisos son más abiertos
```

| Conector | Credencial | Variables de entorno |
|---|---|---|
| GitHub Projects | Ninguna en el archivo: usa la sesión de `gh` con el scope `project` (`gh auth refresh -s project`) | — |
| Trello | `trello.key` y `trello.token` | `TRELLO_KEY`, `TRELLO_TOKEN` |
| Azure DevOps | `azure-devops.pat` (permiso *Work Items: Read & write*) | `AZURE_DEVOPS_PAT` |

**Trello.** Entra en <https://trello.com/power-ups/admin>, crea un Power-Up (o abre uno propio) y copia la
*API key*; desde ese mismo panel genera un *Token* con permiso de lectura y escritura. Para el `tablero`,
usa el código de la URL del tablero (`trello.com/b/<id>/nombre`).

**Azure DevOps.** En *User settings → Personal access tokens → New token*, con el alcance
*Work Items: Read & write* y la organización elegida; copia el PAT al crearlo (no se vuelve a mostrar).
Si el PAT es inválido, Azure responde con una página de login y el tablero lo traduce a «credencial inválida».

Para usar otra credencial en una integración concreta, añade una entrada con su `id`
(`"trello-cliente": { "token": "…" }`); se combina con la del tipo. `credenciales*.json` está en
`.gitignore` por si acaso.

### Variables para pruebas

`TABLERO_PROYECTOS` (otro `proyectos.json`), `TABLERO_DATOS` (otra carpeta `datos/`) y
`TABLERO_PUERTO` (otro puerto del servidor) permiten probar contra un Project de prueba sin tocar la
configuración real.

## Licencia

MIT, ver [LICENSE](LICENSE).
