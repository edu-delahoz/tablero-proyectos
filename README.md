# Tablero de proyectos

Un único `index.html` local que junta, por proyecto, los backlogs en Markdown, los
planes de Claude Code, el historial de cambios, el estado de GitHub y unas notas
para Claude. Sin dependencias: solo Node.js.

## Qué muestra

Cada proyecto tiene estas pestañas:

- **Resumen**: avance global, «estás aquí» y pendientes más cercanos.
- **Backlogs**: mapa de hitos y sesiones con casillas `[ ]`/`[x]`, avance por sección y subtareas anidadas.
- **Planes**: los planes de `~/.claude/plans` relacionados con el proyecto, con su esquema.
- **Historial**: qué casillas cambiaron entre una generación y la siguiente.
- **GitHub**: ramas, grafo de ramas y pull requests (requiere `gh`).
- **Notas**: notas abiertas para Claude, que ve al iniciar cada sesión.
- **Integraciones**: estado de cada conector (GitHub Projects; Trello y Azure DevOps en camino), sus
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

## Servidor local

```sh
node generar.mjs --servir   # http://127.0.0.1:47321
node generar.mjs --abrir    # regenera y abre el navegador (arranca el servidor si hace falta)
```

Con servidor se pueden marcar casillas y añadir notas desde el navegador; abierto
como `file://` el tablero es de solo lectura.

Seguridad: escucha solo en `127.0.0.1`, exige `Host` y `Origin` propios, solo
acepta JSON y únicamente escribe los archivos `.md` que el tablero ya muestra.
Si el archivo cambió desde que lo cargaste, responde 409 en vez de pisarlo.

## Conectores y credenciales

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
| `tipo` | `github-projects` (disponible); `trello` y `azure-devops` (próximamente) |
| `backlog` | Archivo (dentro de `docs`) cuyas casillas se sincronizan |
| `auto` | `true`: al regenerar se aplica todo lo que no sea conflicto, sin vista previa |
| `propietario`, `numero` | GitHub Projects: usuario u organización y número del Project (`github.com/users/<propietario>/projects/<numero>`) |
| `campoEstado`, `columnas` | GitHub Projects, opcionales: campo de selección (por defecto `Status`) y opciones `{ "pendiente": "Todo", "hecho": "Done" }` |
| `campoSeccion` | GitHub Projects, opcional: campo de **texto** donde va la sección (por defecto `Sección`; si no existe, no se envía) |

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

Para usar otra credencial en una integración concreta, añade una entrada con su `id`
(`"trello-cliente": { "token": "…" }`); se combina con la del tipo. `credenciales*.json` está en
`.gitignore` por si acaso.

### Variables para pruebas

`TABLERO_PROYECTOS` (otro `proyectos.json`), `TABLERO_DATOS` (otra carpeta `datos/`) y
`TABLERO_PUERTO` (otro puerto del servidor) permiten probar contra un Project de prueba sin tocar la
configuración real.

## Licencia

MIT, ver [LICENSE](LICENSE).
