// Oficina de agentes (S57): qué hace ahora cada agente y subagente de Claude Code, para la escena de «Metodología».
// Puro: recibe los avisos del hook (~/.claude/oficina/eventos.jsonl, ver claude/hooks/eventos_agentes.mjs en
// metodologia-claude-code) y, de respaldo para las sesiones sin avisos, las colas de sus .jsonl ya parseadas.
// Nunca devuelve prompts ni contenido: solo acción, herramienta, nombre de archivo y cwd.
import { basename } from 'node:path'

export const ACCIONES = ['leyendo', 'escribiendo', 'ejecutando', 'buscando', 'esperando', 'pensando', 'quieto']
const POR_HERRAMIENTA = {
  Read: 'leyendo', NotebookRead: 'leyendo',
  Edit: 'escribiendo', Write: 'escribiendo', MultiEdit: 'escribiendo', NotebookEdit: 'escribiendo',
  Bash: 'ejecutando', BashOutput: 'ejecutando', PowerShell: 'ejecutando',
  Grep: 'buscando', Glob: 'buscando', WebSearch: 'buscando', WebFetch: 'buscando', ToolSearch: 'buscando', LSP: 'buscando',
}
export const accionDe = (herramienta) => POR_HERRAMIENTA[herramienta] || 'pensando'
// Sin avisos en este tiempo, el agente ya no está en la oficina (un subagente sin SubagentStop se cayó).
export const VIGENCIA = { principal: 30 * 60e3, subagente: 10 * 60e3 }
const vigente = (a, ahora) => ahora - a._m <= (a.principal ? VIGENCIA.principal : VIGENCIA.subagente)
const nombre = (f) => (typeof f === 'string' && f ? basename(f) : null)

// Un aviso del hook sobre el estado previo del agente → su estado nuevo (null: el aviso no cambia la acción).
function aplicar(a, e) {
  const [evento, tipoAviso] = String(e.evento || '').split(':')
  const fija = (accion, herramienta = null, archivo = null) => Object.assign(a, { accion, herramienta, archivo, desde: e.t })
  switch (evento) {
    case 'PreToolUse': return fija(accionDe(e.herramienta), e.herramienta || null, e.archivo || null)
    case 'PermissionRequest': return fija('esperando', e.herramienta || a.herramienta, e.archivo || a.archivo)
    case 'Notification':
      // permission_prompt llega siempre como «principal», aunque pida el subagente; ya lo marcó PermissionRequest.
      if (tipoAviso === 'idle_prompt') return fija('quieto')
      return a
    case 'Stop': case 'SessionStart': return fija('quieto')
    default: return fija('pensando') // PostToolUse, UserPromptSubmit, SubagentStart, PreCompact…
  }
}

// Respaldo desde la cola de un .jsonl: la herramienta pendiente (tool_use sin resultado), si no pensando o quieto.
function desdeCola(c) {
  const lineas = (c.lineas || []).filter((o) => (o?.type === 'assistant' || o?.type === 'user') && !o.isMeta)
  const ult = lineas.at(-1)
  if (!ult) return null
  const base = { sid: c.sid, agente: c.agente, tipo: c.tipo || null, principal: c.agente === 'principal', cwd: c.cwd || null, herramienta: null, archivo: null, desde: ult.timestamp || new Date(c.mtime).toISOString(), fuente: 'transcripcion', _m: c.mtime }
  const contenido = Array.isArray(ult.message?.content) ? ult.message.content : []
  if (ult.type === 'user') return { ...base, accion: 'pensando' }
  const usos = contenido.filter((x) => x?.type === 'tool_use')
  if (usos.length) {
    const u = usos.at(-1)
    return { ...base, accion: accionDe(u.name), herramienta: u.name || null, archivo: nombre(u.input?.file_path || u.input?.notebook_path) }
  }
  const terminado = ult.message?.stop_reason === 'end_turn'
  if (terminado && !base.principal) return null // el subagente entregó y salió
  return { ...base, accion: terminado ? 'quieto' : 'pensando' }
}

