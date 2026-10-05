#!/usr/bin/env node
// Tablero de proyectos: junta backlogs, planes de Claude, historial, GitHub y notas
// en un solo index.html local. Sin dependencias.
//   node generar.mjs               → regenera index.html
//   node generar.mjs --abrir       → regenera y abre http://127.0.0.1:47321 (arranca el servidor si hace falta)
//   node generar.mjs --asegurar-servidor → regenera y, si el servidor no corre, lo arranca (lo usa el hook SessionStart)
//   node generar.mjs --servir      → servidor local: sirve el tablero fresco y guarda las ediciones de los .md
//   node generar.mjs --hook-inicio → (SessionStart) imprime contexto para Claude y regenera en segundo plano
//   node generar.mjs --probar-conexiones → lectura mínima de cada integración (GitHub Projects, Trello, Azure DevOps)
// Variables opcionales: TABLERO_PROYECTOS (otro proyectos.json), TABLERO_DATOS (otra carpeta datos/), TABLERO_PUERTO,
// TABLERO_TRANSCRIPCIONES (otra carpeta en lugar de ~/.claude/projects).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, realpathSync, openSync, readSync, closeSync, appendFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname, basename, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extraerMarcas, tareasLocales, planificarSincronia, aplicarSincronia } from './integraciones/sincronia.mjs'
import { leerCredenciales, credencialesPara, guardarCredencial, resumenCredenciales, REQUISITOS, RUTA_CREDENCIALES } from './integraciones/credenciales.mjs'
import { validarIntegracion, aplicarCambio, anadirProyecto, editarProyecto, escribirAtomico, ErrorConfig, CAMPOS, COMUNES, CAMPOS_PROYECTO, noEscribeMd } from './integraciones/config.mjs'
import { ADAPTADORES, NOMBRES } from './integraciones/index.mjs'
import { normalizarOrganizacion } from './integraciones/azure-devops.mjs'
import { desajustes, describir } from './coherencia.mjs'
import { parsearBitacora, sidsPorProyecto, asociar, editarFila, hashBitacora, ErrorBitacora } from './bitacora.mjs'
import { modeloPlanDe, modeloDistinto } from './metricas_jsonl.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CONFIG = process.env.TABLERO_PROYECTOS || join(AQUI, 'proyectos.json')
const DATOS = process.env.TABLERO_DATOS || join(AQUI, 'datos')
const PLANES = join(homedir(), '.claude', 'plans')
const TRANSCRIPCIONES = process.env.TABLERO_TRANSCRIPCIONES || join(homedir(), '.claude', 'projects')
const args = process.argv.slice(2)
// Las apps de macOS y los hooks arrancan con un PATH mínimo: sin esto no encuentran gh ni git.
process.env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':')

const expandir = (r) => r.replace(/^~(?=\/|$)/, homedir())
const leerJson = (r, def) => { try { return JSON.parse(readFileSync(r, 'utf8')) } catch { return def } }
const sh = (cmd, a, cwd, timeout = 15000) => {
  try { return execFileSync(cmd, a, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null }
}
// proyectos.json se relee cuando cambia (la vista Integraciones lo edita con el servidor en marcha).
// «planes» en proyectos.json asigna planes a mano: mandan sobre la transcripción y salen de los demás proyectos.
let proyectos = [], planesAsignados = new Map(), firmaConfig = null
const statConfig = () => statSync(CONFIG, { throwIfNoEntry: false })
function cargarProyectos(forzar = false) {
  const st = statConfig(), firma = st ? `${st.mtimeMs}:${st.size}` : null
  if (!forzar && firma === firmaConfig) return proyectos
  firmaConfig = firma
  proyectos = leerJson(CONFIG, []).map((p) => ({
    ...p,
    editable: Object.fromEntries(CAMPOS_PROYECTO.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])), // tal cual (con «~») para «Editar proyecto»
    repo: p.repo && expandir(p.repo),
    docs: (p.docs || []).map(expandir),
    notas: p.notas && expandir(p.notas),
    bitacora: p.bitacora && expandir(p.bitacora),
  }))
  planesAsignados = new Map(proyectos.flatMap((p) => (p.planes || []).map((n) => [n, p.id])))
  return proyectos
}
cargarProyectos()

const PLANTILLA_NOTAS = `# Notas para Claude

> Escribe aquí preguntas, notas o aclaraciones para Claude. Al iniciar cada sesión
> en este proyecto, Claude ve cuántas hay abiertas y las atiende.
> Formato: una casilla por nota bajo «Abiertas». Claude responde debajo con
> \`→ respuesta (fecha)\` y la mueve a «Respondidas».

## Abiertas

- [ ] (ejemplo) ¿Por dónde vamos en el hito actual?

## Respondidas

`

// ---------- Crear y editar proyecto, crear backlog desde la vista ----------
// Rutas: absolutas o con «~», y se guardan como se escribieron. Cada validador añade a `errores` y devuelve el valor recortado o null.
export function validarCarpeta(v, campo, errores) {
  if (typeof v !== 'string' || !v.trim()) return errores.push(`«${campo}» debe ser una ruta.`), null
  const r = v.trim()
  if (!isAbsolute(expandir(r))) return errores.push(`«${campo}» debe ser una ruta absoluta (o empezar por ~): ${r}`), null
  if (!statSync(expandir(r), { throwIfNoEntry: false })?.isDirectory()) return errores.push(`«${campo}» no es una carpeta que exista: ${r}`), null
  return r
}
// notas/bitácora: un archivo que ya existe, o uno nuevo dentro de una carpeta que existe (las notas se crean con su plantilla).
function validarArchivo(v, campo, errores) {
  if (typeof v !== 'string' || !v.trim()) return errores.push(`«${campo}» debe ser una ruta.`), null
  const r = v.trim(), abs = expandir(r)
  if (!isAbsolute(abs)) return errores.push(`«${campo}» debe ser una ruta absoluta (o empezar por ~): ${r}`), null
  const st = statSync(abs, { throwIfNoEntry: false })
  if (st ? !st.isFile() : !statSync(dirname(abs), { throwIfNoEntry: false })?.isDirectory()) return errores.push(`«${campo}» debe ser un archivo, o estar en una carpeta que exista: ${r}`), null
  return r
}
const comoLista = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v])

// Carpeta de ~/.claude/projects de las sesiones abiertas en `repo`: Claude Code cambia todo lo no alfanumérico por «-».
export const transcripcionesDe = (repo) => expandir(repo).replace(/[^A-Za-z0-9]/g, '-')

// ---------- Elegir carpeta sin pegar rutas (/api/carpetas) ----------
// Nunca fuera de home (comprobado con realpath: un enlace no saca de ahí) y nunca lista archivos.
// TABLERO_HOME cambia esa raíz (los tests la apuntan a un temporal).
const HOME = process.env.TABLERO_HOME || homedir()
const MAX_CARPETAS = 200
const CANDIDATAS_DOCS = ['docs', 'documentacion', '.tablero']
const dentroDe = (r, raiz) => r === raiz || r.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)
const conTilde = (r, home) => (r === home ? '~' : dentroDe(r, home) ? `~${r.slice(home.length)}` : r)
const esCarpeta = (r) => !!statSync(r, { throwIfNoEntry: false })?.isDirectory()
const tieneBacklogEn = (r) => { try { return readdirSync(r).some((f) => /^BACKLOG.*\.md$/i.test(f)) } catch { return false } }
const candidatasDocs = (r) => CANDIDATAS_DOCS.map((d) => join(r, d)).filter(esCarpeta)

// → { ruta, padre (null en home), carpetas: [{ nombre, ruta, esGit, tieneBacklog }], aviso? }. Sin ocultas, node_modules ni enlaces.
export function listarCarpetas(ruta, home = HOME) {
  const pedida = ruta == null || ruta === '' ? '~' : ruta
  if (typeof pedida !== 'string') throw new ErrorConfig('La ruta debe ser texto.')
  const abs = pedida.trim().replace(/^~(?=\/|$)/, home)
  if (!isAbsolute(abs)) throw new ErrorConfig(`La ruta debe ser absoluta (o empezar por ~): ${pedida}`)
  const lexica = resolve(abs), raiz = resolve(home)
  let real, raizReal
  try { real = realpathSync(lexica); raizReal = realpathSync(raiz) } catch { throw new ErrorConfig(`No existe esa carpeta: ${pedida}`) }
  if (!dentroDe(lexica, raiz) || !dentroDe(real, raizReal)) throw new ErrorConfig(`Solo se exploran carpetas dentro de ${raiz}: ${pedida} queda fuera.`)
  if (!esCarpeta(real)) throw new ErrorConfig(`No es una carpeta: ${pedida}`)
  const todas = readdirSync(real, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => d.name).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  const carpetas = todas.slice(0, MAX_CARPETAS).map((nombre) => {
    const r = join(lexica, nombre)
    return { nombre, ruta: r, esGit: existsSync(join(r, '.git')), tieneBacklog: tieneBacklogEn(r) || candidatasDocs(r).some(tieneBacklogEn) }
  })
  return {
    ruta: lexica, padre: lexica === raiz ? null : dirname(lexica), carpetas,
    ...(todas.length > MAX_CARPETAS && { aviso: `Hay ${todas.length} carpetas; se muestran las primeras ${MAX_CARPETAS}. Escribe la ruta para llegar a otra.` }),
  }
}

// «cwd» de una transcripción: de sus primeras ~20 líneas (las 3 primeras de un .jsonl real no lo traen). Caché por ruta+mtime+size.
const cacheCwd = new Map()
function cwdDe(ruta, st) {
  const c = cacheCwd.get(ruta)
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.cwd
  let cwd = null
  try {
    const fd = openSync(ruta, 'r')
    try {
      const buf = Buffer.alloc(Math.min(st.size, 64 * 1024))
      for (const l of buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0)).split('\n').slice(0, 20)) {
        try { const o = JSON.parse(l); if (typeof o?.cwd === 'string') { cwd = o.cwd; break } } catch {}
      }
    } finally { closeSync(fd) }
  } catch {}
  cacheCwd.set(ruta, { mtime: st.mtimeMs, size: st.size, cwd })
  return cwd
}

// Carpetas donde se abrió Claude (cwd de ~/.claude/projects/*/*.jsonl) que aún no son proyectos: dentro de home, que existan,
// sin el propio home; una subcarpeta suma en su carpeta madre si esta también sale y es un repo git. Más reciente primero, tope 12.
export function sugerirProyectos(dir = TRANSCRIPCIONES, lista = [], { home = HOME, tope = 12 } = {}) {
  if (!esCarpeta(dir)) return []
  const raiz = resolve(home)
  const repos = new Set(lista.map((p) => p.repo && resolve(expandir(p.repo))).filter(Boolean))
  const yaVistas = new Set(lista.map((p) => p.transcripciones).filter(Boolean))
  const porCwd = new Map()
  for (const d of readdirSync(dir)) {
    if (yaVistas.has(d)) continue
    let archivos = []
    try { archivos = readdirSync(join(dir, d)).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    const sts = archivos.map((f) => ({ ruta: join(dir, d, f), st: statSync(join(dir, d, f), { throwIfNoEntry: false }) })).filter((x) => x.st?.isFile())
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
    let cwd = null
    for (const x of sts) if ((cwd = cwdDe(x.ruta, x.st))) break
    if (!cwd || !isAbsolute(cwd)) continue
    cwd = resolve(cwd)
    const s = porCwd.get(cwd) || { sesiones: 0, ultimo: 0 }
    porCwd.set(cwd, { sesiones: s.sesiones + sts.length, ultimo: Math.max(s.ultimo, sts[0]?.st.mtimeMs || 0) })
  }
  const validas = [...porCwd.keys()].filter((c) => c !== raiz && dentroDe(c, raiz) && !repos.has(c) && esCarpeta(c))
  const madres = new Map()
  for (const c of validas) {
    const madre = validas.filter((o) => o !== c && dentroDe(c, o) && existsSync(join(o, '.git'))).sort((a, b) => a.length - b.length)[0] || c
    const s = porCwd.get(c), m = madres.get(madre) || { sesiones: 0, ultimo: 0 }
    madres.set(madre, { sesiones: m.sesiones + s.sesiones, ultimo: Math.max(m.ultimo, s.ultimo) })
  }
  return [...madres].sort((a, b) => b[1].ultimo - a[1].ultimo).slice(0, tope).map(([ruta, s]) => ({
    ruta, nombre: basename(ruta), ultimaActividad: new Date(s.ultimo).toISOString(), sesiones: s.sesiones, esGit: existsSync(join(ruta, '.git')),
  }))
}

// Lo que se propone al elegir la carpeta de un proyecto: id único (sufijo -2, -3…), nombre legible, docs entre las candidatas
// (si no hay, el propio repo) y notas dentro de la primera docs. Rutas con «~».
export function propuestaProyecto(ruta, existentes = [], home = HOME) {
  const abs = resolve(ruta.replace(/^~(?=\/|$)/, home)), base = basename(abs)
  const raizId = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'proyecto'
  const ids = new Set(existentes.map((p) => p.id))
  let id = raizId
  for (let i = 2; ids.has(id); i++) id = `${raizId}-${i}`
  const limpio = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  const docs = candidatasDocs(abs)
  const elegidas = docs.length ? docs : [abs]
  return {
    id, nombre: limpio.charAt(0).toUpperCase() + limpio.slice(1),
    docs: elegidas.map((d) => conTilde(d, resolve(home))),
    notas: conTilde(join(elegidas[0], `NOTAS_${id.toUpperCase().replace(/-/g, '_')}.md`), resolve(home)),
  }
}

// Entrada de proyectos.json para un proyecto nuevo: id [a-z0-9-] único (sin id y con repo, se propone desde el repo);
// repo y docs, carpetas que ya existen (sin docs, el repo); «transcripciones» sale del repo. Lanza ErrorConfig (400) con todos los errores juntos.
export function proyectoNuevo(b, existentes) {
  const errores = []
  const repo = b.repo == null || b.repo === '' ? undefined : validarCarpeta(b.repo, 'repo', errores)
  let id = typeof b.id === 'string' ? b.id.trim() : ''
  if (!id && repo) id = propuestaProyecto(expandir(repo), existentes).id
  const nombre = typeof b.nombre === 'string' ? b.nombre.replace(/\s+/g, ' ').trim() : ''
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) errores.push('El id solo admite minúsculas, números y guiones (hasta 40, sin empezar por guion).')
  else if (existentes.some((p) => p.id === id)) errores.push(`Ya hay un proyecto con id «${id}».`)
  if (!nombre || nombre.length > 100) errores.push('Falta el nombre (hasta 100 caracteres).')
  let docs = comoLista(b.docs).map((d) => validarCarpeta(d, 'docs', errores))
  if (!docs.length && repo) docs = [repo]
  if (errores.length) throw Object.assign(new ErrorConfig(errores.join(' ')), { errores })
  return { id, nombre, ...(repo && { repo, transcripciones: transcripcionesDe(repo) }), ...(docs.length && { docs }) }
}

// Cambios validados para editarProyecto (config.mjs): solo CAMPOS_PROYECTO; '' = quitar el campo (salvo nombre).
// Si el proyecto queda con repo y sin «transcripciones» (y no se pidió quitarla), se rellena desde el repo.
export function cambiosProyecto(cambios, actual) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new ErrorConfig('Faltan los cambios del proyecto.')
  const errores = [], limpios = {}
  const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)
  for (const [k, v] of Object.entries(cambios)) {
    if (!CAMPOS_PROYECTO.includes(k)) { errores.push(`«${k}» no se edita desde la vista (solo ${CAMPOS_PROYECTO.join(', ')}).`); continue }
    if (k === 'nombre') {
      const n = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
      if (!n || n.length > 100) errores.push('Falta el nombre (hasta 100 caracteres).'); else limpios.nombre = n
    } else if (vacio(v)) limpios[k] = ''
    else if (k === 'repo') limpios.repo = validarCarpeta(v, 'repo', errores)
    else if (k === 'docs') limpios.docs = comoLista(v).map((d) => validarCarpeta(d, 'docs', errores))
    else if (k === 'notas' || k === 'bitacora') limpios[k] = validarArchivo(v, k, errores)
    else if (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(v.trim())) limpios.transcripciones = v.trim()
    else errores.push('«transcripciones» es el nombre de una carpeta de ~/.claude/projects (sin «/»).')
  }
  if (errores.length) throw Object.assign(new ErrorConfig(errores.join(' ')), { errores })
  const repo = 'repo' in limpios ? limpios.repo : actual?.repo
  if (repo && !('transcripciones' in limpios) && !actual?.transcripciones) limpios.transcripciones = transcripcionesDe(repo)
  return limpios
}

