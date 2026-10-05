// Vistas de eficiencia (PLAN_EFICIENCIA 2a–2d): umbrales de color, calibración «$ por 1 %» por ventana de límites,
// estimación «quedan ~N sesiones tipo X» y costo por tipo de tarea. Puro: generar.mjs lee las fotos y la bitácora.
import { tipoDeTarea } from './metricas_jsonl.mjs'

// Cortes de PLAN_EFICIENCIA 2a (los de contexto coinciden con vigilar_contexto.sh).
export const semaforoLlamadas = (n) => (n == null ? null : n < 15 ? 'verde' : n <= 30 ? 'ambar' : 'rojo')
export const semaforoCtx = (tokens) => (tokens == null ? null : tokens < 100000 ? 'verde' : tokens <= 130000 ? 'ambar' : 'rojo')

const ordenar = (xs) => xs.slice().sort((a, b) => a - b)
export const mediana = (xs) => { const s = ordenar(xs); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
export const p90 = (xs) => { const s = ordenar(xs); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)] : null }
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100)

// Por ventana (resets_at del cierre de cada sesión): costo de sus filas ÷ el mayor % alcanzado. La vigente es la
// más reciente. Las sesiones que cruzan ventanas se atribuyen a la del cierre; el % incluye uso fuera de Claude Code.
function deVentana(metricas, filas, clave) {
  const costo = new Map(filas.filter((f) => f.sid && f.costo != null).map((f) => [f.sid, f.costo]))
  const ventanas = new Map()
  for (const m of metricas) {
    const v = m.limites?.fin?.[clave]
    if (!v || v.resets_at == null || v.used_percentage == null) continue
    const w = ventanas.get(v.resets_at) || { resetsAt: v.resets_at, pct: 0, costo: 0, sesiones: 0 }
    w.pct = Math.max(w.pct, v.used_percentage)
    w.costo += costo.get(String(m.sid).slice(0, 8)) ?? 0
    w.sesiones++
    ventanas.set(v.resets_at, w)
  }
  const w = [...ventanas.values()].sort((a, b) => b.resetsAt - a.resetsAt)[0]
  if (!w) return null
  return { pct: w.pct, resetsAt: w.resetsAt, fecha: new Date(w.resetsAt * 1000).toISOString(), costo: r2(w.costo), sesiones: w.sesiones, porPct: w.pct > 0 ? r2(w.costo / w.pct) : null }
}
export const calibrar = (metricas, filas) => ({ cinco: deVentana(metricas, filas, 'five_hour'), siete: deVentana(metricas, filas, 'seven_day') })

// N = (100 − %usado) × ($ por 1 %) ÷ mediana $ del tipo.
export const quedan = (v, mediana$) => (v?.porPct > 0 && mediana$ > 0 ? Math.floor(((100 - v.pct) * v.porPct) / mediana$) : null)

// Una tarea ocupa varias filas (por /clear): se suman y luego se agrupa por tipo.
export function costoPorTipo(filas, { porPct5h = null } = {}) {
  const tareas = new Map()
  for (const f of filas) {
    if (f.costo == null) continue
    const t = tareas.get(f.tarea) || { costo: 0, minutos: 0 }
    t.costo += f.costo; t.minutos += f.minutos ?? 0
    tareas.set(f.tarea, t)
  }
  const tipos = new Map()
  for (const [tarea, t] of tareas) { const k = tipoDeTarea(tarea); tipos.set(k, [...(tipos.get(k) || []), t]) }
  return [...tipos].map(([tipo, ts]) => {
    const med = mediana(ts.map((t) => t.costo))
    return { tipo, n: ts.length, mediana: r2(med), p90: r2(p90(ts.map((t) => t.costo))), minutos: Math.round(mediana(ts.map((t) => t.minutos))), pct5h: porPct5h > 0 ? r2(med / porPct5h) : null }
  }).sort((a, b) => b.n - a.n)
}

export function eficienciaDe(metricas, filas) {
  const limites = calibrar(metricas, filas)
  const porTipo = costoPorTipo(filas, { porPct5h: limites.cinco?.porPct })
  const quedanTipos = porTipo.filter((t) => ['Sn', 'Snb', 'plan'].includes(t.tipo)).map((t) => ({ tipo: t.tipo, mediana: t.mediana, cinco: quedan(limites.cinco, t.mediana), siete: quedan(limites.siete, t.mediana) }))
  return { limites, porTipo, quedan: quedanTipos }
}
