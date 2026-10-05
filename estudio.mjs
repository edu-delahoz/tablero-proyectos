// Estudio de un plan (H19): un `claude -p` de solo lectura que explica el plan sin intentar mejorarlo.
// El servidor (generar.mjs) valida proyecto/plan, lanza un proceso por plan y reenvía los eventos como ndjson.
import { spawn } from 'node:child_process'
import { join, dirname, basename, relative, isAbsolute } from 'node:path'

export const HERRAMIENTAS = ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git diff:*)']
export const PROHIBIDAS = ['Edit', 'Write', 'NotebookEdit']
export const TUTOR = [
  'Eres un tutor que ayuda a Eduardo a estudiar un plan que él hizo contigo. No propongas mejoras ni cambios al plan: explícalo.',
  'Cuando te lo pida: lista lo técnico (lenguajes, librerías, archivos, comandos, patrones), di qué se le pide a Claude en cada paso',
  'y muéstralo en el código real del repositorio (archivo:línea, git log/show/diff de la rama). Responde en español llano, con markdown breve.',
  'Solo puedes leer: nunca edites ni crees archivos.',
].join(' ')

export const sesionValida = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(id)
const dentro = (ruta, dir) => { const r = relative(dir, ruta); return !!r && !r.startsWith('..') && !isAbsolute(r) }

// El prompt va por stdin: --allowedTools es variádico y se tragaría un argumento posicional.
export function argsEstudio({ plan, cwd, sesionId } = {}) {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--allowedTools', ...HERRAMIENTAS,
    '--disallowedTools', ...PROHIBIDAS,
    '--append-system-prompt', TUTOR,
    '--strict-mcp-config', // sin servidores MCP: solo las herramientas de lectura
    '--settings', '{"disableAllHooks":true}', // sin los hooks del usuario (notas al arrancar, regenerar el tablero al cerrar)
    ...(plan && cwd && !dentro(plan, cwd) ? ['--add-dir', dirname(plan)] : []),
    ...(sesionId ? ['--resume', sesionId] : []),
  ]
}

// Primer mensaje de las sesiones del tutor: el tablero las reconoce por él para no contarlas como trabajo.
export const MARCA_ESTUDIO = 'Plan a estudiar:'
export function promptEstudio({ plan, pregunta, sesionId }) {
  if (sesionId) return pregunta
  return `${MARCA_ESTUDIO} ${plan}\nLéelo completo con Read antes de responder.\n\n${pregunta}`
}

// Acciones rápidas de la vista (S56 pinta los botones con `etiqueta`).
export const ACCIONES = {
  tecnico: { etiqueta: 'Extrae lo técnico', pregunta: () => 'Extrae lo técnico del plan: lenguajes, librerías, archivos, comandos y patrones que aparecen, agrupados y con una línea de para qué sirve cada uno.' },
  pedidos: { etiqueta: '¿Qué le pide a Claude cada paso?', pregunta: () => 'Para cada sesión o paso del plan, ¿qué le pide a Claude exactamente? Una viñeta por paso: el pedido en llano y lo técnico entre paréntesis.' },
  sesion: { etiqueta: 'Explícame la sesión X', pregunta: ({ sesion }) => `Explícame la sesión ${sesion} del plan: qué buscaba, qué casillas tiene, qué decisiones toma y qué quedó (su «Resultado», si lo tiene).` },
  quedo: {
    etiqueta: 'Muéstrame cómo quedó',
    pregunta: ({ rama }) => rama
      ? `Muéstrame cómo quedó en el código: usa git log y git diff de la rama ${rama} frente a la principal y enséñame los cambios clave (archivo:línea) ligados a cada sesión del plan.`
      : 'Muéstrame cómo quedó en el código: busca los commits que nombran las sesiones o el «Resultado» del plan (git log --grep) y enséñame con git show los cambios clave (archivo:línea).',
  },
}
const CLAVE = /^S\d+[a-z]?$/i
const RAMA = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/
// Pregunta libre o acción rápida → texto para Claude; null si no vale.
export function preguntaDe({ accion, pregunta, sesion, rama } = {}) {
  if (accion != null) {
    const a = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null
    if (!a) return null
    if (accion === 'sesion' && !(typeof sesion === 'string' && CLAVE.test(sesion))) return null
    const r = typeof rama === 'string' && RAMA.test(rama) && !rama.includes('..') ? rama : null
    return a.pregunta({ sesion, rama: r })
  }
  const t = typeof pregunta === 'string' ? pregunta.trim() : ''
  return t && t.length <= 4000 ? t : null
}

