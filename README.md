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

Los conectores (GitHub Projects, Trello, Azure DevOps) están en desarrollo. Las
credenciales **nunca** van en el repo ni en el navegador: se leerán de
`~/.config/tablero/credenciales.json` (`chmod 600`) o de variables de entorno
(`TRELLO_KEY`, `TRELLO_TOKEN`, `AZURE_DEVOPS_PAT`). `credenciales*.json` está en `.gitignore`.

## Licencia

MIT, ver [LICENSE](LICENSE).