export const plantillaBacklog = (nombre, fecha) => `# Backlog — ${nombre}

## Estado
- ${fecha} · backlog creado desde el tablero.
- Para retomar (${fecha}): Backlog recién creado; aún no se empezó nada. Lo primero es describir la primera tarea de S1.

## S1 — Primera sesión
Historia: Como <quién>, quiero <qué>, para <para qué>.
- [ ] Describe aquí la primera tarea
`

// Backlog secundario con nombre: «Sprint 3 — Diseño» → BACKLOG_SPRINT_3_DISENO.md (sin tildes; nunca el principal).
export function archivoDeNombre(nombre) {
  const base = String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  if (!base) throw new ErrorConfig('El nombre del backlog necesita al menos una letra o número.')
  return `BACKLOG_${base}.md`
}
// Lee { nombre, archivo } del cuerpo: el nombre (si viene) decide el archivo y se añade al título.
function destinoBacklog(b, porDefecto) {
  const nombre = typeof b.nombre === 'string' && b.nombre.trim() ? b.nombre.trim().replace(/\s+/g, ' ') : null
  if (nombre && b.archivo != null) throw new ErrorConfig('Indica el nombre o el archivo del backlog, no ambos.')
  return { nombre, archivo: nombre ? archivoDeNombre(nombre) : b.archivo ?? porDefecto }
}

// Ruta de un backlog nuevo dentro de la carpeta docs elegida: nombre simple (sin / ni ..), .md, que el
// patrón del proyecto reconozca, y que no exista (409). La carpeta se resuelve con realpath.
export function rutaBacklogNuevo(p, archivo = 'BACKLOG.md', carpeta) {
  if (!p.docs?.length) throw new ErrorConfig('Ese proyecto no tiene carpeta de documentos («docs»): añádela antes de crear un backlog.')
  if (typeof archivo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.md$/.test(archivo) || archivo.includes('..')) throw new ErrorConfig('El archivo debe ser un nombre simple terminado en .md, sin «/» ni «..».')
  if (!new RegExp(p.patronBacklogs || '^BACKLOG.*\\.md$', 'i').test(archivo)) throw new ErrorConfig(`«${archivo}» no lo reconocería el tablero como backlog (patrón ${p.patronBacklogs || '^BACKLOG.*\\.md$'}).`)
  const dir = carpeta === undefined ? p.docs[0] : p.docs.find((d) => d === carpeta)
  if (!dir) throw new ErrorConfig('Esa carpeta no es una de las «docs» del proyecto.')
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new ErrorConfig(`La carpeta de documentos no existe: ${dir}`)
  const ruta = join(realpathSync(dir), archivo)
  if (existsSync(ruta)) throw new ErrorConfig(`Ya existe ${archivo}: el tablero nunca sobrescribe un backlog.`, 409)
  return ruta
}

// Backlog local a partir de los ítems de una integración de solo lectura: un «## estado» por columna (en su orden) y un
// «### tipo» dentro, con la marca «<!-- id:ID -->» para que la sincronía los reconozca. El título no se toca (si no, saldría conflicto).
export function importarBacklog(nombre, integracion, items, columnas, fecha, soloMias = false) {
  const lista = items.filter((x) => !soloMias || x.mio === true)
  const orden = [...new Set([...(columnas || []), ...lista.map((x) => x.columna || 'Sin estado')])]
  const tipos = [...new Set(lista.map((x) => x.tipo).filter(Boolean))]
  const out = [`# Backlog — ${nombre}`, '', '## Estado', `- ${fecha} · importado de ${integracion}${soloMias ? ' (solo lo asignado a mí)' : ''}: ${lista.length} ítems.`]
  for (const col of orden) {
    const delEstado = lista.filter((x) => (x.columna || 'Sin estado') === col)
    if (!delEstado.length) continue
    out.push('', `## ${col}`)
    for (const tipo of [...new Set(delEstado.map((x) => x.tipo || null))]) {
      if (tipos.length > 1 || tipo) out.push('', `### ${tipo || 'Sin tipo'}`)
      for (const x of delEstado.filter((y) => (y.tipo || null) === tipo)) out.push(`- [${x.hecha ? 'x' : ' '}] ${String(x.titulo).replace(/\s*\n\s*/g, ' ')} <!-- ${integracion}:${x.id} -->`)
    }
  }
  return { contenido: out.join('\n') + '\n', total: lista.length, tipos }
}

// ---------- Backlogs ----------
function contarCasillas(texto) {
  const hechas = (texto.match(/^\s*[-*] \[x\]/gim) || []).length
  const pendientes = (texto.match(/^\s*[-*] \[[ ~]\]/gm) || []).length
  return { hechas, total: hechas + pendientes }
}

// ---------- Estructura (vista «Mapa»): secciones ##/### con sus casillas anidadas ----------
const RE_TITULO = /^(#{2,3})\s+(.+?)\s*#*\s*$/
// «[~]» = en curso a mano (cuenta como pendiente); «[-]» = movida (fuera de los conteos).
const RE_TAREA = /^(\s*)[-*] \[([ xX~-])\]\s?(.*)$/
const RE_CERCA = /^\s*(```|~~~)/
const RE_COMO = /c[oó]mo ejecutarlo/i
const RE_ITEM = /^ ?(\d+[.)]|[-*])\s+(?!\[[ xX~-]\])(.+)$/
const RE_DURACION = /\s*\(([^()]*\b(?:d[ií]as?|d|semanas?|sem|horas?|h)\b[^()]*)\)\s*$/i
// «Qué se busca»: línea «Historia:|Objetivo:|Para qué:» (también en viñeta o en negrita); la descripción es el primer
// párrafo de texto corrido bajo el título (sin casillas, listas, tablas, citas ni código).
const RE_HISTORIA = /^\s*(?:[-*]\s+)?\**\s*(?:Historia|Objetivo|Para qu[eé])\s*:\s*\**\s*(.+)$/i
const esParrafo = (l) => !/^\s*(?:[-*+]|\d+[.)])\s|^\s*\||^\s*<!--|^\s*(?:-{3,}|\*{3,}|_{3,})\s*$|^\s{4,}/.test(l)
export const plano = (t) => String(t).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '').trim()

// «S1 — Migración … · **Opus** · rama `x`» → { titulo, clave: 'S1', meta: { modelo, rama, duracion, cerrado, nota } }
export function analizarTitulo(crudo) {
  const meta = {}
  let t = crudo.trim()
  if (/✅|\b(CERRADO|COMPLETO|TERMINADO)\b/.test(t)) meta.cerrado = true
  t = t.replace(/\s+[—–-]\s+✅.*$/, '')
  const partes = t.split(/\s+·\s+/)
  let titulo = partes.shift()
  const notas = []
  for (let resto of partes) {
    const mod = resto.match(/\*\*(Opus|Sonnet|Haiku|Fable)\*\*/i)
    if (mod) { meta.modelo = mod[1]; resto = resto.replace(mod[0], '') }
    const rama = resto.match(/(?:misma\s+)?rama\s+`([^`]+)`/i)
    if (rama) { meta.rama = rama[1]; resto = resto.replace(rama[0], '') }
    resto = resto.trim().replace(/^\((.*)\)$/, '$1')
    if (resto) notas.push(resto)
  }
  const dur = titulo.match(RE_DURACION)
  if (dur) { meta.duracion = dur[1].trim(); titulo = titulo.slice(0, dur.index) }
  if (notas.length) meta.nota = notas.join(' · ')
  titulo = titulo.trim()
  return { titulo, clave: (titulo.match(/^\**([HS]\d+[a-z]?)\b/) || [])[1] || null, meta }
}

function cerrarSeccion(s) {
  const contar = (ts) => ts.reduce((a, x) => { if (x.marca === '-') return a; const h = contar(x.hijas); return { hechas: a.hechas + h.hechas + (x.hecha ? 1 : 0), total: a.total + h.total + 1 } }, { hechas: 0, total: 0 })
  const propias = contar(s.tareas)
  s.hijas.forEach(cerrarSeccion)
  s.hechas = propias.hechas + s.hijas.reduce((a, h) => a + h.hechas, 0)
  s.total = propias.total + s.hijas.reduce((a, h) => a + h.total, 0)
  s.estado = !s.total || /^estado\b/i.test(plano(s.titulo)) ? 'doc'
    : s.meta.cerrado || s.hechas === s.total ? 'hecho'
    : s.hechas ? 'en-curso' : 'pendiente'
}

// Texto de un bloque de cita: quita «> », une las líneas de un párrafo con espacio y conserva los saltos entre párrafos.
const textoDeCita = (lineas) => lineas.map((l) => l.replace(/^\s*>\s?/, '').trim())
  .reduce((ps, l) => { if (!l) ps.push([]); else (ps.at(-1) || (ps[ps.push([]) - 1])).push(l); return ps }, [])
  .filter((p) => p.length).map((p) => p.join(' ')).join('\n\n')

// Árbol de secciones: [{ id, linea, titulo, tituloCrudo, clave, nivel, meta, hechas, total, estado, tareas:[{texto,hecha,linea,hijas,marcas?}], items, prompts:[{etiqueta,texto,clave,modelo}], hijas:[sección] }]
export function estructura(texto) {
  const raiz = []
  let padre = null, actual = null, pila = [], cerca = null, cita = null, rotulo = null, n = 0, intro = false
  const cuenta = () => RE_COMO.test(plano(actual.titulo)) || (actual.nivel === 3 && padre && RE_COMO.test(plano(padre.titulo)))
  const emitir = (lineas, rot, esCita) => {
    const texto = esCita ? textoDeCita(lineas) : lineas.join('\n')
    if (!actual || !texto.trim() || !(cuenta() || /prompt/i.test(rot || ''))) return
    const etiqueta = (/prompt/i.test(rot || '') ? plano(rot) : '').replace(/^(?:[-*]|\d+[.)])\s+/, '').replace(/\s*:\s*$/, '').slice(0, 80) || 'Prompt'
    const modelo = (etiqueta.match(/\b(Opus|Sonnet|Haiku|Fable)\b/i) || [])[1]
    actual.prompts.push({ etiqueta, texto: texto.slice(0, 20000), clave: (etiqueta.match(/\b([A-Z]\d+[a-z]?)\b/) || [])[1] || null, ...(modelo ? { modelo: modelo[0].toUpperCase() + modelo.slice(1).toLowerCase() } : {}) })
  }
  for (const [i, linea] of String(texto).replace(/\t/g, '    ').split('\n').entries()) {
    if (RE_CERCA.test(linea)) {
      intro = false
      if (cita) { emitir(cita.lineas, cita.rotulo, true); cita = null }
      if (cerca) { emitir(cerca.lineas, cerca.rotulo, false); cerca = null } else cerca = { rotulo, lineas: [] }
      rotulo = null
      continue
    }
    if (cerca) { cerca.lineas.push(linea); continue }
    if (/^\s*>/.test(linea)) {
      intro = false
      if (!cita) cita = { rotulo, lineas: [] }
      cita.lineas.push(linea)
      continue
    }
    if (cita) { emitir(cita.lineas, cita.rotulo, true); cita = null; rotulo = null }
    if (linea.trim()) rotulo = linea
    const t = linea.match(RE_TITULO)
    if (t) {
      const nivel = t[1].length
      const s = { id: `s${n++}`, nivel, linea: i, tituloCrudo: t[2], ...analizarTitulo(t[2]), tareas: [], items: [], prompts: [], hijas: [] }
      if (nivel === 3 && padre) padre.hijas.push(s)
      else { raiz.push(s); if (nivel === 2) padre = s }
      actual = s; pila = []; rotulo = null; intro = true
      continue
    }
    const hist = actual && linea.match(RE_HISTORIA)
    if (hist) { actual.historia ??= plano(hist[1]).slice(0, 600); if (actual.descripcion) intro = false }
    else if (actual && intro) {
      if (!linea.trim()) { if (actual.descripcion) intro = false }
      else if (esParrafo(linea)) actual.descripcion = actual.descripcion ? `${actual.descripcion} ${plano(linea)}` : plano(linea)
      else intro = false
    }
    const m = actual && linea.match(RE_TAREA)
    if (actual && !actual.plan) { const pl = linea.match(/plans\/([A-Za-z0-9_-]+\.md)/); if (pl) actual.plan = pl[1] }
    if (actual) {
      const celdas = linea.split(/(?<!\\)\|/).map((c) => c.trim())
      const mod = celdas.length >= 4 && celdas[2].match(/\*{0,2}(Opus|Sonnet|Haiku|Fable)\*{0,2}/i)
      const k = mod && plano(celdas[1]).match(/^[A-Z]\d+[a-z]?\b/)
      if (k) (actual.filas ||= []).push({ clave: k[0], modelo: mod[1] })
    }
    if (!m) {
      // Planes de Claude: sin casillas; sus pasos son los ítems de lista de primer nivel.
      const li = actual && linea.match(RE_ITEM)
      if (li) actual.items.push({ texto: li[2].trim().slice(0, 1500), numero: li[1].match(/\d+/)?.[0] || null })
      continue
    }
    const sangria = m[1].length
    const { texto: limpio, marcas } = extraerMarcas(m[3].trim())
    const tarea = { texto: limpio.slice(0, 1500), hecha: /x/i.test(m[2]), linea: i, hijas: [], ...(/[~-]/.test(m[2]) ? { marca: m[2] } : {}), ...(Object.keys(marcas).length ? { marcas } : {}) }
    while (pila.length && pila.at(-1).sangria >= sangria) pila.pop()
    ;(pila.length ? pila.at(-1).tarea.hijas : actual.tareas).push(tarea)
    pila.push({ sangria, tarea })
  }
  if (cita) emitir(cita.lineas, cita.rotulo, true)
  // El modelo de cada prompt sale de la fila de la tabla de sesiones de su sección.
  for (const s of aplanar(raiz)) {
    for (const p of s.prompts) { const f = p.clave && s.filas?.find((x) => x.clave === p.clave); if (f) p.modelo = f.modelo }
    delete s.filas
    if (s.descripcion) s.descripcion = s.descripcion.slice(0, 600)
  }
  raiz.forEach(cerrarSeccion)
  return raiz
}
export const aplanar = (arbol) => arbol.flatMap((s) => [s, ...aplanar(s.hijas)])
// «Qué se busca» de un plan de Claude: el primer párrafo bajo «## Context» o «## Contexto».
export const contextoDePlan = (arbol) => aplanar(arbol).find((s) => /^contexto?\b/i.test(plano(s.titulo)))?.descripcion ?? null

// «- Para retomar (fecha): …» en «## Estado»: lo escribe quien cierra la sesión (/relevo), en lenguaje natural.
// Las líneas sangradas que siguen son parte de la misma viñeta. Devuelve la de fecha más reciente (empate: la primera).
const RE_RETOMAR = /^[-*]\s+\**\s*Para retomar\s*\(([^)]*)\)\s*:?\s*\**\s*:?\s*(.*)$/i
export function retomarDe(estadoTxt) {
  const lineas = String(estadoTxt ?? '').split('\n')
  let mejor = null
  lineas.forEach((l, i) => {
    const m = l.match(RE_RETOMAR)
    if (!m) return
    const partes = [m[2]]
    for (let j = i + 1; j < lineas.length && /^\s+\S/.test(lineas[j]) && !/^\s*[-*]\s/.test(lineas[j]); j++) partes.push(lineas[j].trim())
    const texto = plano(partes.join(' ')).replace(/\s+/g, ' ')
    if (texto && (!mejor || m[1].trim() > mejor.fecha)) mejor = { fecha: m[1].trim(), texto }
  })
  return mejor
}

