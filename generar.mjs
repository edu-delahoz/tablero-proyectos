#!/usr/bin/env node
// Tablero de proyectos: junta backlogs, planes de Claude, historial, GitHub y notas
// en un solo index.html local. Sin dependencias.
//   node generar.mjs               → regenera index.html
//   node generar.mjs --abrir       → regenera y abre http://127.0.0.1:47321 (arranca el servidor si hace falta)
//   node generar.mjs --servir      → servidor local: sirve el tablero fresco y guarda las ediciones de los .md
//   node generar.mjs --hook-inicio → (SessionStart) imprime contexto para Claude y regenera en segundo plano
//   node generar.mjs --probar-conexiones → lectura mínima de cada integración (GitHub Projects, Trello, Azure DevOps)
// Variables opcionales: TABLERO_PROYECTOS (otro proyectos.json), TABLERO_DATOS (otra carpeta datos/), TABLERO_PUERTO,
// TABLERO_TRANSCRIPCIONES (otra carpeta en lugar de ~/.claude/projects).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, realpathSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extraerMarcas, tareasLocales, planificarSincronia, aplicarSincronia } from './integraciones/sincronia.mjs'
import { leerCredenciales, credencialesPara } from './integraciones/credenciales.mjs'
import { ADAPTADORES, NOMBRES } from './integraciones/index.mjs'
import { desajustes, describir } from './coherencia.mjs'
import { parsearBitacora, sidsPorProyecto, asociar, editarFila, hashBitacora, ErrorBitacora } from './bitacora.mjs'

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
const proyectos = leerJson(CONFIG, []).map((p) => ({
  ...p,
  repo: p.repo && expandir(p.repo),
  docs: (p.docs || []).map(expandir),
  notas: p.notas && expandir(p.notas),
  bitacora: p.bitacora && expandir(p.bitacora),
}))

const PLANTILLA_NOTAS = `# Notas para Claude

> Escribe aquí preguntas, notas o aclaraciones para Claude. Al iniciar cada sesión
> en este proyecto, Claude ve cuántas hay abiertas y las atiende.
> Formato: una casilla por nota bajo «Abiertas». Claude responde debajo con
> \`→ respuesta (fecha)\` y la mueve a «Respondidas».

## Abiertas

- [ ] (ejemplo) ¿Por dónde vamos en el hito actual?

## Respondidas

`

// ---------- Backlogs ----------
function contarCasillas(texto) {
  const hechas = (texto.match(/^\s*[-*] \[x\]/gim) || []).length
  const pendientes = (texto.match(/^\s*[-*] \[ \]/gm) || []).length
  return { hechas, total: hechas + pendientes }
}