// Una línea de stream-json → evento propio { tipo: sesion|texto|herramienta|fin } o null.
export function eventoDe(linea) {
  let o
  try { o = JSON.parse(linea) } catch { return null }
  if (!o || typeof o !== 'object') return null
  if (o.type === 'system' && o.subtype === 'init') return { tipo: 'sesion', sesionId: o.session_id }
  if (o.type === 'stream_event' && o.event?.type === 'content_block_delta' && o.event.delta?.type === 'text_delta') return { tipo: 'texto', texto: o.event.delta.text }
  if (o.type === 'assistant') {
    const uso = (o.message?.content || []).find((c) => c.type === 'tool_use')
    if (!uso) return null // el texto ya llegó en trozos (--include-partial-messages)
    const e = uso.input || {}
    return { tipo: 'herramienta', nombre: uso.name, detalle: String(e.file_path ?? e.pattern ?? e.command ?? e.path ?? '').slice(0, 300) }
  }
  if (o.type === 'result') return { tipo: 'fin', sesionId: o.session_id, texto: typeof o.result === 'string' ? o.result : '', error: !!o.is_error }
  return null
}

// Lanza el binario, le pasa el prompt por stdin y emite eventos por línea; `ms` es el tiempo máximo.
export function lanzarEstudio({ bin, args, entrada, cwd, ms, alEvento }) {
  const hijo = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let resto = '', error = '', porTiempo = false
  const detener = () => { if (hijo.exitCode === null && !hijo.killed) hijo.kill('SIGTERM') }
  const reloj = setTimeout(() => { porTiempo = true; detener() }, ms)
  hijo.stdout.setEncoding('utf8')
  hijo.stdout.on('data', (c) => {
    const lineas = (resto + c).split('\n')
    resto = lineas.pop()
    for (const l of lineas) { const e = eventoDe(l); if (e) alEvento(e) }
  })
  hijo.stderr.setEncoding('utf8')
  hijo.stderr.on('data', (c) => { error = (error + c).slice(-2000) })
  hijo.stdin.on('error', () => {})
  hijo.stdin.end(entrada)
  const hecho = new Promise((ok) => {
    const fin = (codigo, fallo) => {
      clearTimeout(reloj)
      const e = eventoDe(resto); if (e) alEvento(e)
      ok({ codigo, porTiempo, error: fallo ? String(fallo.message || fallo) : error.trim() })
    }
    hijo.on('error', (e) => fin(null, e.code === 'ENOENT' ? new Error(`No encuentro «${bin}» (instala Claude Code o define TABLERO_CLAUDE_BIN).`) : e))
    hijo.on('close', (codigo) => fin(codigo))
  })
  return { detener, hecho }
}

// Guía de estudio: datos/estudio/<proyecto>/<plan>.md (fuera de ~/.claude/plans, que el tablero lee como planes).
export const rutaGuia = (datos, proyecto, plan) => join(datos, 'estudio', String(proyecto).replace(/[^\w.-]/g, '_').replace(/^\.+/, (m) => '_'.repeat(m.length)), basename(plan))
export function anadirAGuia(texto, { plan, pregunta, respuesta, fecha }) {
  const base = texto ?? `# Guía de estudio — ${basename(plan)}\n\nPlan: \`${plan}\`\n`
  return `${base.replace(/\n*$/, '\n')}\n## ${fecha} — ${pregunta.replace(/\s+/g, ' ').trim()}\n\n${respuesta.trim()}\n`
}