// «Estás aquí»: lo que nombra la primera línea de «## Estado» (prefiere «Siguiente: X»;
// si lo nombrado está cerrado o ya hecho, la sección siguiente no hecha); si no, la primera sección no terminada.
export function estasAqui(arbol, estadoTxt = '') {
  const pasos = aplanar(arbol).filter((s) => s.estado !== 'doc')
  let enRetomar = false
  const linea = String(estadoTxt).split('\n').find((l) => {
    if (RE_RETOMAR.test(l)) return !(enRetomar = true)
    if (enRetomar && /^\s+\S/.test(l)) return false
    enRetomar = false
    return l.trim()
  }) || ''
  const sig = linea.match(/Siguiente:?\**\s*\**\s*([HS]\d+[a-z]?)\b/)
  const ref = sig || linea.match(/\b([HS]\d+[a-z]?)\b/)
  if (ref) {
    const i = pasos.findIndex((s) => s.clave === ref[1])
    if (i >= 0) {
      const cerrado = !sig && /CERRAD|terminad|complet|✅/i.test(linea.slice(ref.index, ref.index + 40))
      const s = cerrado || pasos[i].estado === 'hecho' ? pasos.slice(i + 1).find((x) => x.estado !== 'hecho') : pasos[i]
      if (s) return s.id
    }
  }
  return pasos.find((s) => s.estado !== 'hecho')?.id || null
}

// Frente activo: dónde se está editando de verdad, según el historial del backlog (la entrada más reciente manda).
// Devuelve { seccion, tarea, subsesiones, plan } del hito tocado si aún tiene casillas abiertas; si no, null (manda «estás aquí»).
const RE_SUB = /^\s*[-*]\s+\*\*(S\d+[a-z]?)\b\s*[—–-]?\s*(.*?)\*\*(.*)$/
const RE_CASILLA = /^\s*[-*] \[([ xX-])\]\s?(.*)$/
const sangria = (l) => l.match(/^\s*/)[0].length
const abierta = (s) => s.estado === 'en-curso' || s.estado === 'pendiente'
// «**Personas mal migradas (PR aparte):** ~32 registros…» → «Personas mal migradas»
const tituloTarea = (t) => plano((t.match(/^\*\*(.+?)\*\*/) || [, t])[1]).replace(/\s*:\s*$/, '').replace(/\s*\([^()]*\)\s*$/, '').slice(0, 120)
export function frenteActivo(b, entradas = [], planes = []) {
  const crudas = String(b.contenido || '').split('\n')
  const lineas = crudas.map((l) => l.replace(/\t/g, '    '))
  const arbol = b.estructura || []
  const secciones = aplanar(arbol)
  const hitoDe = (s) => arbol.find((h) => h === s || aplanar(h.hijas).includes(s)) || s
  // Rango de una tarea: hasta la siguiente línea no vacía con igual o menor sangría, o un título.
  const fin = (linea) => {
    const base = sangria(lineas[linea])
    let j = linea + 1
    while (j < lineas.length && (!lineas[j].trim() || (!RE_TITULO.test(lineas[j]) && sangria(lineas[j]) > base))) j++
    return j
  }
  const tareas = []
  const recorrer = (ts, prof, sec) => ts.forEach((t) => { tareas.push({ t, prof, sec, fin: fin(t.linea) }); recorrer(t.hijas, prof + 1, sec) })
  for (const s of secciones) recorrer(s.tareas, 0, s)

  const ubicar = (L) => {
    const sec = secciones.filter((s) => s.linea <= L).at(-1)
    if (!sec || sec.estado === 'doc') return null
    const hito = hitoDe(sec)
    if (!abierta(hito)) return null
    // La tarea abierta más profunda que contiene la línea y tiene hijas (si no, la abierta más profunda).
    const cadena = tareas.filter((x) => x.sec === sec && x.t.linea <= L && L < x.fin && !x.t.hecha && x.t.marca !== '-')
    return { L, sec, hito, x: cadena.filter((x) => x.t.hijas.length).at(-1) || cadena.at(-1) || null }
  }
  for (const e of [...entradas].reverse()) {
    if (e.inicial) continue
    const cands = (e.anadidas || []).flatMap((a) => crudas.flatMap((l, L) => (l.trimEnd() === a ? [ubicar(L)] : []))).filter(Boolean)
    if (!cands.length) continue
    const elegido = cands.sort((p, q) => (!!p.x - !!q.x) || ((p.x?.prof ?? 0) - (q.x?.prof ?? 0)) || (p.L - q.L)).at(-1)
    return construirFrente(b, lineas, elegido, planes)
  }
  return null
}
function construirFrente(b, lineas, { sec, hito, x }, planes) {
  const seccion = abierta(sec) ? sec : aplanar(hito.hijas).find(abierta) || hito
  if (seccion !== sec) x = null
  let tarea = null
  const subsesiones = []
  const bloques = new Map() // sub-sesión -> sus líneas (para buscar menciones de plan)
  let sig = null
  if (x) {
    const rango = lineas.slice(x.t.linea + 1, x.fin)
    const abiertas = []
    let hechas = 0, total = 0, sub = null
    for (const l of rango) {
      // El bloque de una sub-sesión acaba en la siguiente línea con igual o menor sangría («- Después: …»).
      if (sub && l.trim() && sangria(l) <= sub.sangria) sub = null
      const s = l.match(RE_SUB)
      if (s) {
        sub = { clave: s[1], titulo: plano(s[2]).replace(/\s*[—–-]\s*$/, ''), estado: 'pendiente', hechas: 0, total: 0, abiertas: [], texto: plano(l.replace(/^\s*[-*]\s+/, '')), sangria: sangria(l) }
        subsesiones.push(sub); bloques.set(sub, [l]); continue
      }
      if (sub) bloques.get(sub).push(l)
      const c = l.match(RE_CASILLA)
      if (!c) continue
      const hecha = c[1] !== ' '
      total++; if (hecha) hechas++; else abiertas.push(plano(c[2]))
      if (sub) { sub.total++; if (hecha) sub.hechas++; else sub.abiertas.push(plano(c[2])) }
    }
    for (const s of subsesiones) { delete s.sangria; if (s.total && s.hechas === s.total) s.estado = 'hecho' }
    sig = subsesiones.find((s) => s.estado !== 'hecho' && /\bsiguiente\b/i.test(s.texto)) || subsesiones.find((s) => s.estado !== 'hecho') || null
    if (sig) sig.estado = 'siguiente'
    // «Falta» es de la sub-sesión siguiente; sin sub-sesiones, de toda la tarea.
    tarea = { texto: x.t.texto, titulo: tituloTarea(x.t.texto), linea: x.t.linea, hechas, total, abiertas: sig ? sig.abiertas : abiertas }
  }
  const { plan, planDe } = planDelFrente(b, lineas, { seccion, hito, x, subsesiones, sig, bloques }, planes)
  return { seccion: seccion.id, tarea, subsesiones, plan, planDe }
}

// Plan del frente, de lo más concreto a lo más general:
// (a) mención en la sub-sesión siguiente; (b) en la hecha más reciente; (c) plan cuyo nombre o título lleva la clave
// de la sub-sesión (o de una anterior) y el backlog o el hito; (d) mención en la tarea; (e) título con la clave del hito.
// `planDe` = clave de la sub-sesión anterior de la que sale el plan (la tarjeta lo rotula «Plan (de S3)»).
const RE_PLAN = /plans\/([A-Za-z0-9_-]+\.md)/
const fichas = (t) => String(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
function planDelFrente(b, lineas, { seccion, hito, x, subsesiones, sig, bloques }, planes) {
  const clave = hito.clave || seccion.clave
  if (sig) {
    const previas = subsesiones.slice(0, subsesiones.indexOf(sig)).reverse()
    const hecha = previas.find((s) => s.estado === 'hecho')
    for (const s of [sig, hecha].filter(Boolean)) {
      const m = bloques.get(s).join('\n').match(RE_PLAN)?.[1]
      if (m) return { plan: m, planDe: s === sig ? null : s.clave }
    }
    const archivo = b.archivo.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const delBacklog = (p) => p.nombre.toLowerCase().includes(archivo) || p.titulo.includes(b.archivo) || (clave && (fichas(p.nombre).includes(clave.toLowerCase()) || new RegExp(`\\b${clave}\\b`).test(p.titulo)))
    for (const s of [sig, ...previas]) {
      const k = s.clave.toLowerCase()
      const p = planes.find((p) => (fichas(p.nombre).includes(k) || fichas(p.titulo).includes(k)) && delBacklog(p))
      if (p) return { plan: p.nombre, planDe: s === sig ? null : s.clave }
    }
  }
  const mencion = x && lineas.slice(x.t.linea, x.fin).join('\n').match(RE_PLAN)?.[1]
  const porTitulo = clave && planes.find((p) => new RegExp(`\\b${clave}\\b`).test(p.titulo) && (!/\bBACKLOG\w*\.md\b/i.test(p.titulo) || p.titulo.includes(b.archivo)))?.nombre
  return { plan: mencion || porTitulo || (x ? null : seccion.plan || hito.plan) || null, planDe: null }
}

// Filas «| **N — nombre** (duración) | contenido | verificación |» de la tabla de hitos de un PLAN.
export function hitosDePlan(texto) {
  const hitos = []
  for (const linea of String(texto).split('\n')) {
    const celdas = linea.split(/(?<!\\)\|/).map((c) => c.trim())
    const m = celdas[1]?.match(/^\*\*(\d+)\s*(?:[—–-]\s*([^*]+?))?\s*\*\*\s*(?:\(([^)]*)\))?/)
    if (!m || celdas.length < 4) continue
    hitos.push({ n: +m[1], clave: `H${m[1]}`, nombre: m[2] || '', duracion: m[3] || '', contenido: celdas[2], verificacion: celdas[3] || '' })
  }
  return hitos
}

// Vínculos por nombre: BACKLOG_H4.md cuelga de «## H4» de otro backlog; PLAN_X_* se empareja con BACKLOG_X*.
export function vincular(backlogs) {
  for (const b of backlogs) {
    const hito = b.archivo.match(/^BACKLOG_(H\d+)\b/i)?.[1]?.toUpperCase()
    if (hito) {
      for (const o of backlogs) {
        if (o === b || o.esPlan) continue
        const s = aplanar(o.estructura).find((x) => x.clave === hito)
        if (s) { s.vinculo = b.archivo; b.padre = { archivo: o.archivo, clave: hito, id: s.id }; break }
      }
    }
    if (b.esPlan) {
      const token = b.archivo.match(/^PLAN_([^_.]+)/i)?.[1]
      const pareja = token && backlogs.find((x) => !x.esPlan && new RegExp(`^BACKLOG_${token}\\b`, 'i').test(x.archivo))
      if (pareja) { b.pareja = pareja.archivo; b.hitos = hitosDePlan(b.contenido) }
    }
  }
  return backlogs
}
function seccionEstado(texto) {
  const m = texto.match(/^## Estado[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)
  return m ? m[1].trim() : ''
}
function leerBacklogs(p) {
  const patron = new RegExp(p.patronBacklogs || '^BACKLOG.*\\.md$', 'i')
  const lista = []
  for (const dir of p.docs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!patron.test(f)) continue
      const ruta = join(dir, f)
      const contenido = readFileSync(ruta, 'utf8')
      lista.push({
        archivo: f, ruta, modificado: statSync(ruta).mtime.toISOString(), contenido,
        ...contarCasillas(contenido), estado: seccionEstado(contenido), esPlan: /^PLAN/i.test(f),
      })
      const ult = lista.at(-1)
      ult.estructura = estructura(contenido)
      ult.aqui = estasAqui(ult.estructura, ult.estado)
    }
  }
  return vincular(lista.sort((a, b) => (a.esPlan - b.esPlan) || b.modificado.localeCompare(a.modificado)))
}

// ---------- Historial de cambios de cada backlog ----------
function diffLineas(viejo, nuevo) {
  const cuenta = (t) => t.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map())
  const a = cuenta(viejo), b = cuenta(nuevo)
  const resta = (x, y) => [...x].flatMap(([l, n]) => Array(Math.max(0, n - (y.get(l) || 0))).fill(l))
  return { anadidas: resta(b, a).slice(0, 60), quitadas: resta(a, b).slice(0, 60) }
}
function actualizarHistorial(p, backlogs) {
  const rutaH = join(DATOS, `historial-${p.id}.json`)
  const historial = leerJson(rutaH, {})
  const dirUlt = join(DATOS, 'ultimos', p.id)
  mkdirSync(dirUlt, { recursive: true })
  for (const b of backlogs) {
    const hash = createHash('sha1').update(b.contenido).digest('hex')
    const entradas = (historial[b.archivo] ||= [])
    if (entradas.at(-1)?.hash === hash) continue
    const rutaUlt = join(dirUlt, b.archivo)
    const previo = existsSync(rutaUlt) ? readFileSync(rutaUlt, 'utf8') : null
    entradas.push({
      fecha: b.modificado, hash, hechas: b.hechas, total: b.total,
      ...(previo === null ? { inicial: true, anadidas: [], quitadas: [] } : diffLineas(previo, b.contenido)),
    })
    writeFileSync(rutaUlt, b.contenido)
  }
  writeFileSync(rutaH, JSON.stringify(historial, null, 1))
  return historial
}

