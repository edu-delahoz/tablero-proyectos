#!/usr/bin/env node
// Métricas de una sesión desde su transcripción (.jsonl de ~/.claude/projects) y la tarea derivada
// del primer prompt. La regex de tarea vive solo aquí: la usan registrar_sesion.sh (vía la CLI) y
// reetiquetar_bitacora.mjs.
//   node metricas_jsonl.mjs <ruta.jsonl> [--session-name <nombre>]  → JSON en stdout
import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// «Sesión S4b de BACKLOG_H3.md» → BACKLOG_H3/S4b (también E4, ruta delante, sin .md). Admite las
// variantes viejas «Sesión H3 personas S1b de …» y «Sesión S2c (H3 personas) de …».
export const RE_TAREA = /Sesi[oó]n\s+(?:[^\n.()]{0,30}?\s)?([SE]\d+[a-z]*)(?:\s*\([^)\n]*\))?\s+de\s+(?:\S*\/)?(BACKLOG[\w.-]*?)(?:\.md)?(?=[\s.,;:)`]|$)/
export const UMBRAL_GRANDE = 5000

export function tareaDePrompt(texto) {
  const m = String(texto ?? '').match(RE_TAREA)
  return m ? `${m[2]}/${m[1]}` : null
}
export const tareaDeSesion = (primerPrompt, sessionName) => tareaDePrompt(primerPrompt) || sessionName || 'sin nombre'

// Tipo de tarea para agrupar costos (PLAN_EFICIENCIA 2d).
export function tipoDeTarea(t) {
  const s = String(t ?? '')
  const clave = s.match(/^BACKLOG[\w.-]*\/[A-Z]+(\d+)([a-z]*)$/)
  if (clave) return clave[1] === '0' ? 'plan' : clave[2] ? 'Snb' : 'Sn'
  if (/cierre|relevo/i.test(s)) return 'cierre'
  if (/migraci[oó]n/i.test(s)) return 'migración'
  if (/cat[aá]logo/i.test(s)) return 'catálogo'
  if (/\bplan\b|auditor[ií]a|revisi[oó]n/i.test(s)) return 'plan'
  return 'otro'
}

// Familia del modelo en «Opus», «claude-sonnet-5-5» o «Sonnet 5.5 (medium)»; null si no se reconoce.
const familia = (m) => (String(m ?? '').match(/opus|sonnet|haiku|fable/i) || [])[0]?.toLowerCase() ?? null
export const modeloDistinto = (plan, real) => { const a = familia(plan), b = familia(real); return !!(a && b && a !== b) }

// «BACKLOG_H3/S4b» → modelo que el backlog BACKLOG_H3.md pide en el prompt de S4b (árbol de estructura()), o null.
export function modeloPlanDe(tarea, backlogs) {
  const m = String(tarea ?? '').match(/^(BACKLOG[\w.-]*)\/([A-Z]+\d+[a-z]*)$/)
  const b = m && backlogs.find((x) => x.archivo === `${m[1]}.md`)
  if (!b) return null
  const plano = (ss) => ss.flatMap((s) => [s, ...plano(s.hijas || [])])
  return plano(b.estructura || []).flatMap((s) => s.prompts || []).find((p) => p.clave === m[2] && p.modelo)?.modelo ?? null
}

// Tokens estimados como caracteres/4; una imagen, 1600 (mismo criterio que ../analisis).
export const tokens = (c) => Array.isArray(c)
  ? c.reduce((a, b) => a + (b?.type === 'image' ? 1600 : tokens(b?.text ?? b)), 0)
  : Math.round((typeof c === 'string' ? c : JSON.stringify(c ?? '')).length / 4)
const esPrompt = (l, t) => !l.isMeta && typeof t === 'string' && t.trim() && !t.startsWith('<')

export function metricasJsonl(texto, { umbral = UMBRAL_GRANDE } = {}) {
  const r = { llamadas: 0, prompts: 0, ctxFinal: 0, ctxMax: 0, resultadosGrandes: [], primerPrompt: null, modelos: [] }
  const llamadas = new Set(), usos = {}, modelos = new Set()
  for (const linea of String(texto).split('\n')) {
    let l
    try { l = JSON.parse(linea) } catch { continue }
    if (!l || l.isSidechain) continue
    if (l.type === 'assistant' && l.message?.usage) {
      const u = l.message.usage
      llamadas.add(l.requestId || l.message.id || l.uuid)
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
      if (ctx) { r.ctxFinal = ctx; r.ctxMax = Math.max(r.ctxMax, ctx) }
      if (l.message.model && l.message.model !== '<synthetic>') modelos.add(l.message.model)
      for (const b of l.message.content || []) if (b.type === 'tool_use') usos[b.id] = b
    }
    if (l.type !== 'user') continue
    const c = l.message?.content
    const textos = typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text) : []
    for (const t of textos) if (esPrompt(l, t)) { r.prompts++; r.primerPrompt ??= t }
    if (Array.isArray(c)) for (const b of c) {
      if (b.type !== 'tool_result' || !usos[b.tool_use_id]) continue
      const n = tokens(b.content), u = usos[b.tool_use_id]
      if (n > umbral) r.resultadosGrandes.push({ tool: u.name, tokens: n, entrada: JSON.stringify(u.input ?? {}).slice(0, 100) })
    }
  }
  r.llamadas = llamadas.size
  r.modelos = [...modelos]
  return r
}

let esPrincipal = false
try { esPrincipal = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch {}
if (esPrincipal) {
  const a = process.argv.slice(2)
  const i = a.indexOf('--session-name')
  const nombre = i >= 0 ? a[i + 1] : null
  const ruta = a.find((x, j) => !x.startsWith('--') && a[j - 1] !== '--session-name')
  let m = metricasJsonl('')
  try { if (ruta && existsSync(ruta)) m = metricasJsonl(readFileSync(ruta, 'utf8')) } catch {}
  process.stdout.write(JSON.stringify({ ...m, tarea: tareaDeSesion(m.primerPrompt, nombre) }) + '\n')
}