// → { agentes: [{ sid, agente, tipo, principal, accion, herramienta, archivo, cwd, desde, fuente }] }
// Las sesiones con avisos del hook mandan; las demás salen de su cola. Por sesión (la más reciente primero), el principal primero.
export function estadoOficina(eventos = [], colas = [], ahora = Date.now()) {
  const agentes = new Map()
  const conHook = new Set()
  const ordenados = eventos.filter((e) => e?.sid && e.t).map((e, i) => [Date.parse(e.t), i, e]).filter(([m]) => !Number.isNaN(m)).sort((x, y) => x[0] - y[0] || x[1] - y[1])
  for (const [m, , e] of ordenados) {
    conHook.add(e.sid)
    const agente = e.agente || 'principal'
    const clave = `${e.sid}\u0000${agente}`
    if (e.evento === 'SessionEnd') { for (const k of [...agentes.keys()]) if (k.startsWith(`${e.sid}\u0000`)) agentes.delete(k); continue }
    if (e.evento === 'SubagentStop') { agentes.delete(clave); continue }
    const a = agentes.get(clave) || { sid: e.sid, agente, tipo: e.tipo || null, principal: agente === 'principal', accion: 'pensando', herramienta: null, archivo: null, cwd: null, desde: e.t, fuente: 'hook' }
    a.tipo = e.tipo || a.tipo
    a.cwd = e.cwd || a.cwd
    a._m = m
    agentes.set(clave, aplicar(a, e))
  }
  const todos = [...agentes.values()]
  for (const c of colas) if (c?.sid && !conHook.has(c.sid)) { const a = desdeCola(c); if (a) todos.push(a) }
  const vivos = todos.filter((a) => vigente(a, ahora))
  const reciente = new Map()
  for (const a of vivos) reciente.set(a.sid, Math.max(reciente.get(a.sid) ?? -Infinity, a._m))
  vivos.sort((x, y) => reciente.get(y.sid) - reciente.get(x.sid) || x.sid.localeCompare(y.sid) || y.principal - x.principal || Date.parse(x.desde) - Date.parse(y.desde))
  return { agentes: vivos.map(({ _m, ...a }) => a) }
}

// ---------- S-OF1: placa, apariencia y reparto en salas ----------
// Placa: la sesión del backlog («Sesión SX de …» en el prompt de arranque), si no la primera S de las claves, la rama o el título.
const RE_SESION = /Sesión (S[\w-]*\d+[a-z]?) de/
export const sesionDe = (prompts = []) => { for (const t of prompts) { const m = String(t).match(RE_SESION); if (m) return m[1] } return null }
export const etiquetaDe = (r) => r ? (r.sesion || (r.foco?.claves || []).find((c) => c.startsWith('S')) || r.rama || r.titulo || null) : null

// Personaje determinista por sesión; el subagente viste la camiseta de su principal y lleva otro pelo.
const PALETAS = {
  camiseta: ['#e05d5d', '#4f8fd6', '#4fb07a', '#e3a33b', '#9b6ad6', '#2fb3b3', '#d66aa8', '#7c8a99'],
  pelo: ['#2b1d14', '#6b4226', '#c98b3c', '#e8d18a', '#8a8f98', '#b5432f'],
  piel: ['#f6d3b3', '#e0ac85', '#b97b56', '#7d4f33'],
  peinado: ['corto', 'largo', 'rapado', 'mono'],
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0 }
const elige = (lista, h) => lista[h % lista.length]
export function aparienciaDe(sid, agente = 'principal') {
  const hs = hash(sid)
  const base = { camiseta: elige(PALETAS.camiseta, hs), pelo: elige(PALETAS.pelo, hs >>> 3), piel: elige(PALETAS.piel, hs >>> 7), peinado: elige(PALETAS.peinado, hs >>> 11) }
  if (agente === 'principal') return base
  const ha = hash(`${sid}\u0000${agente}`)
  let i = (ha >>> 3) % PALETAS.pelo.length
  if (PALETAS.pelo[i] === base.pelo) i = (i + 1) % PALETAS.pelo.length
  return { camiseta: base.camiseta, pelo: PALETAS.pelo[i], piel: elige(PALETAS.piel, ha >>> 7), peinado: elige(PALETAS.peinado, ha >>> 11) }
}

// Sala: rejilla con paredes en el borde. Escritorios en la fila 3 (silla en la 4), estante arriba, terminal a la derecha,
// sofá abajo. Cada sala crece hacia la derecha con sus escritorios, así las casillas ya dadas siguen valiendo.
const ALTO_SALA = 10
const FILA_ESCRITORIO = 3
const anchoSala = (n) => Math.max(12, 4 * n + 6)
const ZONA = { leyendo: 'estante', buscando: 'estante', ejecutando: 'terminal', esperando: 'sofa', quieto: 'sofa', escribiendo: 'escritorio', pensando: 'escritorio' }
const zonaDe = (accion) => ZONA[accion] || 'escritorio'
const claveAgente = (a) => `${a.sid}\u0000${a.agente}`
const silla = (i) => ({ x: 2 + 4 * i, y: FILA_ESCRITORIO + 1 })
const anclaDe = (zona, sala) => zona === 'estante' ? { x: 1, y: 1 } : zona === 'terminal' ? { x: sala.ancho - 2, y: Math.floor(ALTO_SALA / 2) } : { x: 1, y: ALTO_SALA - 2 }