// ---------- Planes de Claude (~/.claude/plans), asignados por transcripción ----------
// Plan -> proyecto con más menciones (empate: el primero en proyectos.json). Pura: la usan leerPlanes y los tests.
// menciones: Map(proyectoId -> Map(nombre -> Map(carpeta -> veces))).
export function asignarPlanes(menciones, manuales = new Map()) {
  const dueno = new Map()
  for (const [id, planes] of menciones) {
    for (const [nombre, carpetas] of planes) {
      const total = [...carpetas.values()].reduce((a, b) => a + b, 0)
      const previo = dueno.get(nombre)
      if (!previo || total > previo.total) dueno.set(nombre, { id, total })
    }
  }
  return new Map([...dueno].map(([nombre, { id }]) => [nombre, manuales.get(nombre) ?? id]))
}
function contarMenciones() {
  const menciones = new Map()
  for (const p of proyectos) {
    const planes = new Map()
    for (const d of p.transcripciones && existsSync(TRANSCRIPCIONES) ? readdirSync(TRANSCRIPCIONES) : []) {
      if (!d.startsWith(p.transcripciones)) continue
      const salida = sh('grep', ['-ohE', 'plans/[A-Za-z0-9_-]+\\.md', '-r', '--include=*.jsonl', join(TRANSCRIPCIONES, d)], undefined, 20000) || ''
      const carpeta = d.slice(p.transcripciones.length).replace(/^-/, '') || '(raíz)'
      for (const m of salida.split('\n').filter(Boolean)) {
        const nombre = basename(m)
        if (!planes.has(nombre)) planes.set(nombre, new Map())
        planes.get(nombre).set(carpeta, (planes.get(nombre).get(carpeta) || 0) + 1)
      }
    }
    menciones.set(p.id, planes)
  }
  return menciones
}
function leerPlanes(p, menciones, duenos) {
  const usados = new Map((p.planes || []).map((n) => [n, new Set(['(asignado)'])])) // nombre -> Set(carpeta)
  for (const [nombre, carpetas] of menciones.get(p.id) || []) {
    if (duenos.get(nombre) !== p.id) continue
    if (!usados.has(nombre)) usados.set(nombre, new Set())
    for (const c of carpetas.keys()) usados.get(nombre).add(c)
  }
  return [...usados].flatMap(([nombre, carpetas]) => {
    const ruta = join(PLANES, nombre)
    if (!existsSync(ruta)) return []
    const contenido = readFileSync(ruta, 'utf8')
    const titulo = (contenido.match(/^#\s+(.+)$/m) || [, nombre])[1].trim()
    const arbol = estructura(contenido)
    return [{ nombre, ruta, titulo, contexto: contextoDePlan(arbol), carpetas: [...carpetas], modificado: statSync(ruta).mtime.toISOString(), contenido, estructura: arbol, aqui: estasAqui(arbol, seccionEstado(contenido)) }]
  }).sort((a, b) => b.modificado.localeCompare(a.modificado))
}

// ---------- GitHub y git ----------
// Ramas locales y de origin fusionadas por nombre: [{ nombre, oid, fecha, local, remota, seguimiento }]
export function fusionarRamas(salida) {
  const ramas = new Map()
  for (const l of String(salida).split('\n').filter(Boolean)) {
    const [ref, oid, fecha, seguimiento] = l.split('\x1f')
    const remota = ref.startsWith('refs/remotes/')
    const nombre = ref.replace(/^refs\/(heads|remotes\/[^/]+)\//, '')
    if (nombre === 'HEAD' || ref.endsWith('/HEAD')) continue
    const r = ramas.get(nombre) || { nombre, oid, fecha, local: false, remota: false, seguimiento: '' }
    if (remota) r.remota = true
    else Object.assign(r, { local: true, oid, fecha, seguimiento: (seguimiento || '').replace(/[[\]]/g, '') })
    if (fecha > r.fecha) r.fecha = fecha
    ramas.set(nombre, r)
  }
  return [...ramas.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
}
// Carriles del grafo (estilo `git log --graph`), commits en orden topológico.
// Por fila: col del commit, carriles vivos antes/después, los que convergen en él y los que nacen de él.
export function grafoRamas(commits) {
  const carriles = []
  const libre = (evitar) => { const i = carriles.findIndex((x, j) => x == null && j !== evitar); return i < 0 ? carriles.length : i }
  const vivos = () => carriles.flatMap((x, i) => x == null ? [] : [i])
  return commits.map((c) => {
    let col = carriles.indexOf(c.oid)
    const tieneArriba = col >= 0
    if (col < 0) { col = libre(); carriles[col] = c.oid }
    const antes = vivos()
    const convergen = antes.filter((i) => i !== col && carriles[i] === c.oid)
    for (const i of convergen) carriles[i] = null
    carriles[col] = c.padres[0] ?? null
    const nacen = []
    for (const p of c.padres.slice(1)) {
      let j = carriles.indexOf(p)
      if (j < 0) { j = libre(col); carriles[j] = p }
      nacen.push(j)
    }
    while (carriles.length && carriles.at(-1) == null) carriles.pop()
    return { col, tieneArriba, antes, despues: vivos(), convergen, nacen }
  })
}

// Añade «- [ ] texto» al final de la lista de «## Abiertas» (crea la sección si falta).
export function anadirNota(contenido, texto) {
  const linea = `- [ ] ${String(texto).replace(/\s*\n\s*/g, ' ').trim()}`
  const lineas = String(contenido).split('\n')
  const ini = lineas.findIndex((l) => /^## Abiertas\b/.test(l))
  if (ini < 0) return `${String(contenido).trimEnd()}\n\n## Abiertas\n\n${linea}\n`
  let fin = lineas.findIndex((l, i) => i > ini && /^## /.test(l))
  if (fin < 0) fin = lineas.length
  let pos = ini + 1
  for (let i = ini + 1; i < fin; i++) if (/^\s*[-*] \[[ xX]\]/.test(lineas[i]) || (/^\s+\S/.test(lineas[i]) && pos === i)) pos = i + 1
  if (pos === ini + 1) { while (pos < fin && (!lineas[pos].trim() || /^>/.test(lineas[pos]))) pos++; lineas.splice(pos, 0, linea, ''); }
  else lineas.splice(pos, 0, linea)
  return lineas.join('\n')
}

function leerRamas(repo) {
  return fusionarRamas(sh('git', ['for-each-ref', 'refs/heads', 'refs/remotes/origin',
    '--format=%(refname)%1f%(objectname)%1f%(committerdate:iso-strict)%1f%(upstream:track)'], repo) || '')
}
function leerGit(p) {
  if (!p.repo || !existsSync(p.repo)) return null
  const rutaCache = join(DATOS, `github-${p.id}.json`)
  const cache = leerJson(rutaCache, {})
  const url = (sh('gh', ['repo', 'view', '--json', 'url', '-q', '.url'], p.repo) || '').trim() || cache.url || ''
  const prsCrudo = sh('gh', ['pr', 'list', '--state', 'all', '--limit', '40', '--json',
    'number,title,state,isDraft,headRefName,baseRefName,url,createdAt,mergedAt,commits,body'], p.repo, 20000)
  const prs = prsCrudo ? JSON.parse(prsCrudo).map((pr) => ({
    ...pr, body: (pr.body || '').slice(0, 4000),
    commits: (pr.commits || []).map((c) => ({ oid: c.oid, titulo: c.messageHeadline })),
  })) : cache.prs || []
  const log = sh('git', ['log', '--branches', '--remotes', '--topo-order', '-n', '80', '--date=iso-strict', '--pretty=format:%H%x1f%P%x1f%ad%x1f%an%x1f%s%x1f%D'], p.repo) || ''
  const commits = log.split('\n').filter(Boolean).map((l) => {
    const [oid, padres, fecha, autor, titulo, refs] = l.split('\x1f')
    return { oid, padres: padres ? padres.split(' ') : [], fecha, autor, titulo, refs }
  })
  const rama = (sh('git', ['branch', '--show-current'], p.repo) || '').trim()
  const sinPush = (sh('git', ['log', '--branches', '--not', '--remotes', '--pretty=%H'], p.repo) || '').split('\n').filter(Boolean)
  // Ramas locales sin fusionar en la principal (origin/HEAD, si no main): las casillas hechas en ellas van «En prueba».
  const principal = (sh('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], p.repo) || '').trim() || 'main'
  const sinFusionar = (sh('git', ['for-each-ref', `--no-merged=${principal}`, 'refs/heads', '--format=%(refname:short)'], p.repo) || '').split('\n').filter(Boolean)
  const datos = { url, prs, commits, rama, sinPush, sinFusionar, ramas: leerRamas(p.repo), grafo: grafoRamas(commits), actualizadoGh: prsCrudo ? new Date().toISOString() : cache.actualizadoGh || null }
  writeFileSync(rutaCache, JSON.stringify({ url, prs, actualizadoGh: datos.actualizadoGh }))
  return datos
}

// ---------- Integraciones (GitHub Projects, Trello, Azure DevOps) ----------
// Al generar solo se LEE afuera (timeout corto, caché en datos/externo-<proyecto>.json); con «auto: true» se
// aplican además las acciones que no son conflicto. Las credenciales jamás llegan al HTML.
const LECTURA_MS = 8000
const rutaInstantanea = (p, cfg) => join(DATOS, `sync-${p.id}-${cfg.id}.json`)
const hashDe = (t) => createHash('sha1').update(t).digest('hex')
const conTiempo = (promesa, ms) => Promise.race([promesa, new Promise((_, mal) => setTimeout(() => mal(new Error(`Sin conexión: no respondió en ${ms / 1000} s.`)), ms).unref())])
export class ErrorSincronia extends Error { constructor(msg, estado, extra) { super(msg); Object.assign(this, { estado, extra }) } }
// «modo: 'lectura'» y «'participar'»: solo se lee afuera; ni backlog, ni crear/actualizar, ni instantánea, ni sincronía.
// En «participar» además puedes asignarte ítems y cambiarles el estado afuera (endpoints /api/integraciones/asignar y /estado).
const esLectura = noEscribeMd
const SOLO_LECTURA = 'Esta integración es de solo lectura: no se sincroniza nada (ni afuera ni en el backlog).'
const SOLO_PARTICIPAR = 'Esta integración está en modo participar: te asignas ítems y cambias su estado afuera, pero no se sincroniza con un backlog.'
const AVISO_PRIMERA = 'Primera sincronía: usa la vista previa («Sincronizar») para elegir qué se crea; «auto» no aplica nada hasta entonces.'

// Todo lo necesario para sincronizar una integración: config, backlog, adaptador enlazado y credenciales.
// En solo lectura: backlog null y el adaptador enlazado solo trae «leer» (aunque alguien llegara a aplicar, no hay con qué escribir).
function contextoIntegracion(p, cfg, backlogs, adaptadores) {
  const lectura = esLectura(cfg)
  const backlog = lectura ? null : backlogs.find((b) => b.archivo === cfg.backlog)
  if (!lectura && !backlog) throw new ErrorSincronia(`No encuentro «${cfg.backlog}» en las carpetas «docs» del proyecto.`, 400)
  const mod = adaptadores[cfg.tipo]
  if (!mod) throw new ErrorSincronia(`El conector «${NOMBRES[cfg.tipo] || cfg.tipo}» aún no está disponible en esta versión.`, 400, { estado: 'sin-conector' })
  const { datos, aviso } = leerCredenciales()
  const { cred, faltan, paso } = credencialesPara(cfg, datos)
  if (faltan.length) throw new ErrorSincronia(`Falta credencial: ${faltan.join(', ')}.`, 400, { estado: 'falta-credencial', paso })
  const deps = { memo: new Map() }
  const adaptador = { leer: () => mod.leer(cfg, cred, deps) }
  // Participar: solo asignar y cambiar estado de ítems existentes; nunca crear ni actualizar.
  if (cfg.modo === 'participar') {
    if (mod.asignar) adaptador.asignar = (id, correo) => mod.asignar(cfg, cred, id, correo, deps)
    if (mod.cambiarEstado) adaptador.cambiarEstado = (id, estado, op) => mod.cambiarEstado(cfg, cred, id, estado, deps, op)
    if (mod.quienSoy) adaptador.quienSoy = () => mod.quienSoy(cfg, cred, deps)
  }
  if (!lectura) Object.assign(adaptador, {
    crear: (c, cr, t) => mod.crear(c, cr, t, deps),
    actualizar: (c, cr, id, x) => mod.actualizar(c, cr, id, x, deps),
  })
  return { backlog, adaptador, cred, aviso }
}

// Vista previa (elegidas == null) o aplicación. Orden al aplicar: afuera → una escritura del .md → instantánea.
export async function sincronizar(p, idIntegracion, { elegidas = null, resoluciones = {}, hashPrevio, adaptadores = ADAPTADORES, rutasPermitidas } = {}) {
  const cfg = (p.integraciones || []).find((x) => x.id === idIntegracion)
  if (!cfg) throw new ErrorSincronia('Esa integración no está en proyectos.json.', 404)
  if (esLectura(cfg)) throw new ErrorSincronia(cfg.modo === 'participar' ? SOLO_PARTICIPAR : SOLO_LECTURA, 400, { estado: 'solo-lectura' })
  const ctx = contextoIntegracion(p, cfg, leerBacklogs(p), adaptadores)
  const ruta = ctx.backlog.ruta
  if (rutasPermitidas && !rutasPermitidas.has(ruta)) throw new ErrorSincronia('Ese archivo no lo administra el tablero.', 403)
  const contenido = readFileSync(ruta, 'utf8'), hash = hashDe(contenido)
  if (hashPrevio !== undefined && hashPrevio !== hash) throw new ErrorSincronia(`${cfg.backlog} cambió desde la vista previa: vuelve a pulsar Sincronizar.`, 409)
  const fuera = await conTiempo(ctx.adaptador.leer(), 15000)
  // Sin instantánea es la primera sincronía: la vista lo avisa y «auto» no aplica nada (crearía un ítem por casilla).
  const primera = !existsSync(rutaInstantanea(p, cfg))
  const instantanea = leerJson(rutaInstantanea(p, cfg), {})
  const acciones = planificarSincronia(tareasLocales(contenido, cfg.id), fuera.items, instantanea)
  if (elegidas == null) {
    const conteo = { 'crear-fuera': acciones.filter((a) => a.tipo === 'crear-fuera').length, traer: acciones.filter((a) => a.tipo === 'traer').length }
    return { acciones, hash, url: fuera.url, backlog: cfg.backlog, primera, conteo }
  }
  if (elegidas === 'auto' && primera) return { acciones, resultados: [], aviso: AVISO_PRIMERA }
  // «auto»: todo menos conflictos (y las huérfanas, que solo se informan).
  if (elegidas === 'auto') elegidas = new Set(acciones.filter((a) => a.tipo !== 'conflicto' && a.tipo !== 'huerfana').map((a) => a.clave))
  const r = await aplicarSincronia({
    contenido, integracion: cfg.id, acciones, elegidas, resoluciones, externos: fuera.items, instantanea,
    adaptador: ctx.adaptador, cfg, cred: ctx.cred,
  })
  if (r.contenido !== contenido) {
    if (readFileSync(ruta, 'utf8') !== contenido) throw new ErrorSincronia(`${cfg.backlog} cambió mientras se sincronizaba; lo de afuera ya se aplicó: ${JSON.stringify(r.resultados.filter((x) => x.id))}.`, 409)
    writeFileSync(ruta, r.contenido)
  }
  mkdirSync(DATOS, { recursive: true })
  writeFileSync(rutaInstantanea(p, cfg), JSON.stringify(r.instantanea, null, 1))
  const rutaExt = join(DATOS, `externo-${p.id}.json`), cache = leerJson(rutaExt, {})
  cache[cfg.id] = { ...cache[cfg.id], ultimaSincronia: new Date().toISOString() }
  writeFileSync(rutaExt, JSON.stringify(cache))
  return { acciones, resultados: r.resultados }
}

// Datos de cada integración para el HTML: estado, ítems por columna y cuántos cambios hay por sincronizar.
// Campos de la lista blanca de una integración (sin secretos: no los hay en proyectos.json) para precargar el formulario de edición.
const configVisible = (cfg) => Object.fromEntries(Object.entries(cfg).filter(([k]) => [...COMUNES, ...(CAMPOS[cfg.tipo] ? [...CAMPOS[cfg.tipo].obligatorios, ...CAMPOS[cfg.tipo].opcionales] : [])].includes(k)))
async function leerIntegraciones(p, backlogs, { adaptadores = ADAPTADORES, aplicarAuto = true } = {}) {
  if (!p.integraciones?.length) return []
  const rutaExt = join(DATOS, `externo-${p.id}.json`), cache = leerJson(rutaExt, {})
  const salida = await Promise.all(p.integraciones.map(async (cfg) => {
    const lectura = esLectura(cfg)
    const base = { id: cfg.id, tipo: cfg.tipo, nombre: NOMBRES[cfg.tipo] || cfg.tipo, modo: cfg.modo || 'sincronizar', backlog: lectura ? null : cfg.backlog, auto: !lectura && !!cfg.auto, config: configVisible(cfg), ultimaSincronia: cache[cfg.id]?.ultimaSincronia || null }
    let ctx
    try { ctx = contextoIntegracion(p, cfg, backlogs, adaptadores) } catch (e) {
      return { ...base, estado: e.extra?.estado || 'error', mensaje: e.message, paso: e.extra?.paso || null }
    }
    let fuera, error = null
    try {
      fuera = await conTiempo(ctx.adaptador.leer(), LECTURA_MS)
      cache[cfg.id] = { ...cache[cfg.id], url: fuera.url, titulo: fuera.titulo, columnas: fuera.columnas, items: fuera.items, avisos: fuera.avisos, fecha: new Date().toISOString() }
    } catch (e) { error = String(e?.message || e); fuera = cache[cfg.id]?.items ? cache[cfg.id] : null }
    const acciones = fuera && !lectura ? planificarSincronia(tareasLocales(ctx.backlog.contenido, cfg.id), fuera.items, leerJson(rutaInstantanea(p, cfg), {})) : []
    const porTipo = acciones.reduce((m, a) => ({ ...m, [a.tipo]: (m[a.tipo] || 0) + 1 }), {})
    const primera = !lectura && !existsSync(rutaInstantanea(p, cfg))
    const auto = base.auto && !primera && !error && aplicarAuto && acciones.some((a) => a.tipo !== 'conflicto' && a.tipo !== 'huerfana')
    return {
      ...base, estado: error ? 'error' : 'conectado', mensaje: error, aviso: ctx.aviso, avisos: [...(fuera?.avisos || []), ...(base.auto && primera ? [AVISO_PRIMERA] : [])],
      url: fuera?.url || null, titulo: fuera?.titulo || null, columnas: fuera?.columnas || [],
      items: (fuera?.items || []).map(({ id, titulo, hecha, columna, url, tipo, asignado, mio, actualizado, descripcion, prioridad, iteracion, padre }) => ({ id, titulo, hecha, columna, url, tipo, asignado, mio, actualizado, descripcion, prioridad, iteracion, padre })),
      leidoEn: error ? cache[cfg.id]?.fecha || null : new Date().toISOString(), desdeCache: !!error && !!fuera,
      pendientes: acciones.filter((a) => a.tipo !== 'huerfana').length, porTipo, _auto: auto,
    }
  }))
  writeFileSync(rutaExt, JSON.stringify(cache))
  return salida
}

// Asignarse / quitarse un ítem o cambiarle el estado (modo «participar»). Misma ruta para los endpoints y el CLI.
// Errores de validación: ErrorConfig. Errores de afuera: Error con `remoto = true`. Parchea el ítem en datos/externo-<p>.json (sin releer).
export async function participar(p, cfg, { asignar, id, aMi, estado }, adaptadores = ADAPTADORES) {
  if (!cfg) throw new ErrorConfig('Esa integración no está en proyectos.json.', 404)
  if (cfg.modo !== 'participar') throw new ErrorConfig(`Solo puedes asignarte ítems o cambiar su estado en una integración en modo «participar» (pon "modo": "participar" en la integración «${cfg.id}» de proyectos.json o elígelo en Editar proyecto).`)
  const mod = adaptadores[cfg.tipo]
  if (!mod?.asignar || !mod?.cambiarEstado) throw new ErrorConfig(`${NOMBRES[cfg.tipo] || cfg.tipo}: este conector aún no participa.`)
  id = String(id ?? '')
  if (!/^\d+$/.test(id)) throw new ErrorConfig('Falta el id del ítem (solo números).')
  if (asignar && typeof aMi !== 'boolean') throw new ErrorConfig('«aMi» debe ser sí o no.')
  const rutaExt = join(DATOS, `externo-${p.id}.json`)
  const columnas = leerJson(rutaExt, {})[cfg.id]?.columnas || []
  let elegido
  if (!asignar) {
    elegido = typeof estado === 'string' ? columnas.find((x) => x.toLowerCase() === estado.trim().toLowerCase()) : undefined
    if (!elegido) throw new ErrorConfig(`«${estado}» no es un estado conocido de esta integración${columnas.length ? ` (${columnas.join(', ')})` : ': recarga para leer los estados'}.`)
  }
  const ctx = contextoIntegracion(p, cfg, [], adaptadores)
  let item, yo
  try {
    if (asignar) {
      yo = leerJson(rutaExt, {})[cfg.id]?.yo
      if (aMi && !(yo?.correo && Date.now() - Date.parse(yo.fecha) < 3600e3)) yo = { ...(await conTiempo(ctx.adaptador.quienSoy(), 15000)), fecha: new Date().toISOString() }
      item = await conTiempo(ctx.adaptador.asignar(id, aMi ? yo.correo : null), 15000)
    } else item = await conTiempo(ctx.adaptador.cambiarEstado(id, elegido, { columnas }), 15000)
  } catch (e) { throw Object.assign(e instanceof Error ? e : new Error(String(e)), { remoto: true }) }
  const correoYo = yo?.correo || leerJson(rutaExt, {})[cfg.id]?.yo?.correo
  const cambios = { columna: item.columna, hecha: item.hecha, asignado: item.asignado ?? null }
  // Azure también reasigna al cambiar el estado: `mio` se recalcula en ambos casos.
  cambios.mio = !!item.asignado && ((asignar && aMi) || (!!correoYo && item.asignado.correo?.toLowerCase() === correoYo.toLowerCase()))
  const ext = leerJson(rutaExt, {})
  ext[cfg.id] = { ...ext[cfg.id], ...(yo ? { yo } : {}) }
  const enCache = ext[cfg.id].items?.find((x) => String(x.id) === id)
  if (enCache) Object.assign(enCache, cambios)
  mkdirSync(DATOS, { recursive: true })
  writeFileSync(rutaExt, JSON.stringify(ext))
  return { id, cambios, enCache, titulo: enCache?.titulo ?? null }
}

// ---- Pedírselo a Claude: --tareas / --asignarme / --estado y la línea del hook ----
const abiertas = (items) => items.filter((x) => !x.hecha)
const esMia = (x) => !!x.mio
const sinDueno = (x) => !x.asignado
// Markdown por estado (orden de `columnas`): #id · tipo · P · iteración · asignado · título · descripción corta · url.
export function textoTareas(items, { sinAsignar = false, mias = false } = {}, { columnas = [], nombre = '', id = '' } = {}) {
  const sel = items.filter((x) => (sinAsignar ? !x.hecha && sinDueno(x) : mias ? esMia(x) : true))
  const orden = [...columnas, ...sel.map((x) => x.columna).filter((c) => c && !columnas.includes(c))]
  const por = new Map()
  for (const x of sel) { const c = x.columna || 'Sin estado'; por.set(c, [...(por.get(c) || []), x]) }
  const filtro = sinAsignar ? ' (sin asignar)' : mias ? ' (mías)' : ''
  const lineas = [`## ${[nombre, id && `\`${id}\``].filter(Boolean).join(' ') || 'Tareas'}${filtro} — ${sel.length} ítem(s)`]
  if (!sel.length) lineas.push('', 'Nada que mostrar con ese filtro.')
  for (const c of [...new Set([...orden, ...por.keys()])]) {
    const g = por.get(c)
    if (!g) continue
    lineas.push('', `### ${c} (${g.length})`)
    for (const x of g) {
      const corta = x.descripcion ? x.descripcion.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
      lineas.push(['#' + x.id, x.tipo, x.prioridad && `P${x.prioridad}`, x.iteracion, x.asignado ? `asignado a ${x.asignado.nombre}${x.mio ? ' (yo)' : ''}` : 'sin asignar', x.titulo, corta, x.url].filter(Boolean).join(' · ').replace(/^/, '- '))
    }
  }
  return lineas.join('\n')
}
// Una línea por integración con caché (sin red): cuántos ítems sin asignar y cuántos míos abiertos, y cómo pedirlos.
export function lineasIntegraciones(p, cache = {}) {
  return (p.integraciones || []).filter((c) => (c.modo === 'participar' || c.modo === 'lectura') && cache[c.id]?.items).map((c) => {
    const it = abiertas(cache[c.id].items)
    return `- ${NOMBRES[c.tipo] || c.tipo} \`${c.id}\`: ${it.filter(sinDueno).length} sin asignar, ${it.filter(esMia).length} mías abiertas. Para recomendarte una: \`node ${join(AQUI, 'generar.mjs')} --tareas ${p.id} --sin-asignar\``
  })
}

function tareasCli() {
  const pos = (flag) => { const i = args.indexOf(flag); return i < 0 ? [] : args.slice(i + 1).filter((a, j, v) => !a.startsWith('--') && v.slice(0, j).every((z) => !z.startsWith('--'))) }
  const valor = (flag) => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1] }
  const accion = ['--tareas', '--asignarme', '--estado'].find((f) => args.includes(f))
  const [pid, id, ...resto] = pos(accion)
  const fallo = (m) => { console.error(m); process.exitCode = 1 }
  const p = proyectos.find((x) => x.id === pid)
  if (!p) return fallo(`Proyecto «${pid ?? ''}» no encontrado. Proyectos: ${proyectos.map((x) => x.id).join(', ')}.`)
  const pedida = valor('--integracion')
  const cands = (p.integraciones || []).filter((c) => (pedida ? c.id === pedida : accion === '--tareas' ? true : c.modo === 'participar'))
  if (!cands.length) return fallo(pedida ? `«${p.id}» no tiene la integración «${pedida}».` : `«${p.id}» no tiene integraciones${accion === '--tareas' ? '' : ' en modo participar (activa "modo": "participar" en proyectos.json o en Editar proyecto)'}.`)
  const cache = leerJson(join(DATOS, `externo-${p.id}.json`), {})
  if (accion === '--tareas') {
    for (const c of cands) {
      const e = cache[c.id]
      if (!e?.items) { console.log(`## ${NOMBRES[c.tipo] || c.tipo} \`${c.id}\`\n\nSin datos todavía: abre el tablero (node generar.mjs) para leerla.`); continue }
      console.log(textoTareas(e.items, { sinAsignar: args.includes('--sin-asignar'), mias: args.includes('--mias') }, { columnas: e.columnas || [], nombre: NOMBRES[c.tipo] || c.tipo, id: c.id }) + '\n')
    }
    return
  }
  const c = cands[0]
  if (cands.length > 1) return fallo(`«${p.id}» tiene varias integraciones en participar (${cands.map((x) => x.id).join(', ')}): indica una con --integracion.`)
  const asignar = accion === '--asignarme'
  const estado = resto.join(' ')
  return participar(p, c, { asignar, id, aMi: !args.includes('--quitar'), estado }).then((r) => {
    const t = r.titulo ? ` «${r.titulo}»` : ''
    console.log(asignar ? (args.includes('--quitar') ? `✓ #${r.id}${t} quedó sin asignar.` : `✓ #${r.id}${t} quedó asignado a ti.`) : `✓ #${r.id}${t} ahora está en «${r.cambios.columna}».`)
  }, (e) => fallo(e.message))
}

// --probar-conexiones: una lectura mínima por integración, con el resultado en español.
async function probarConexiones() {
  let hubo = false
  for (const p of proyectos) for (const cfg of p.integraciones || []) {
    hubo = true
    const titulo = `${p.nombre} · ${cfg.id} (${NOMBRES[cfg.tipo] || cfg.tipo})`
    try {
      const ctx = contextoIntegracion(p, cfg, leerBacklogs(p), ADAPTADORES)
      if (ctx.aviso) console.log(`  ⚠ ${ctx.aviso}`)
      const r = await conTiempo(ctx.adaptador.leer(), 15000)
      const vinculadas = ctx.backlog ? `${tareasLocales(ctx.backlog.contenido, cfg.id).filter((t) => t.marca).length} casillas vinculadas en ${cfg.backlog}` : 'solo lectura (sin backlog)'
      console.log(`✓ ${titulo}: OK · «${r.titulo || ''}» ${r.url || ''} · ${r.items.length} ítems · columnas: ${r.columnas.join(', ')} · ${vinculadas}`)
      for (const a of r.avisos || []) console.log(`  · ${a}`)
    } catch (e) {
      process.exitCode = 1
      console.log(`✗ ${titulo}: ${e.message}${e.extra?.paso ? `\n  → ${e.extra.paso}` : ''}`)
    }
  }
  if (!hubo) console.log('No hay integraciones en proyectos.json (ver «integraciones» en proyectos.ejemplo.json).')
}

// ---------- Notas ----------
function leerNotas(p) {
  if (!p.notas) return null
  if (!existsSync(p.notas)) { mkdirSync(dirname(p.notas), { recursive: true }); writeFileSync(p.notas, PLANTILLA_NOTAS) }
  const contenido = readFileSync(p.notas, 'utf8')
  const abiertasTxt = (contenido.match(/^## Abiertas[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m) || [, ''])[1]
  const abiertas = abiertasTxt.split('\n').filter((l) => /^\s*[-*] \[ \]/.test(l) && !/\(ejemplo\)/.test(l)).map((l) => l.replace(/^\s*[-*] \[ \]\s*/, ''))
  return { ruta: p.notas, contenido, abiertas, modificado: statSync(p.notas).mtime.toISOString() }
}

// ---------- Bitácora de sesiones (campo opcional «bitacora»; varios proyectos pueden compartir archivo) ----------
// Cada fila lleva «proyecto» (por el sid de su transcripción) o null: la pestaña filtra «este proyecto / todas».
function leerBitacoras() {
  const rutas = [...new Set(proyectos.map((p) => p.bitacora).filter((r) => r && existsSync(r)))]
  if (!rutas.length) return new Map()
  const jsonl = new Map()
  const mapa = sidsPorProyecto(proyectos, TRANSCRIPCIONES, jsonl)
  return new Map(rutas.map((ruta) => [ruta, { ruta, modificado: statSync(ruta).mtime.toISOString(), ...asociar(parsearBitacora(readFileSync(ruta, 'utf8')), mapa, jsonl) }]))
}

// Guía «Configurar este proyecto»: un paso por pieza, con lo que ya hay a mano (sin red: GitHub sale de p.git, que ya leyó gh).
export function estadoConfiguracion(p, { git = null, backlogs = [], transcripciones = TRANSCRIPCIONES } = {}) {
  const repo = p.repo && statSync(p.repo, { throwIfNoEntry: false })?.isDirectory()
  const esGit = !!repo && existsSync(join(p.repo, '.git'))
  const docs = (p.docs || []).filter((d) => statSync(d, { throwIfNoEntry: false })?.isDirectory())
  const locales = backlogs.filter((b) => !b.esPlan)
  let sesiones = 0
  if (p.transcripciones && existsSync(transcripciones)) {
    for (const d of readdirSync(transcripciones)) {
      if (d === p.transcripciones || d.startsWith(`${p.transcripciones}-`)) sesiones += readdirSync(join(transcripciones, d)).filter((f) => f.endsWith('.jsonl')).length
    }
  }
  const integ = p.integraciones || []
  return [
    { paso: 'repo', hecho: !!repo, detalle: repo ? p.repo : p.repo ? `No existe la carpeta ${p.repo}` : 'Sin carpeta del repo' },
    { paso: 'git', hecho: esGit, detalle: esGit ? 'Repositorio git' : 'La carpeta no es un repositorio git' },
    { paso: 'github', hecho: !!git?.url, detalle: git?.url || 'Sin remoto en GitHub (o gh sin sesión)' },
    { paso: 'docs', hecho: !!docs.length && docs.length === (p.docs || []).length, detalle: p.docs?.length ? `${docs.length} de ${p.docs.length} carpeta(s) de documentos` : 'Sin carpeta de documentos' },
    { paso: 'backlog', hecho: !!locales.length, detalle: locales.length ? locales.map((b) => b.archivo).join(', ') : 'Sin backlog' },
    { paso: 'sesiones', hecho: sesiones > 0, detalle: sesiones ? `${sesiones} sesión(es) de Claude` : p.transcripciones ? 'Aún no hay sesiones de Claude en esta carpeta' : 'Sin carpeta de transcripciones' },
    { paso: 'notas', hecho: !!p.notas, detalle: p.notas || 'Sin archivo de notas' },
    { paso: 'integraciones', hecho: !!integ.length, detalle: integ.length ? integ.map((x) => x.id).join(', ') : 'Sin integraciones' },
  ]
}

// ---------- Para retomar: hechos automáticos que la vista pone en frases ----------
// La sesión de Claude más reciente del proyecto (su carpeta o subcarpetas «<prefijo>-…»): fecha del .jsonl y su título
// (customTitle, si no aiTitle), leyendo solo las primeras ~20 líneas.
function ultimaSesionDe(prefijo, dir) {
  if (!prefijo || !existsSync(dir)) return null
  let ult = null
  for (const d of readdirSync(dir)) {
    if (d !== prefijo && !d.startsWith(`${prefijo}-`)) continue
    let archivos = []
    try { archivos = readdirSync(join(dir, d)) } catch { continue }
    for (const f of archivos) {
      if (!f.endsWith('.jsonl')) continue
      const ruta = join(dir, d, f)
      const mtime = statSync(ruta, { throwIfNoEntry: false })?.mtimeMs
      if (mtime != null && (!ult || mtime > ult.mtime)) ult = { ruta, mtime }
    }
  }
  if (!ult) return null
  let titulo = null
  try {
    const fd = openSync(ult.ruta, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const lineas = buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0)).split('\n').slice(0, 20)
      const objs = lineas.flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
      titulo = objs.find((o) => o?.customTitle)?.customTitle || objs.find((o) => o?.aiTitle)?.aiTitle || null
    } finally { closeSync(fd) }
  } catch {}
  return { titulo, fecha: new Date(ult.mtime).toISOString() }
}
// p: { transcripciones, git }; b: el backlog principal (con estructura, aqui y, si hay, activo).
export function hechosRetomar(p, b, { transcripciones = TRANSCRIPCIONES, ahora = new Date() } = {}) {
  const git = p?.git || null
  const commit = (git?.commits || []).reduce((m, c) => (!m || Date.parse(c.fecha) > Date.parse(m.fecha) ? c : m), null)
  const sesion = ultimaSesionDe(p?.transcripciones, transcripciones)
  const fechas = [b?.modificado, commit?.fecha, sesion?.fecha].map((f) => Date.parse(f)).filter(Number.isFinite)
  const ult = fechas.length ? Math.max(...fechas) : null
  // Lo siguiente: la sub-sesión siguiente del frente activo; si no, su tarea; si no, la sección «estás aquí».
  let siguiente = null, pendientesSiguiente = 0
  const sub = b?.activo?.subsesiones?.find((s) => s.estado === 'siguiente')
  const secs = aplanar(b?.estructura || [])
  if (sub) {
    siguiente = { clave: sub.clave, titulo: sub.titulo ? `${sub.clave} — ${sub.titulo}` : sub.clave }
    pendientesSiguiente = sub.abiertas.length
  } else if (b?.activo?.tarea) {
    siguiente = { clave: secs.find((s) => s.id === b.activo.seccion)?.clave || null, titulo: b.activo.tarea.titulo }
    pendientesSiguiente = b.activo.tarea.abiertas.length
  } else {
    const sec = secs.find((s) => s.id === b?.aqui)
    if (sec) { siguiente = { clave: sec.clave, titulo: plano(sec.titulo) }; pendientesSiguiente = sec.total - sec.hechas }
  }
  return {
    ultimaActividad: ult == null ? null : new Date(ult).toISOString(),
    diasSinActividad: ult == null ? null : Math.max(0, Math.floor((ahora - ult) / 86400e3)),
    rama: git?.rama || null,
    siguiente, pendientesSiguiente,
    ultimoCommit: commit ? { titulo: commit.titulo, fecha: commit.fecha } : null,
    prsAbiertos: (git?.prs || []).filter((pr) => pr.state === 'OPEN').length,
    commitsSinSubir: git?.sinPush?.length || 0,
    ultimaSesionClaude: sesion,
  }
}

// ---------- Kanban: sesiones de Claude en vivo y columna de cada casilla ----------
// Solo .jsonl tocados en la ventana (24 h); de cada uno, cabeza y cola de 64 KB (nunca el archivo entero) y caché por
// ruta+mtime+size. Fuera de la huella de /api/version: la vista los sondea aparte con GET /api/sesiones.
const TROZO_SESION = 64 * 1024
const EDITORES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const cacheSesiones = new Map()
const textoUsuario = (o) => {
  if (o?.type !== 'user' || o.isMeta) return null
  const c = o.message?.content
  const t = typeof c === 'string' ? c : Array.isArray(c) && !c.some((x) => x?.type === 'tool_result') ? c.filter((x) => x?.type === 'text').map((x) => x.text).join('\n') : ''
  return t && t.trim() && !t.trimStart().startsWith('<') ? t.trim() : null
}
function resumenSesion(ruta, size) {
  const fd = openSync(ruta, 'r')
  const leer = (desde, largo) => { const buf = Buffer.alloc(largo); return buf.toString('utf8', 0, readSync(fd, buf, 0, largo, desde)) }
  const objs = (t) => t.split('\n').flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
  let cabeza, cola
  try {
    if (size <= 2 * TROZO_SESION) cabeza = cola = objs(leer(0, size))
    else {
      // Las líneas partidas por el corte no parsean y se descartan solas.
      cabeza = objs(leer(0, TROZO_SESION))
      cola = objs(leer(size - TROZO_SESION, TROZO_SESION))
    }
  } finally { closeSync(fd) }
  if (!cabeza.length && !cola.length) return null
  const todas = cabeza === cola ? cola : [...cabeza, ...cola]
  const ultimo = (f) => { for (let i = todas.length - 1; i >= 0; i--) { const v = f(todas[i]); if (v) return v } return null }
  const archivos = []
  for (let i = cola.length - 1; i >= 0 && archivos.length < 5; i--) {
    const usos = cola[i]?.type === 'assistant' && Array.isArray(cola[i].message?.content) ? cola[i].message.content : []
    for (const u of [...usos].reverse()) {
      const f = u?.type === 'tool_use' && EDITORES.has(u.name) && (u.input?.file_path || u.input?.notebook_path)
      if (f && !archivos.includes(f) && archivos.length < 5) archivos.push(f)
    }
  }
  const prompts = todas.map(textoUsuario).filter(Boolean)
  const unicos = (re) => [...new Set(prompts.flatMap((t) => t.match(re) || []))]
  return {
    titulo: ultimo((o) => o?.customTitle) || ultimo((o) => o?.aiTitle) || null,
    rama: ultimo((o) => o?.gitBranch),
    inicio: cabeza.find((o) => o?.timestamp)?.timestamp || null,
    archivos,
    ultimoPrompt: prompts.at(-1)?.slice(0, 200) ?? null,
    foco: { claves: unicos(/\b[HS]\d+[a-z]?\b/g), backlogs: unicos(/[\w.-]+\.md\b/g) },
  }
}
// → { [proyectoId]: [{ sid, titulo, rama, inicio, ultimo, activa, archivos, ultimoPrompt, foco }] }, más reciente primero.
export function sesionesActivas(lista, dir = TRANSCRIPCIONES, { ahora = Date.now(), ventanaMs = 24 * 3600e3, activaMs = 5 * 60e3 } = {}) {
  const carpetas = existsSync(dir) ? readdirSync(dir) : []
  return Object.fromEntries(lista.map((p) => {
    const pre = p.transcripciones
    const res = []
    for (const d of pre ? carpetas.filter((d) => d === pre || d.startsWith(`${pre}-`)) : []) {
      let archivos = []
      try { archivos = readdirSync(join(dir, d)) } catch { continue }
      for (const f of archivos) {
        if (!f.endsWith('.jsonl')) continue
        const ruta = join(dir, d, f)
        const st = statSync(ruta, { throwIfNoEntry: false })
        if (!st || ahora - st.mtimeMs > ventanaMs) continue
        let c = cacheSesiones.get(ruta)
        if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) {
          let r = null
          try { r = resumenSesion(ruta, st.size) } catch {}
          cacheSesiones.set(ruta, c = { mtime: st.mtimeMs, size: st.size, r })
        }
        if (c.r) res.push({ sid: f.slice(0, -6), ...c.r, ultimo: new Date(st.mtimeMs).toISOString(), activa: ahora - st.mtimeMs < activaMs, _m: st.mtimeMs })
      }
    }
    return [p.id, res.sort((a, b) => b._m - a._m).map(({ _m, ...s }) => s)]
  }))
}

// Rama de una sección: la de su título, la del hito, o «Rama `x`» en el texto bajo el título del hito.
function ramaDe(lineas, sec, hito) {
  if (sec.meta?.rama) return sec.meta.rama
  if (!hito) return null
  if (hito.meta?.rama) return hito.meta.rama
  for (let i = hito.linea + 1; i < lineas.length && !RE_TITULO.test(lineas[i]); i++) {
    const m = lineas[i].match(/\brama\s+`([^`]+)`/i)
    if (m) return m[1]
  }
  return null
}
// Una tarjeta por casilla de primer nivel: por-hacer · en-curso ([~] o la sección que trabaja una sesión activa) ·
// en-prueba (hecha y su rama con PR abierto o sin fusionar) · hecho · movida ([-]).
export function columnasKanban(b, p, sesiones = []) {
  const lineas = String(b.contenido || '').replace(/\t/g, '    ').split('\n')
  const git = p?.git || {}
  const abiertas = new Set((git.prs || []).filter((pr) => pr.state === 'OPEN').map((pr) => pr.headRefName))
  const sinFusionar = new Set(git.sinFusionar || [])
  const vivas = sesiones.filter((s) => s.activa && (s.foco?.backlogs?.includes(b.archivo) || s.archivos?.includes(b.ruta)))
  const lineasDe = (t) => [t.linea, ...t.hijas.flatMap(lineasDe)]
  const contar = (ts) => ts.reduce((a, x) => { if (x.marca === '-') return a; const h = contar(x.hijas); return { hechas: a.hechas + h.hechas + (x.hecha ? 1 : 0), total: a.total + h.total + 1 } }, { hechas: 0, total: 0 })
  const enSesion = (sec, hito, t) => vivas.some((s) => {
    const claves = s.foco?.claves || []
    if (claves.length) return claves.includes(sec.clave) || (!!hito?.clave && claves.includes(hito.clave))
    if (b.activo?.seccion !== sec.id) return false
    return !b.activo.tarea || lineasDe(t).includes(b.activo.tarea.linea)
  })
  const tarjetas = []
  const seccion = (sec, hito) => {
    if (/^estado\b/i.test(plano(sec.titulo))) return
    for (const t of sec.tareas) {
      const estado = t.marca === '-' ? 'movida'
        : t.hecha ? (() => { const r = ramaDe(lineas, sec, hito); return r && (abiertas.has(r) || sinFusionar.has(r)) ? 'en-prueba' : 'hecho' })()
        : t.marca === '~' || enSesion(sec, hito, t) ? 'en-curso' : 'por-hacer'
      tarjetas.push({
        archivo: b.archivo, texto: t.texto, hecha: t.hecha, estado, seccion: sec.id, clave: sec.clave, hito: hito?.clave || null, linea: t.linea,
        ...(t.marcas ? { marcas: t.marcas } : {}), ...(t.hijas.length ? { sub: contar(t.hijas) } : {}),
      })
    }
  }
  for (const s of b.estructura || []) {
    const hito = s.nivel === 2 ? s : null
    seccion(s, hito)
    for (const h of aplanar(s.hijas)) seccion(h, hito)
  }
  return tarjetas
}

async function recolectar(opciones = {}) {
  cargarProyectos()
  mkdirSync(DATOS, { recursive: true })
  const bitacoras = leerBitacoras()
  const menciones = contarMenciones()
  const duenos = asignarPlanes(menciones, planesAsignados)
  return Promise.all(proyectos.map(async (p) => {
    let backlogs = leerBacklogs(p)
    let integraciones = await leerIntegraciones(p, backlogs, opciones)
    const auto = integraciones.filter((x) => x._auto)
    if (auto.length) {
      const fallos = new Map()
      for (const x of auto) {
        try { await sincronizar(p, x.id, { elegidas: 'auto', adaptadores: opciones.adaptadores }) } catch (e) { fallos.set(x.id, `Sincronía automática: ${e.message}`) }
      }
      backlogs = leerBacklogs(p)
      integraciones = await leerIntegraciones(p, backlogs, { ...opciones, aplicarAuto: false })
      for (const x of integraciones) if (fallos.has(x.id)) Object.assign(x, { estado: 'error', mensaje: fallos.get(x.id) })
    }
    for (const x of integraciones) delete x._auto
    const historial = actualizarHistorial(p, backlogs)
    const planes = leerPlanes(p, menciones, duenos)
    for (const b of backlogs) if (!b.esPlan) { b.activo = frenteActivo(b, historial[b.archivo], planes); b.retomar = retomarDe(b.estado) }
    const git = leerGit(p)
    const configuracion = estadoConfiguracion(p, { git, backlogs })
    const retomar = hechosRetomar({ transcripciones: p.transcripciones, git }, backlogs.find((b) => !b.esPlan) || null)
    const kanban = backlogs.filter((b) => !b.esPlan).flatMap((b) => columnasKanban(b, { git }, opciones.sesiones?.[p.id] || []))
    // Badge «≠ plan»: el modelo de la fila (foto de la statusline) frente al que pedía el prompt de esa sesión.
    const bitacora = bitacoras.get(p.bitacora) || null
    for (const f of bitacora?.registro || []) if (f.proyecto === p.id) {
      const plan = modeloPlanDe(f.tarea, backlogs)
      if (plan) Object.assign(f, { modeloPlan: plan, modeloDistinto: modeloDistinto(plan, f.modelo) })
    }
    return { id: p.id, nombre: p.nombre, repo: p.repo, backlogs, historial, planes, git, notas: leerNotas(p), bitacora, integraciones, configuracion, editable: p.editable, retomar, kanban }
  }))
}

// Sesiones favoritas: títulos (sin marcas de markdown) en datos/favoritos.json; la clave es el título, no el id posicional.
const rutaFavoritos = () => join(DATOS, 'favoritos.json')
function leerFavoritos() {
  const f = leerJson(rutaFavoritos(), {}).favoritos
  return Array.isArray(f) ? f.filter((t) => typeof t === 'string' && t.trim()) : []
}
export function alternarFavorito(titulo, favorito) {
  const lista = new Set(leerFavoritos())
  if (favorito) lista.add(titulo); else lista.delete(titulo)
  mkdirSync(DATOS, { recursive: true })
  writeFileSync(rutaFavoritos(), JSON.stringify({ favoritos: [...lista].sort() }, null, 2) + '\n')
}

async function construir(servidor = false, opciones = {}) {
  // Sesiones de Claude una sola vez: alimentan p.kanban y viajan en datos.sesiones (para file://, sin /api/sesiones).
  const sesiones = sesionesActivas(cargarProyectos())
  const datos = { generado: new Date().toISOString(), servidor, favoritos: leerFavoritos(), proyectos: await recolectar({ ...opciones, sesiones }), sesiones }
  // Credenciales: solo el resumen (completa, de dónde sale, últimos 4); configMtime para el 409 al editar integraciones.
  datos.credenciales = resumenCredenciales(leerCredenciales().datos, process.env, proyectos.flatMap((p) => p.integraciones || []))
  datos.configMtime = statConfig()?.mtimeMs ?? null
  const plantilla = readFileSync(join(AQUI, 'plantilla.html'), 'utf8')
  const json = JSON.stringify(datos).replace(/</g, '\\u003c')
  return { datos, html: plantilla.replace('/*__DATOS__*/null', () => json) }
}
async function generar() {
  const { datos, html } = await construir(false)
  writeFileSync(join(AQUI, 'index.html'), html)
  return datos
}

// ---------- Huella barata de lo que alimenta el tablero (solo mtimes y tamaños, sin leer contenido ni construir) ----------
function huella() {
  const marcas = []
  const ver = (r) => { try { const s = statSync(r); marcas.push(`${r}:${s.mtimeMs}:${s.size}`); return s } catch { return null } }
  const carpeta = (dir, filtro = () => true, profundo = false) => {
    if (!ver(dir)?.isDirectory()) return
    for (const f of readdirSync(dir).sort()) {
      const r = join(dir, f)
      if (profundo && statSync(r, { throwIfNoEntry: false })?.isDirectory()) carpeta(r, filtro, true)
      else if (filtro(f)) ver(r)
    }
  }
  cargarProyectos()
  ver(CONFIG)
  ver(RUTA_CREDENCIALES)
  carpeta(PLANES)
  ver(rutaFavoritos())
  for (const p of proyectos) {
    const patron = new RegExp(p.patronBacklogs || '^BACKLOG.*\\.md$', 'i')
    for (const d of p.docs) carpeta(d, (f) => patron.test(f))
    if (p.notas) ver(p.notas)
    if (p.bitacora) ver(expandir(p.bitacora))
    if (p.repo) {
      const git = join(p.repo, '.git')
      ver(join(git, 'HEAD')); ver(join(git, 'packed-refs'))
      carpeta(join(git, 'refs'), () => true, true)
    }
  }
  return createHash('sha1').update(marcas.join('\n')).digest('hex').slice(0, 16)
}

// ---------- Servidor local: el mismo tablero, pero puede guardar los .md ----------
// Solo escucha en 127.0.0.1, exige Host/Origin propios y solo escribe archivos que el tablero ya muestra.
export const PUERTO = Number(process.env.TABLERO_PUERTO) || 47321
const URL_LOCAL = `http://127.0.0.1:${PUERTO}/`
const INACTIVIDAD_MS = 6 * 3600e3
// Huella del código del servidor (mtimes): la del arranque viaja en /api/version; si la del disco cambia, se recicla.
const CODIGO = ['generar.mjs', 'plantilla.html', 'bitacora.mjs', 'coherencia.mjs']
export function huellaCodigo(dir = AQUI) {
  return CODIGO.map((f) => statSync(join(dir, f), { throwIfNoEntry: false })?.mtimeMs ?? 0).join(':')
}
const CODIGO_ARRANQUE = huellaCodigo()
const local = (dir) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(dir)
// Manejador HTTP (exportado para los tests: puerto y adaptadores inyectables).
export function crearManejador({ puerto = PUERTO, adaptadores = ADAPTADORES, alUsar = () => {}, codigo = CODIGO_ARRANQUE, alSalir = () => {} } = {}) {
  let cache = null
  const fresco = async (forzar) => { if (forzar || !cache || Date.now() - cache.t > 15000) cache = { t: Date.now(), ...(await construir(true, { adaptadores })) }; return cache }
  const permitidas = async () => new Set((await fresco()).datos.proyectos.flatMap((p) => [...p.backlogs.map((b) => b.ruta), ...p.planes.map((x) => x.ruta), p.notas?.ruta, p.bitacora?.ruta]).filter(Boolean))
  const enviar = (res, codigo, cuerpo, tipo = 'application/json; charset=utf-8') => {
    if (res.headersSent || res.destroyed) return
    res.writeHead(codigo, { 'content-type': tipo, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))
  }
  const leerCuerpo = (req) => new Promise((ok, mal) => {
    let t = ''
    req.setEncoding('utf8')
    req.on('data', (c) => { t += c; if (t.length > 4e6) { mal(new Error('demasiado grande')); req.destroy() } })
    req.on('end', () => { try { ok(JSON.parse(t)) } catch (e) { mal(e) } })
  })
  // Integraciones desde la vista: 409 si proyectos.json cambió desde que se cargó la vista (mtime de datos.configMtime).
  const integracionDe = (b) => {
    cargarProyectos()
    const p = proyectos.find((x) => x.id === b.proyecto)
    if (!p) throw new ErrorConfig('Falta el proyecto o no está en proyectos.json.', 404)
    return p
  }
  const exigirMtime = (b) => {
    if (typeof b.mtime !== 'number') throw new ErrorConfig('Falta el mtime de proyectos.json cargado.')
    if (b.mtime !== statConfig()?.mtimeMs) throw new ErrorConfig('proyectos.json cambió desde que cargaste la vista: recarga y vuelve a intentarlo.', 409)
  }
  const validar = (p, cfg, idOriginal) => {
    const { errores, limpia } = validarIntegracion(cfg, {
      backlogs: leerBacklogs(p).map((x) => x.archivo),
      otras: (p.integraciones || []).map((x) => x.id).filter((id) => id !== idOriginal),
      adaptadores,
    })
    if (errores.length) throw Object.assign(new ErrorConfig(errores.join(' ')), { errores })
    return limpia
  }
  const escribirConfig = (p, cambio) => {
    escribirAtomico(CONFIG, aplicarCambio(readFileSync(CONFIG, 'utf8'), p.id, cambio))
    cargarProyectos(true)
  }
  return async (req, res) => {
    alUsar()
    cargarProyectos()
    const host = req.headers.host || ''
    if (host !== `127.0.0.1:${puerto}` && host !== `localhost:${puerto}`) return enviar(res, 403, { error: 'host no permitido' })
    const ruta = new URL(req.url, `http://${host}`).pathname
    try {
      if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) return enviar(res, 200, (await fresco(true)).html, 'text/html; charset=utf-8')
      if (req.method === 'GET' && ruta === '/api/ping') return enviar(res, 200, { tablero: true })
      if (req.method === 'GET' && ruta === '/api/version') return enviar(res, 200, { version: huella(), codigo })
      if (req.method === 'GET' && ruta === '/api/datos') return enviar(res, 200, (await fresco(true)).datos)
      // Barato (sondeo cada 5 s): solo cabeza/cola de los .jsonl recientes y columnas sobre los datos ya construidos.
      if (req.method === 'GET' && ruta === '/api/sesiones') {
        const sesiones = sesionesActivas(proyectos)
        const columnas = Object.fromEntries((cache?.datos.proyectos || []).map((p) => [p.id, p.backlogs.filter((b) => !b.esPlan)
          .flatMap((b) => columnasKanban(b, p, sesiones[p.id] || []).map(({ archivo, linea, texto, estado }) => ({ archivo, linea, texto, estado })))]))
        return enviar(res, 200, { sesiones, columnas })
      }
      if (req.method !== 'POST') return enviar(res, 404, { error: 'no existe' })
      if (req.headers.origin !== `http://${host}` || !String(req.headers['content-type']).startsWith('application/json')) return enviar(res, 403, { error: 'origen no permitido' })
      if (ruta === '/api/salir') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        enviar(res, 200, { ok: true })
        return alSalir()
      }
      const b = await leerCuerpo(req)
      if (ruta === '/api/guardar') {
        if (typeof b.ruta !== 'string' || typeof b.contenido !== 'string' || !(await permitidas()).has(b.ruta)) return enviar(res, 403, { error: 'Ese archivo no lo administra el tablero.' })
        const actual = readFileSync(b.ruta, 'utf8')
        if (typeof b.previo === 'string' && actual !== b.previo) return enviar(res, 409, { error: 'El archivo cambió fuera del tablero desde que lo abriste.', actual })
        writeFileSync(b.ruta, b.contenido)
        return enviar(res, 200, { ok: true, datos: (await fresco(true)).datos })
      }
      if (ruta === '/api/nota') {
        const p = proyectos.find((x) => x.id === b.proyecto)
        const texto = typeof b.texto === 'string' ? b.texto.trim() : ''
        if (!p?.notas || !texto) return enviar(res, 400, { error: 'Falta el proyecto o el texto de la nota.' })
        leerNotas(p) // crea el archivo con la plantilla si no existe
        writeFileSync(p.notas, anadirNota(readFileSync(p.notas, 'utf8'), texto.slice(0, 4000)))
        return enviar(res, 200, { ok: true, datos: (await fresco(true)).datos })
      }
      // Bitácora: solo Calidad/Seguridad/Notas de la fila de esa sesión; 409 si el archivo cambió desde que se cargó.
      if (ruta === '/api/bitacora') {
        if (typeof b.ruta !== 'string' || !(await permitidas()).has(b.ruta) || !proyectos.some((p) => p.bitacora === b.ruta)) return enviar(res, 403, { error: 'Ese archivo no lo administra el tablero.' })
        if (typeof b.hash !== 'string') return enviar(res, 400, { error: 'Falta el hash de la bitácora cargada.' })
        const actual = readFileSync(b.ruta, 'utf8')
        if (hashBitacora(actual) !== b.hash) return enviar(res, 409, { error: 'La bitácora cambió desde que la cargaste (quizá cerró otra sesión): recarga y vuelve a intentarlo.' })
        writeFileSync(b.ruta, editarFila(actual, b))
        return enviar(res, 200, { ok: true, datos: (await fresco(true)).datos })
      }
      // Favoritos: solo escribe datos/favoritos.json; el título identifica la sesión.
      if (ruta === '/api/favoritos') {
        const titulo = typeof b.titulo === 'string' ? b.titulo.replace(/\s+/g, ' ').trim() : ''
        if (!titulo || titulo.length > 200 || typeof b.favorito !== 'boolean') return enviar(res, 400, { error: 'Falta el título de la sesión o si es favorita.' })
        alternarFavorito(titulo, b.favorito)
        const c = await fresco() // los favoritos no tocan nada más: se parchea la caché en vez de reconstruir todo
        c.datos.favoritos = leerFavoritos()
        return enviar(res, 200, { ok: true, datos: c.datos })
      }
      // Sincronía: el cliente solo manda claves y lados elegidos; el plan se recalcula aquí con datos frescos.
      if (ruta === '/api/sincronia/previa' || ruta === '/api/sincronia/aplicar') {
        const p = proyectos.find((x) => x.id === b.proyecto)
        if (!p || typeof b.integracion !== 'string') return enviar(res, 400, { error: 'Falta el proyecto o la integración.' })
        const opciones = { adaptadores, rutasPermitidas: await permitidas() }
        if (ruta === '/api/sincronia/previa') return enviar(res, 200, await sincronizar(p, b.integracion, opciones))
        if (!Array.isArray(b.acciones) || typeof b.hashPrevio !== 'string') return enviar(res, 400, { error: 'Faltan las acciones elegidas o el hash de la vista previa.' })
        const resoluciones = Object.fromEntries(Object.entries(b.resoluciones || {}).filter(([, v]) => v === 'local' || v === 'externo'))
        const r = await sincronizar(p, b.integracion, { ...opciones, elegidas: new Set(b.acciones.map(String)), resoluciones, hashPrevio: b.hashPrevio })
        return enviar(res, 200, { ok: true, ...r, datos: (await fresco(true)).datos })
      }
      // Alta/edición: solo campos de la lista blanca; las marcas y datos/sync-* de un id viejo se conservan (quedan huérfanas).
      if (ruta === '/api/integraciones/guardar') {
        const p = integracionDe(b)
        exigirMtime(b)
        const idOriginal = typeof b.idOriginal === 'string' && b.idOriginal ? b.idOriginal : undefined
        const limpia = validar(p, b.integracion, idOriginal)
        escribirConfig(p, { op: 'guardar', integracion: limpia, idOriginal })
        return enviar(res, 200, { ok: true, integracion: limpia, renombrada: !!idOriginal && idOriginal !== limpia.id, datos: (await fresco(true)).datos })
      }
      // Baja: solo el bloque en proyectos.json; nada se borra en el backlog ni afuera.
      if (ruta === '/api/integraciones/quitar') {
        const p = integracionDe(b)
        exigirMtime(b)
        if (typeof b.id !== 'string') throw new ErrorConfig('Falta el id de la integración.')
        escribirConfig(p, { op: 'quitar', id: b.id })
        return enviar(res, 200, { ok: true, datos: (await fresco(true)).datos })
      }
      // Proyecto nuevo: solo añade una entrada al final de proyectos.json (409 si cambió). `previa` devuelve la entrada sin escribir.
      if (ruta === '/api/proyectos/crear') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        const nuevo = proyectoNuevo(b, cargarProyectos(true))
        if (b.previa === true) return enviar(res, 200, { ok: true, previa: true, proyecto: nuevo, archivo: CONFIG })
        exigirMtime(b)
        escribirAtomico(CONFIG, anadirProyecto(readFileSync(CONFIG, 'utf8'), nuevo))
        cargarProyectos(true)
        return enviar(res, 200, { ok: true, proyecto: nuevo, datos: (await fresco(true)).datos })
      }
      // Elegir carpeta: subcarpetas (nunca archivos, nunca fuera de home); sin ruta, home + sugerencias de las sesiones de Claude;
      // con ruta, la propuesta de id/nombre/docs/notas para esa carpeta.
      if (ruta === '/api/carpetas') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        const lista = listarCarpetas(b.ruta, HOME)
        if (b.ruta == null || b.ruta === '') return enviar(res, 200, { ok: true, home: HOME, ...lista, sugerencias: sugerirProyectos(TRANSCRIPCIONES, cargarProyectos(), { home: HOME }) })
        return enviar(res, 200, { ok: true, home: HOME, ...lista, propuesta: lista.padre ? propuestaProyecto(lista.ruta, cargarProyectos(), HOME) : null })
      }
      // Editar proyecto: solo CAMPOS_PROYECTO, en su sitio; integraciones y campos ajenos intactos. `previa` devuelve el bloque sin escribir.
      if (ruta === '/api/proyectos/editar') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        const p = cargarProyectos(true).find((x) => x.id === b.id)
        if (!p) throw new ErrorConfig('Falta el proyecto o no está en proyectos.json.', 404)
        const texto = editarProyecto(readFileSync(CONFIG, 'utf8'), p.id, cambiosProyecto(b.cambios, p))
        const proyecto = JSON.parse(texto).find((x) => x?.id === p.id)
        if (b.previa === true) return enviar(res, 200, { ok: true, previa: true, proyecto, archivo: CONFIG })
        exigirMtime(b)
        escribirAtomico(CONFIG, texto)
        cargarProyectos(true)
        return enviar(res, 200, { ok: true, proyecto, datos: (await fresco(true)).datos })
      }
      // Backlog nuevo: plantilla mínima dentro de una carpeta «docs» del proyecto; nunca sobrescribe (409).
      if (ruta === '/api/backlog/crear') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        const p = integracionDe(b)
        const elegido = destinoBacklog(b, undefined)
        const destino = rutaBacklogNuevo(p, elegido.archivo, b.carpeta ?? undefined)
        const d = new Date(), fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const contenido = plantillaBacklog([p.nombre || p.id, elegido.nombre].filter(Boolean).join(' · '), fecha)
        if (b.previa === true) return enviar(res, 200, { ok: true, previa: true, archivo: basename(destino), ruta: destino, contenido })
        try { writeFileSync(destino, contenido, { flag: 'wx' }) } catch (e) {
          if (e.code === 'EEXIST') throw new ErrorConfig(`Ya existe ${basename(destino)}: el tablero nunca sobrescribe un backlog.`, 409)
          throw e
        }
        return enviar(res, 200, { ok: true, archivo: basename(destino), ruta: destino, contenido, datos: (await fresco(true)).datos })
      }
      // Participar: asignarme (o soltar) un ítem, o cambiarle el estado afuera. Nunca crea ni toca un .md.
      if (ruta === '/api/integraciones/asignar' || ruta === '/api/integraciones/estado') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        const p = integracionDe(b)
        const cfg = (p.integraciones || []).find((x) => x.id === b.integracion)
        const esAsignar = ruta === '/api/integraciones/asignar'
        let r
        try { r = await participar(p, cfg, { asignar: esAsignar, id: b.id, aMi: b.aMi, estado: b.estado }, adaptadores) } catch (e) {
          if (!e.remoto) throw e
          registrar(`${esAsignar ? 'asignar' : 'estado'} ${p.id}/${cfg.id} #${String(b.id)}: ${e?.message || e}`)
          return enviar(res, 502, { error: String(e?.message || e) })
        }
        const c = await fresco()
        const enDatos = c.datos.proyectos.find((x) => x.id === p.id)?.integraciones?.find((x) => x.id === cfg.id)?.items?.find((x) => String(x.id) === r.id)
        if (enDatos) Object.assign(enDatos, r.cambios)
        return enviar(res, 200, { ok: true, item: { ...(enDatos || r.enCache || {}), id: r.id, ...r.cambios }, datos: c.datos })
      }
      // Importar una integración de solo lectura a un BACKLOG_<ID>.md propio (nunca sobrescribe; `previa` no escribe).
      if (ruta === '/api/integraciones/importar') {
        if (!local(req.socket.remoteAddress)) return enviar(res, 403, { error: 'solo desde esta máquina' })
        const p = integracionDe(b)
        const cfg = (p.integraciones || []).find((x) => x.id === b.integracion)
        if (!cfg) throw new ErrorConfig('Esa integración no está en proyectos.json.', 404)
        if (!esLectura(cfg)) throw new ErrorConfig('Solo se importa desde una integración de solo lectura (las demás ya tienen su backlog).')
        const elegido = destinoBacklog(b, `BACKLOG_${p.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}.md`)
        const destino = rutaBacklogNuevo(p, elegido.archivo, b.carpeta ?? undefined)
        const ctx = contextoIntegracion(p, cfg, [], adaptadores)
        let fuera
        try { fuera = await conTiempo(ctx.adaptador.leer(), 15000) } catch (e) { return enviar(res, 502, { error: String(e?.message || e) }) }
        const d = new Date(), fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const { contenido, total, tipos } = importarBacklog([p.nombre || p.id, elegido.nombre].filter(Boolean).join(' · '), cfg.id, fuera.items, fuera.columnas, fecha, b.soloMias === true)
        const resumen = { archivo: basename(destino), ruta: destino, contenido, total, tipos, avisos: fuera.avisos || [] }
        if (b.previa === true) return enviar(res, 200, { ok: true, previa: true, ...resumen })
        try { writeFileSync(destino, contenido, { flag: 'wx' }) } catch (e) {
          if (e.code === 'EEXIST') throw new ErrorConfig(`Ya existe ${basename(destino)}: el tablero nunca sobrescribe un backlog.`, 409)
          throw e
        }
        return enviar(res, 200, { ok: true, ...resumen, datos: (await fresco(true)).datos })
      }
      // Probar sin guardar: una lectura con la config propuesta (lo mismo que --probar-conexiones).
      if (ruta === '/api/integraciones/probar') {
        const p = integracionDe(b)
        const limpia = validar(p, b.integracion, b.integracion?.id)
        const backlogs = leerBacklogs(p)
        const ctx = contextoIntegracion(p, limpia, backlogs, adaptadores)
        let r
        try { r = await conTiempo(ctx.adaptador.leer(), 15000) } catch (e) { return enviar(res, 502, { error: String(e?.message || e) }) }
        const vinculadas = ctx.backlog ? tareasLocales(ctx.backlog.contenido, limpia.id).filter((t) => t.marca).length : 0
        return enviar(res, 200, { ok: true, modo: limpia.modo || 'sincronizar', titulo: r.titulo || null, url: r.url || null, columnas: r.columnas || [], items: r.items.length, avisos: [...(ctx.aviso ? [ctx.aviso] : []), ...(r.avisos || [])], vinculadas, ...(limpia.organizacion ? { organizacion: limpia.organizacion } : {}) })
      }
      // Descubrir para los desplegables (solo lectura): `consulta` parcial según el tipo; `clave` = id de una integración con credencial propia.
      if (ruta === '/api/integraciones/descubrir') {
        const mod = adaptadores[b.tipo]
        if (typeof b.tipo !== 'string' || !ADAPTADORES[b.tipo]) return enviar(res, 400, { error: 'Falta el tipo de conector o no existe.' })
        if (typeof mod?.listar !== 'function') return enviar(res, 400, { error: `El conector «${NOMBRES[b.tipo]}» no permite descubrir opciones.` })
        const consulta = b.consulta && typeof b.consulta === 'object' && !Array.isArray(b.consulta) ? b.consulta : {}
        const cfg = {}
        for (const k of ['propietario', 'numero', 'tablero', 'organizacion', 'proyecto']) if (consulta[k] != null && consulta[k] !== '') cfg[k] = consulta[k]
        if (b.tipo === 'azure-devops' && cfg.organizacion) {
          try { Object.assign(cfg, { organizacion: normalizarOrganizacion(cfg.organizacion).organizacion }) } catch (e) { return enviar(res, 400, { error: e.message }) }
        }
        const clave = typeof b.clave === 'string' ? b.clave : undefined
        const { cred, faltan, paso } = credencialesPara({ id: clave, tipo: b.tipo }, leerCredenciales().datos)
        if (faltan.length) return enviar(res, 400, { error: `Falta credencial: ${faltan.join(', ')}.`, estado: 'falta-credencial', paso })
        try { return enviar(res, 200, { ok: true, ...(cfg.organizacion && b.tipo === 'azure-devops' ? { organizacion: cfg.organizacion } : {}), ...(await conTiempo(mod.listar(cfg, cred, { memo: new Map() }), 15000)) }) } catch (e) { return enviar(res, 502, { error: String(e?.message || e) }) }
      }
      // Credenciales: se guardan en el archivo (0600) y la respuesta solo trae el resumen, nunca un valor.
      if (ruta === '/api/credenciales') {
        const clave = typeof b.clave === 'string' ? b.clave : ''
        const tipo = REQUISITOS[clave] ? clave : proyectos.flatMap((p) => p.integraciones || []).find((x) => x.id === clave)?.tipo
        const req = REQUISITOS[tipo] || {}
        if (!Object.keys(req).length) return enviar(res, 400, { error: 'Esa clave no es un tipo de conector con credenciales ni una integración configurada.' })
        const campos = b.campos && typeof b.campos === 'object' && !Array.isArray(b.campos) ? b.campos : null
        if (!campos || !Object.keys(campos).length) return enviar(res, 400, { error: 'Faltan los campos de la credencial.' })
        for (const [k, v] of Object.entries(campos)) {
          if (!(k in req)) return enviar(res, 400, { error: `«${k}» no es un campo de ${NOMBRES[tipo]} (usa ${Object.keys(req).join(', ')}).` })
          if (v !== null && v !== '' && (typeof v !== 'string' || v.length > 500 || /[\s]/.test(v.trim()) || !v.trim())) return enviar(res, 400, { error: `«${k}» no parece válido (texto sin espacios, hasta 500 caracteres).` })
        }
        guardarCredencial(clave, campos)
        const datos = (await fresco(true)).datos
        return enviar(res, 200, { ok: true, credenciales: datos.credenciales, datos })
      }
      return enviar(res, 404, { error: 'no existe' })
    } catch (e) {
      if (e instanceof ErrorSincronia) return enviar(res, e.estado, { error: e.message, paso: e.extra?.paso })
      if (e instanceof ErrorBitacora) return enviar(res, e.estado, { error: e.message })
      if (e instanceof ErrorConfig) return enviar(res, e.estado, { error: e.message, errores: e.errores })
      return enviar(res, 500, { error: String(e?.message || e) })
    }
  }
}
// Registro del servidor: datos/servidor.log (una línea con fecha por evento; se recorta a ~200 KB al arrancar).
const LOG = join(DATOS, 'servidor.log')
const LOG_MAX = 200 * 1024
const registrar = (msg) => { try { mkdirSync(DATOS, { recursive: true }); appendFileSync(LOG, `${new Date().toISOString()} ${String(msg?.stack || msg).replace(/\n/g, '\n    ')}\n`) } catch {} }
function recortarLog() {
  try { if (statSync(LOG).size > LOG_MAX) writeFileSync(LOG, readFileSync(LOG, 'utf8').slice(-LOG_MAX / 2).replace(/^[^\n]*\n/, '')) } catch {}
}
// Un error en una petición o en cualquier promesa suelta se registra y el servidor sigue vivo.
export function protegerProceso(proceso = process, log = registrar) {
  proceso.on('uncaughtException', (e) => log(`uncaughtException: ${e?.stack || e}`))
  proceso.on('unhandledRejection', (e) => log(`unhandledRejection: ${e?.stack || e}`))
}
export function protegerManejador(manejar, log = registrar) {
  return (req, res) => { Promise.resolve().then(() => manejar(req, res)).catch((e) => log(`manejador: ${e?.stack || e}`)) }
}
function servir() {
  recortarLog()
  protegerProceso()
  let ultimo = Date.now()
  registrar(`arranque (pid ${process.pid}, puerto ${PUERTO})`)
  // Suelta el puerto (también las conexiones keep-alive) antes de salir o de lanzar el relevo.
  const cerrar = (despues) => { srv.close(despues); srv.closeAllConnections?.() }
  const alSalir = () => { registrar('salida pedida por /api/salir'); setTimeout(() => cerrar(() => process.exit(0)), 50) }
  const srv = createServer(protegerManejador(crearManejador({ alUsar: () => { ultimo = Date.now() }, alSalir })))
  srv.on('error', (e) => { registrar(`servidor: ${e?.stack || e}`); if (e.code === 'EADDRINUSE') process.exit(0) })
  srv.listen(PUERTO, '127.0.0.1')
  setInterval(() => { if (Date.now() - ultimo > INACTIVIDAD_MS) { registrar('cerrado por inactividad'); process.exit(0) } }, 60e3)
  setInterval(() => {
    if (huellaCodigo() === CODIGO_ARRANQUE) return
    registrar('reinicio por código nuevo')
    cerrar(() => { lanzarServidor(); process.exit(0) })
  }, 30e3).unref()
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { registrar(`salida por ${s}`); process.exit(0) })
}
async function servidorVivo() {
  try { return (await (await fetch(URL_LOCAL + 'api/ping', { signal: AbortSignal.timeout(600) })).json()).tablero === true } catch { return false }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
// Lanza `--servir` en segundo plano con stdout/stderr hacia datos/servidor.log.
function lanzarServidor() {
  mkdirSync(DATOS, { recursive: true })
  const fd = openSync(LOG, 'a')
  try { spawn(process.execPath, [fileURLToPath(import.meta.url), '--servir'], { detached: true, stdio: ['ignore', fd, fd] }).unref() } finally { closeSync(fd) }
}
async function arrancarServidor() {
  lanzarServidor()
  for (let i = 0; i < 20 && !(await servidorVivo()); i++) await esperar(150)
}
// Pid del último «arranque (pid N, puerto P)» del log en este puerto (servidores viejos sin /api/salir).
export function pidDelLog(texto, puerto = PUERTO) {
  return Number([...String(texto).matchAll(/arranque \(pid (\d+), puerto (\d+)\)/g)].filter((m) => +m[2] === puerto).at(-1)?.[1]) || null
}
// Deja un servidor con el código del disco: si no hay, lo arranca; si el que corre tiene otra huella, le pide salir
// (POST /api/salir; si no lo entiende, SIGTERM al pid del log) y arranca uno nuevo. Devuelve qué hizo.
export async function asegurarServidor({ vivo = servidorVivo, codigoRemoto, salir, matar, arrancar = arrancarServidor, codigo = huellaCodigo(), log = registrar } = {}) {
  codigoRemoto ||= async () => { try { return (await (await fetch(URL_LOCAL + 'api/version', { signal: AbortSignal.timeout(3000) })).json()).codigo ?? null } catch { return null } }
  salir ||= async () => { try { await fetch(URL_LOCAL + 'api/salir', { method: 'POST', headers: { origin: URL_LOCAL.slice(0, -1), 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(1000) }) } catch {} }
  matar ||= () => {
    // El pid que escucha en el puerto (lsof); si no hay lsof, el último arranque del log (puede ser uno que murió por EADDRINUSE).
    let pid = null
    try { pid = Number(execFileSync('lsof', ['-ti', `tcp:${PUERTO}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).split('\n')[0]) || null } catch {}
    pid ||= existsSync(LOG) && pidDelLog(readFileSync(LOG, 'utf8'))
    if (pid && pid !== process.pid) try { process.kill(pid, 'SIGTERM') } catch {}
  }
  if (!(await vivo())) { await arrancar(); return 'arrancado' }
  if ((await codigoRemoto()) === codigo) return 'vigente'
  log('reinicio por código nuevo (pedido al asegurar el servidor)')
  await salir()
  for (let i = 0; i < 20 && (await vivo()); i++) await esperar(100)
  if (await vivo()) { matar(); for (let i = 0; i < 20 && (await vivo()); i++) await esperar(100) }
  await arrancar()
  return 'reciclado'
}
// Abre el tablero servido (arranca o recicla el servidor en segundo plano); si falla, el archivo.
async function abrir() {
  await asegurarServidor()
  sh('open', [(await servidorVivo()) ? URL_LOCAL : join(AQUI, 'index.html')])
}

// ---------- Hook SessionStart: contexto breve para Claude ----------
function hookInicio() {
  let entrada = {}
  try { entrada = JSON.parse(readFileSync(0, 'utf8') || '{}') } catch {}
  const cwd = entrada.cwd || process.cwd()
  const p = proyectos.find((x) => [x.repo, ...x.docs].filter(Boolean).some((r) => cwd.startsWith(r) || r.startsWith(cwd + '/')))
  // Regenera en segundo plano para no frenar el arranque.
  spawn(process.execPath, [fileURLToPath(import.meta.url), '--silencioso', '--asegurar-servidor'], { detached: true, stdio: 'ignore' }).unref()
  if (!p) return
  const lineas = [`[Tablero] Proyecto «${p.nombre}» — tablero: ${join(AQUI, 'index.html')}`]
  const todos = leerBacklogs(p)
  // Backlog ↔ GitHub ↔ backlog padre (PRs de la caché de la última generación: sin red al arrancar).
  const malos = desajustes(todos, leerJson(join(DATOS, `github-${p.id}.json`), {}).prs || [])
  if (malos.length) {
    lineas.push(`- ⚠️ BACKLOG DESACTUALIZADO (${malos.length}). Corrígelo ANTES de empezar la sesión (marca [x] lo hecho, [-] con nota lo movido/descartado; en sub-backlogs, también el hito del padre):`)
    for (const d of malos.slice(0, 6)) lineas.push(`  · ${describir(d).slice(0, 300)}`)
  }
  const backlogs = todos.filter((b) => !b.esPlan).slice(0, 2)
  for (const b of backlogs) {
    const estado = b.estado.split('\n').find((l) => l.trim()) || ''
    lineas.push(`- Backlog ${b.ruta} (${b.hechas}/${b.total}). ${estado.slice(0, 300)}`)
  }
  const n = leerNotas(p)
  if (n?.abiertas.length) {
    lineas.push(`- ${p.autor ? `${p.autor} dejó` : 'Hay'} ${n.abiertas.length} nota(s) abierta(s) en ${n.ruta}:`)
    for (const a of n.abiertas.slice(0, 8)) lineas.push(`  · ${a.slice(0, 200)}`)
    lineas.push('  Atiéndelas (responde con «→ respuesta (fecha)» y muévelas a «Respondidas») o menciónalas al empezar.')
  }
  lineas.push(...lineasIntegraciones(p, leerJson(join(DATOS, `externo-${p.id}.json`), {})))
  process.stdout.write(lineas.join('\n') + '\n')
}

// `--auditoria <AAAA-MM-DD> [--modelos]` (auditoria.mjs): gasto del día desde las transcripciones; con --modelos, Opus frente a Sonnet en la bitácora.
async function auditoriaCli() {
  const { auditar, leerTranscripciones, textoAuditoria, porModelo, textoModelos } = await import('./auditoria.mjs')
  const dia = args[args.indexOf('--auditoria') + 1]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) { console.error('Uso: tablero --auditoria <AAAA-MM-DD> [--modelos]'); process.exitCode = 1; return }
  console.log(textoAuditoria(auditar(leerTranscripciones(dia), { dia, utc: args.includes('--utc') }), dia))
  if (args.includes('--modelos')) {
    const i = args.indexOf('--bitacora'), b = i >= 0 ? args[i + 1] : join(AQUI, '..', 'BITACORA.md')
    console.log('\n' + (existsSync(b) ? textoModelos(porModelo(readFileSync(b, 'utf8'))) : 'Sin BITACORA.md en ' + b))
  }
}

// Solo corre al ejecutarse como programa (los tests importan el parser sin generar nada).
let esPrincipal = false
try { esPrincipal = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch {}
if (!esPrincipal) { /* importado */ }
else if (!existsSync(CONFIG) && (console.error('Falta proyectos.json: copia proyectos.ejemplo.json a proyectos.json y edítalo (ver README.md).'), true)) process.exitCode = 1
else if (['--tareas', '--asignarme', '--estado'].some((f) => args.includes(f))) await tareasCli()
else if (args.includes('--auditoria')) await auditoriaCli()
else if (args.includes('--hook-inicio')) hookInicio()
else if (args.includes('--servir')) servir()
else if (args.includes('--probar-conexiones')) await probarConexiones()
else {
  const d = await generar()
  if (!args.includes('--silencioso')) {
    for (const p of d.proyectos) console.log(`${p.nombre}: ${p.backlogs.length} backlogs · ${p.planes.length} planes · ${p.git?.prs.length ?? 0} PRs · ${p.notas?.abiertas.length ?? 0} notas abiertas${p.integraciones.length ? ` · ${p.integraciones.map((x) => `${x.id}: ${x.estado}${x.pendientes ? ` (${x.pendientes} por sincronizar)` : ''}`).join(', ')}` : ''}`)
    console.log(join(AQUI, 'index.html'))
  }
  if (args.includes('--abrir')) await abrir()
  else if (args.includes('--asegurar-servidor')) await asegurarServidor()
}