// ---------- Estructura (vista «Mapa»): secciones ##/### con sus casillas anidadas ----------
const RE_TITULO = /^(#{2,3})\s+(.+?)\s*#*\s*$/
const RE_TAREA = /^(\s*)[-*] \[([ xX])\]\s?(.*)$/
const RE_CERCA = /^\s*(```|~~~)/
const RE_COMO = /c[oó]mo ejecutarlo/i
const RE_ITEM = /^ ?(\d+[.)]|[-*])\s+(?!\[[ xX]\])(.+)$/
const RE_DURACION = /\s*\(([^()]*\b(?:d[ií]as?|d|semanas?|sem|horas?|h)\b[^()]*)\)\s*$/i
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
  const contar = (ts) => ts.reduce((a, x) => { const h = contar(x.hijas); return { hechas: a.hechas + h.hechas + (x.hecha ? 1 : 0), total: a.total + h.total + 1 } }, { hechas: 0, total: 0 })
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

// Árbol de secciones: [{ id, titulo, tituloCrudo, clave, nivel, meta, hechas, total, estado, tareas:[{texto,hecha,hijas,marcas?}], items, prompts:[{etiqueta,texto,clave,modelo}], hijas:[sección] }]
export function estructura(texto) {
  const raiz = []
  let padre = null, actual = null, pila = [], cerca = null, cita = null, rotulo = null, n = 0
  const cuenta = () => RE_COMO.test(plano(actual.titulo)) || (actual.nivel === 3 && padre && RE_COMO.test(plano(padre.titulo)))
  const emitir = (lineas, rot, esCita) => {
    const texto = esCita ? textoDeCita(lineas) : lineas.join('\n')
    if (!actual || !texto.trim() || !(cuenta() || /prompt/i.test(rot || ''))) return
    const etiqueta = (/prompt/i.test(rot || '') ? plano(rot) : '').replace(/^(?:[-*]|\d+[.)])\s+/, '').replace(/\s*:\s*$/, '').slice(0, 80) || 'Prompt'
    actual.prompts.push({ etiqueta, texto: texto.slice(0, 20000), clave: (etiqueta.match(/\b([A-Z]\d+[a-z]?)\b/) || [])[1] || null })
  }
  for (const linea of String(texto).replace(/\t/g, '    ').split('\n')) {
    if (RE_CERCA.test(linea)) {
      if (cita) { emitir(cita.lineas, cita.rotulo, true); cita = null }
      if (cerca) { emitir(cerca.lineas, cerca.rotulo, false); cerca = null } else cerca = { rotulo, lineas: [] }
      rotulo = null
      continue
    }
    if (cerca) { cerca.lineas.push(linea); continue }
    if (/^\s*>/.test(linea)) {
      if (!cita) cita = { rotulo, lineas: [] }
      cita.lineas.push(linea)
      continue
    }
    if (cita) { emitir(cita.lineas, cita.rotulo, true); cita = null; rotulo = null }
    if (linea.trim()) rotulo = linea
    const t = linea.match(RE_TITULO)
    if (t) {
      const nivel = t[1].length
      const s = { id: `s${n++}`, nivel, tituloCrudo: t[2], ...analizarTitulo(t[2]), tareas: [], items: [], prompts: [], hijas: [] }
      if (nivel === 3 && padre) padre.hijas.push(s)
      else { raiz.push(s); if (nivel === 2) padre = s }
      actual = s; pila = []; rotulo = null
      continue
    }
    const m = actual && linea.match(RE_TAREA)
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
    const tarea = { texto: limpio.slice(0, 1500), hecha: m[2] !== ' ', hijas: [], ...(Object.keys(marcas).length ? { marcas } : {}) }
    while (pila.length && pila.at(-1).sangria >= sangria) pila.pop()
    ;(pila.length ? pila.at(-1).tarea.hijas : actual.tareas).push(tarea)
    pila.push({ sangria, tarea })
  }
  if (cita) emitir(cita.lineas, cita.rotulo, true)
  // El modelo de cada prompt sale de la fila de la tabla de sesiones de su sección.
  for (const s of aplanar(raiz)) {
    for (const p of s.prompts) { const f = p.clave && s.filas?.find((x) => x.clave === p.clave); if (f) p.modelo = f.modelo }
    delete s.filas
  }
  raiz.forEach(cerrarSeccion)
  return raiz
}
export const aplanar = (arbol) => arbol.flatMap((s) => [s, ...aplanar(s.hijas)])

// «Estás aquí»: lo que nombra la primera línea de «## Estado» (prefiere «Siguiente: X»;
// si lo nombrado está cerrado, la sección siguiente); si no, la primera sección no terminada.
export function estasAqui(arbol, estadoTxt = '') {
  const pasos = aplanar(arbol).filter((s) => s.estado !== 'doc')
  const linea = String(estadoTxt).split('\n').find((l) => l.trim()) || ''
  const sig = linea.match(/Siguiente:?\**\s*\**\s*([HS]\d+[a-z]?)\b/)
  const ref = sig || linea.match(/\b([HS]\d+[a-z]?)\b/)
  if (ref) {
    const i = pasos.findIndex((s) => s.clave === ref[1])
    if (i >= 0) {
      const cerrado = !sig && /CERRAD|terminad|complet|✅/i.test(linea.slice(ref.index, ref.index + 40))
      const s = cerrado ? pasos.slice(i + 1).find((x) => x.estado !== 'hecho') : pasos[i]
      if (s) return s.id
    }
  }
  return pasos.find((s) => s.estado !== 'hecho')?.id || null
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
// «planes» en proyectos.json asigna planes a mano: mandan sobre la transcripción y salen de los demás proyectos.
const planesAsignados = new Map(proyectos.flatMap((p) => (p.planes || []).map((n) => [n, p.id])))
function leerPlanes(p) {
  const usados = new Map((p.planes || []).map((n) => [n, new Set(['(asignado)'])])) // nombre -> Set(carpeta)
  for (const d of p.transcripciones && existsSync(TRANSCRIPCIONES) ? readdirSync(TRANSCRIPCIONES) : []) {
    if (!d.startsWith(p.transcripciones)) continue
    const salida = sh('grep', ['-ohE', 'plans/[A-Za-z0-9_-]+\\.md', '-r', '--include=*.jsonl', join(TRANSCRIPCIONES, d)], undefined, 20000) || ''
    for (const m of new Set(salida.split('\n').filter(Boolean))) {
      const nombre = basename(m)
      if ((planesAsignados.get(nombre) ?? p.id) !== p.id) continue
      if (!usados.has(nombre)) usados.set(nombre, new Set())
      usados.get(nombre).add(d.slice(p.transcripciones.length).replace(/^-/, '') || '(raíz)')
    }
  }
  return [...usados].flatMap(([nombre, carpetas]) => {
    const ruta = join(PLANES, nombre)
    if (!existsSync(ruta)) return []
    const contenido = readFileSync(ruta, 'utf8')
    const titulo = (contenido.match(/^#\s+(.+)$/m) || [, nombre])[1].trim()
    const arbol = estructura(contenido)
    return [{ nombre, ruta, titulo, carpetas: [...carpetas], modificado: statSync(ruta).mtime.toISOString(), contenido, estructura: arbol, aqui: estasAqui(arbol, seccionEstado(contenido)) }]
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
  const datos = { url, prs, commits, rama, sinPush, ramas: leerRamas(p.repo), grafo: grafoRamas(commits), actualizadoGh: prsCrudo ? new Date().toISOString() : cache.actualizadoGh || null }
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

// Todo lo necesario para sincronizar una integración: config, backlog, adaptador enlazado y credenciales.
function contextoIntegracion(p, cfg, backlogs, adaptadores) {
  const backlog = backlogs.find((b) => b.archivo === cfg.backlog)
  if (!backlog) throw new ErrorSincronia(`No encuentro «${cfg.backlog}» en las carpetas «docs» del proyecto.`, 400)
  const mod = adaptadores[cfg.tipo]
  if (!mod) throw new ErrorSincronia(`El conector «${NOMBRES[cfg.tipo] || cfg.tipo}» aún no está disponible en esta versión.`, 400, { estado: 'sin-conector' })
  const { datos, aviso } = leerCredenciales()
  const { cred, faltan, paso } = credencialesPara(cfg, datos)
  if (faltan.length) throw new ErrorSincronia(`Falta credencial: ${faltan.join(', ')}.`, 400, { estado: 'falta-credencial', paso })
  const deps = { memo: new Map() }
  const adaptador = {
    leer: () => mod.leer(cfg, cred, deps),
    crear: (c, cr, t) => mod.crear(c, cr, t, deps),
    actualizar: (c, cr, id, x) => mod.actualizar(c, cr, id, x, deps),
  }
  return { backlog, adaptador, cred, aviso }
}

// Vista previa (elegidas == null) o aplicación. Orden al aplicar: afuera → una escritura del .md → instantánea.
export async function sincronizar(p, idIntegracion, { elegidas = null, resoluciones = {}, hashPrevio, adaptadores = ADAPTADORES, rutasPermitidas } = {}) {
  const cfg = (p.integraciones || []).find((x) => x.id === idIntegracion)
  if (!cfg) throw new ErrorSincronia('Esa integración no está en proyectos.json.', 404)
  const ctx = contextoIntegracion(p, cfg, leerBacklogs(p), adaptadores)
  const ruta = ctx.backlog.ruta
  if (rutasPermitidas && !rutasPermitidas.has(ruta)) throw new ErrorSincronia('Ese archivo no lo administra el tablero.', 403)
  const contenido = readFileSync(ruta, 'utf8'), hash = hashDe(contenido)
  if (hashPrevio !== undefined && hashPrevio !== hash) throw new ErrorSincronia(`${cfg.backlog} cambió desde la vista previa: vuelve a pulsar Sincronizar.`, 409)
  const fuera = await conTiempo(ctx.adaptador.leer(), 15000)
  const instantanea = leerJson(rutaInstantanea(p, cfg), {})
  const acciones = planificarSincronia(tareasLocales(contenido, cfg.id), fuera.items, instantanea)
  if (elegidas == null) return { acciones, hash, url: fuera.url, backlog: cfg.backlog }
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
async function leerIntegraciones(p, backlogs, { adaptadores = ADAPTADORES, aplicarAuto = true } = {}) {
  if (!p.integraciones?.length) return []
  const rutaExt = join(DATOS, `externo-${p.id}.json`), cache = leerJson(rutaExt, {})
  const salida = await Promise.all(p.integraciones.map(async (cfg) => {
    const base = { id: cfg.id, tipo: cfg.tipo, nombre: NOMBRES[cfg.tipo] || cfg.tipo, backlog: cfg.backlog, auto: !!cfg.auto, ultimaSincronia: cache[cfg.id]?.ultimaSincronia || null }
    let ctx
    try { ctx = contextoIntegracion(p, cfg, backlogs, adaptadores) } catch (e) {
      return { ...base, estado: e.extra?.estado || 'error', mensaje: e.message, paso: e.extra?.paso || null }
    }
    let fuera, error = null
    try {
      fuera = await conTiempo(ctx.adaptador.leer(), LECTURA_MS)
      cache[cfg.id] = { ...cache[cfg.id], url: fuera.url, titulo: fuera.titulo, columnas: fuera.columnas, items: fuera.items, avisos: fuera.avisos, fecha: new Date().toISOString() }
    } catch (e) { error = String(e?.message || e); fuera = cache[cfg.id]?.items ? cache[cfg.id] : null }
    const acciones = fuera ? planificarSincronia(tareasLocales(ctx.backlog.contenido, cfg.id), fuera.items, leerJson(rutaInstantanea(p, cfg), {})) : []
    const porTipo = acciones.reduce((m, a) => ({ ...m, [a.tipo]: (m[a.tipo] || 0) + 1 }), {})
    const auto = cfg.auto && !error && aplicarAuto && acciones.some((a) => a.tipo !== 'conflicto' && a.tipo !== 'huerfana')
    return {
      ...base, estado: error ? 'error' : 'conectado', mensaje: error, aviso: ctx.aviso, avisos: fuera?.avisos || [],
      url: fuera?.url || null, titulo: fuera?.titulo || null, columnas: fuera?.columnas || [],
      items: (fuera?.items || []).map(({ id, titulo, hecha, columna, url }) => ({ id, titulo, hecha, columna, url })),
      leidoEn: error ? cache[cfg.id]?.fecha || null : new Date().toISOString(), desdeCache: !!error && !!fuera,
      pendientes: acciones.filter((a) => a.tipo !== 'huerfana').length, porTipo, _auto: auto,
    }
  }))
  writeFileSync(rutaExt, JSON.stringify(cache))
  return salida
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
      const vinculadas = tareasLocales(ctx.backlog.contenido, cfg.id).filter((t) => t.marca).length
      console.log(`✓ ${titulo}: OK · «${r.titulo || ''}» ${r.url || ''} · ${r.items.length} ítems · columnas: ${r.columnas.join(', ')} · ${vinculadas} casillas vinculadas en ${cfg.backlog}`)
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
  const mapa = sidsPorProyecto(proyectos, TRANSCRIPCIONES)
  return new Map(rutas.map((ruta) => [ruta, { ruta, modificado: statSync(ruta).mtime.toISOString(), ...asociar(parsearBitacora(readFileSync(ruta, 'utf8')), mapa) }]))
}

async function recolectar(opciones = {}) {
  mkdirSync(DATOS, { recursive: true })
  const bitacoras = leerBitacoras()
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
    return { id: p.id, nombre: p.nombre, repo: p.repo, backlogs, historial: actualizarHistorial(p, backlogs), planes: leerPlanes(p), git: leerGit(p), notas: leerNotas(p), bitacora: bitacoras.get(p.bitacora) || null, integraciones }
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
  const datos = { generado: new Date().toISOString(), servidor, favoritos: leerFavoritos(), proyectos: await recolectar(opciones) }
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
// Manejador HTTP (exportado para los tests: puerto y adaptadores inyectables).
export function crearManejador({ puerto = PUERTO, adaptadores = ADAPTADORES, alUsar = () => {} } = {}) {
  let cache = null
  const fresco = async (forzar) => { if (forzar || !cache || Date.now() - cache.t > 15000) cache = { t: Date.now(), ...(await construir(true, { adaptadores })) }; return cache }
  const permitidas = async () => new Set((await fresco()).datos.proyectos.flatMap((p) => [...p.backlogs.map((b) => b.ruta), ...p.planes.map((x) => x.ruta), p.notas?.ruta, p.bitacora?.ruta]).filter(Boolean))
  const enviar = (res, codigo, cuerpo, tipo = 'application/json; charset=utf-8') => {
    res.writeHead(codigo, { 'content-type': tipo, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))
  }
  const leerCuerpo = (req) => new Promise((ok, mal) => {
    let t = ''
    req.setEncoding('utf8')
    req.on('data', (c) => { t += c; if (t.length > 4e6) { mal(new Error('demasiado grande')); req.destroy() } })
    req.on('end', () => { try { ok(JSON.parse(t)) } catch (e) { mal(e) } })
  })
  return async (req, res) => {
    alUsar()
    const host = req.headers.host || ''
    if (host !== `127.0.0.1:${puerto}` && host !== `localhost:${puerto}`) return enviar(res, 403, { error: 'host no permitido' })
    const ruta = new URL(req.url, `http://${host}`).pathname
    try {
      if (req.method === 'GET' && (ruta === '/' || ruta === '/index.html')) return enviar(res, 200, (await fresco(true)).html, 'text/html; charset=utf-8')
      if (req.method === 'GET' && ruta === '/api/ping') return enviar(res, 200, { tablero: true })
      if (req.method === 'GET' && ruta === '/api/version') return enviar(res, 200, { version: huella() })
      if (req.method === 'GET' && ruta === '/api/datos') return enviar(res, 200, (await fresco(true)).datos)
      if (req.method !== 'POST') return enviar(res, 404, { error: 'no existe' })
      if (req.headers.origin !== `http://${host}` || !String(req.headers['content-type']).startsWith('application/json')) return enviar(res, 403, { error: 'origen no permitido' })
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
      return enviar(res, 404, { error: 'no existe' })
    } catch (e) {
      if (e instanceof ErrorSincronia) return enviar(res, e.estado, { error: e.message, paso: e.extra?.paso })
      if (e instanceof ErrorBitacora) return enviar(res, e.estado, { error: e.message })
      return enviar(res, 500, { error: String(e?.message || e) })
    }
  }
}
function servir() {
  let ultimo = Date.now()
  createServer(crearManejador({ alUsar: () => { ultimo = Date.now() } })).listen(PUERTO, '127.0.0.1')
  setInterval(() => { if (Date.now() - ultimo > INACTIVIDAD_MS) process.exit(0) }, 60e3)
}
async function servidorVivo() {
  try { return (await (await fetch(URL_LOCAL + 'api/ping', { signal: AbortSignal.timeout(600) })).json()).tablero === true } catch { return false }
}
// Abre el tablero servido (arranca el servidor en segundo plano si no corre); si falla, el archivo.
async function abrir() {
  if (!(await servidorVivo())) {
    spawn(process.execPath, [fileURLToPath(import.meta.url), '--servir'], { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 20 && !(await servidorVivo()); i++) await new Promise((r) => setTimeout(r, 150))
  }
  sh('open', [(await servidorVivo()) ? URL_LOCAL : join(AQUI, 'index.html')])
}

// ---------- Hook SessionStart: contexto breve para Claude ----------
function hookInicio() {
  let entrada = {}
  try { entrada = JSON.parse(readFileSync(0, 'utf8') || '{}') } catch {}
  const cwd = entrada.cwd || process.cwd()
  const p = proyectos.find((x) => [x.repo, ...x.docs].filter(Boolean).some((r) => cwd.startsWith(r) || r.startsWith(cwd + '/')))
  // Regenera en segundo plano para no frenar el arranque.
  spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore' }).unref()
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
  process.stdout.write(lineas.join('\n') + '\n')
}

// Solo corre al ejecutarse como programa (los tests importan el parser sin generar nada).
let esPrincipal = false
try { esPrincipal = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch {}
if (!esPrincipal) { /* importado */ }
else if (!existsSync(CONFIG) && (console.error('Falta proyectos.json: copia proyectos.ejemplo.json a proyectos.json y edítalo (ver README.md).'), true)) process.exitCode = 1
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
}