// → { salas: [{ id, proyecto, ancho, alto, escritorios: [{ sid, x, y }] }], agentes: [{ …a, casilla: { sala, x, y, zona } }] }
// Puro. `previa` (el resultado del sondeo anterior) mantiene salas, escritorios y casillas: solo se mueve quien cambia de zona.
export function distribuirOficina(agentes = [], previa = null) {
  const idSala = (a) => a.proyecto || 'otros'
  // Salas: las de antes en su orden; las nuevas, por la llegada más temprana de sus agentes.
  const llegada = new Map()
  for (const a of agentes) { const m = Date.parse(a.desde) || 0; const id = idSala(a); llegada.set(id, Math.min(llegada.get(id) ?? Infinity, m)) }
  const antes = (previa?.salas || []).map((s) => s.id).filter((id) => llegada.has(id))
  const nuevas = [...llegada.keys()].filter((id) => !antes.includes(id)).sort((x, y) => llegada.get(x) - llegada.get(y) || x.localeCompare(y))
  const salas = [...antes, ...nuevas].map((id) => {
    const vieja = previa?.salas?.find((s) => s.id === id)
    const presentes = new Set(agentes.filter((a) => a.principal && idSala(a) === id).map((a) => a.sid))
    const puestos = (vieja?.escritorios || []).map((e) => (presentes.has(e.sid) ? e.sid : null))
    const sinPuesto = agentes.filter((a) => a.principal && idSala(a) === id && !puestos.includes(a.sid)).sort((x, y) => (Date.parse(x.desde) || 0) - (Date.parse(y.desde) || 0) || x.sid.localeCompare(y.sid))
    for (const a of sinPuesto) { const libre = puestos.indexOf(null); if (libre >= 0) puestos[libre] = a.sid; else puestos.push(a.sid) }
    while (puestos.length && puestos.at(-1) === null) puestos.pop()
    const ancho = Math.max(anchoSala(puestos.length), vieja?.ancho || 0)
    return { id, proyecto: id === 'otros' ? null : id, ancho, alto: ALTO_SALA, escritorios: puestos.map((sid, i) => ({ sid, x: silla(i).x, y: FILA_ESCRITORIO })) }
  })
  const porId = new Map(salas.map((s) => [s.id, s]))
  const ocupadas = new Map(salas.map((s) => [s.id, new Set()]))
  const k = (x, y) => `${x},${y}`
  // Bloqueadas: los muebles y las sillas (cada silla es solo de su dueño).
  const bloqueada = (sala, x, y, quien) => sala.escritorios.some((e, i) => (e.x === x && e.y === y) || (silla(i).x === x && silla(i).y === y && e.sid !== quien))
  const libre = (sala, x, y, quien) => x >= 1 && x <= sala.ancho - 2 && y >= 1 && y <= sala.alto - 2 && !bloqueada(sala, x, y, quien) && !ocupadas.get(sala.id).has(k(x, y))
  const masCercana = (sala, ancla, quien) => {
    let mejor = null
    for (let y = 1; y <= sala.alto - 2; y++) for (let x = 1; x <= sala.ancho - 2; x++) {
      if (!libre(sala, x, y, quien)) continue
      const d = Math.abs(x - ancla.x) + Math.abs(y - ancla.y)
      if (!mejor || d < mejor.d) mejor = { x, y, d }
    }
    return mejor
  }
  const previas = new Map((previa?.agentes || []).map((a) => [claveAgente(a), a.casilla]))
  const destino = (a) => {
    const sala = porId.get(idSala(a))
    const zona = zonaDe(a.accion)
    if (zona !== 'escritorio') return { sala, zona, ancla: anclaDe(zona, sala) }
    const i = sala.escritorios.findIndex((e) => e.sid === a.sid)
    if (i >= 0) return { sala, zona, ancla: silla(i), propia: a.principal }
    return { sala, zona, ancla: { x: Math.floor(sala.ancho / 2), y: ALTO_SALA - 3 } }
  }
  const casillas = new Map()
  // 1) Quien sigue en la misma sala y zona conserva su casilla.
  for (const a of agentes) {
    const c = previas.get(claveAgente(a)), d = destino(a)
    if (c && c.sala === d.sala.id && c.zona === d.zona && libre(d.sala, c.x, c.y, a.principal ? a.sid : null)) {
      ocupadas.get(d.sala.id).add(k(c.x, c.y)); casillas.set(claveAgente(a), c)
    }
  }
  // 2) Los demás, principales primero, a la libre más cercana a su ancla (el principal a su silla).
  const resto = agentes.filter((a) => !casillas.has(claveAgente(a))).sort((x, y) => y.principal - x.principal || x.sid.localeCompare(y.sid) || x.agente.localeCompare(y.agente))
  for (const a of resto) {
    const d = destino(a)
    const quien = a.principal ? a.sid : null
    const p = d.propia && libre(d.sala, d.ancla.x, d.ancla.y, quien) ? d.ancla : masCercana(d.sala, d.ancla, quien)
    if (!p) continue // sala llena: no debería pasar, crece con los escritorios
    ocupadas.get(d.sala.id).add(k(p.x, p.y))
    casillas.set(claveAgente(a), { sala: d.sala.id, x: p.x, y: p.y, zona: d.zona })
  }
  return { salas, agentes: agentes.map((a) => ({ ...a, casilla: casillas.get(claveAgente(a)) || null })) }
}
