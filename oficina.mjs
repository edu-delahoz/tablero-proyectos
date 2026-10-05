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
      if (tipoAviso === 'permission_prompt') return fija('esperando', a.herramienta, a.archivo)
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
