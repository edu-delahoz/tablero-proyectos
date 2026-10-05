#!/usr/bin/env node
// Auditoría repetible del gasto de un día a partir de las transcripciones (~/.claude/projects) y,
// con --modelos, de la bitácora. Porta ../analisis/{analizar,b,c,e}.mjs. Se llama desde
//   node generar.mjs --auditoria <AAAA-MM-DD> [--modelos]      (comando `tablero --auditoria`)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import { UMBRAL_GRANDE, tokens, tipoDeTarea } from './metricas_jsonl.mjs'
import { parsearBitacora } from './bitacora.mjs'

// Peso de cada tipo de token en el «gasto» (relativo a la entrada sin caché).
export const PESOS = { entrada: 1, escritura: 2, lectura: 0.1, salida: 5 }
// Lectura buena: el extractor (`node …/backlog.mjs <cmd>` o el comando global `backlog <cmd>`).
const RE_EXTRACTOR = /(^|\s)(node\s+\S*backlog\.mjs|backlog)\s+(seccion|estado|arranque|indice)\b/
const RE_CAT = /(^|&&|;)\s*cat\s+[^|<>]+$/
const diaLocal = (ts) => { const d = new Date(ts); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) }
const diaUtc = (ts) => String(ts).slice(0, 10) // como b/c/e.mjs y las cifras de PLAN_EFICIENCIA
const redondeo = (n) => Math.round(n * 10) / 10

// Una transcripción, solo el día pedido → totales de esa sesión.
export function auditarSesion(texto, { dia, umbral = UMBRAL_GRANDE, utc = false } = {}) {
  const diaDe = utc ? diaUtc : diaLocal
  const s = { llamadas: 0, gasto: { entrada: 0, escritura: 0, lectura: 0, salida: 0 }, grandes: [], bashBacklog: { n: 0, tokens: 0 }, backlogCli: { n: 0, tokens: 0 }, catCompletos: { n: 0, tokens: 0 }, readSinLimite: { n: 0, tokens: 0 } }
  const usos = {}, porLlamada = new Map()
  const sumar = (o, t) => { o.n++; o.tokens += t }
  for (const linea of String(texto).split('\n')) {
    let l
    try { l = JSON.parse(linea) } catch { continue }
    if (!l || (dia && (!l.timestamp || diaDe(l.timestamp) !== dia))) continue
    if (l.type === 'assistant' && l.message?.usage) {
      porLlamada.set(l.requestId || l.message.id || l.uuid, l.message.usage) // el último usage de la llamada
      for (const b of l.message.content || []) if (b.type === 'tool_use') usos[b.id] = b
    }
    const c = l.message?.content
    if (l.type !== 'user' || !Array.isArray(c)) continue
    for (const b of c) {
      const u = b.type === 'tool_result' && usos[b.tool_use_id]
      if (!u) continue
      const t = tokens(b.content), entrada = u.input ?? {}
      if (t > umbral) s.grandes.push({ tool: u.name, tokens: t, entrada: JSON.stringify(entrada).slice(0, 100) })
      if (u.name === 'Read' && !entrada.limit && !entrada.offset && t > 3000) sumar(s.readSinLimite, t)
      if (u.name === 'Bash' && typeof entrada.command === 'string') {
        const cm = entrada.command
        const segs = cm.split(/&&|\|\||;|\|/)
        if (segs.some(RE_EXTRACTOR.test.bind(RE_EXTRACTOR))) sumar(s.backlogCli, t)
        // Hábito malo: un segmento que lee un BACKLOG*.md con sed -n / grep / awk (no el extractor, ni sed -i).
        if (segs.some((g) => /BACKLOG\w*\.md/.test(g) && /\b(sed\s+-n|grep|awk)\b/.test(g) && !RE_EXTRACTOR.test(g) && !/\bsed\s+-i/.test(g))) sumar(s.bashBacklog, t)
        if (RE_CAT.test(cm.trim())) sumar(s.catCompletos, t)
      }
    }
  }
  for (const u of porLlamada.values()) {
    s.gasto.entrada += u.input_tokens || 0
    s.gasto.escritura += u.cache_creation_input_tokens || 0
    s.gasto.lectura += u.cache_read_input_tokens || 0
    s.gasto.salida += u.output_tokens || 0
  }
  s.llamadas = porLlamada.size
  return s
}

// archivos: [{ proyecto, sid, texto }] → totales del día.
export function auditar(archivos, { dia, umbral, utc } = {}) {
  const r = { dia, sesiones: 0, llamadas: 0, gasto: { crudo: { entrada: 0, escritura: 0, lectura: 0, salida: 0 }, ponderado: 0, partes: {} }, grandes: [], bashBacklog: { n: 0, tokens: 0 }, backlogCli: { n: 0, tokens: 0 }, catCompletos: { n: 0, tokens: 0 }, readSinLimite: { n: 0, tokens: 0 } }
  for (const a of archivos) {
    const s = auditarSesion(a.texto, { dia, umbral, utc })
    if (!s.llamadas) continue
    r.sesiones++; r.llamadas += s.llamadas
    for (const k in s.gasto) r.gasto.crudo[k] += s.gasto[k]
    for (const g of s.grandes) r.grandes.push({ ...g, sid: a.sid, proyecto: a.proyecto })
    for (const k of ['bashBacklog', 'backlogCli', 'catCompletos', 'readSinLimite']) { r[k].n += s[k].n; r[k].tokens += s[k].tokens }
  }
  for (const k in PESOS) r.gasto.ponderado += r.gasto.crudo[k] * PESOS[k]
  for (const k in PESOS) {
    const p = r.gasto.crudo[k] * PESOS[k]
    r.gasto.partes[k] = { tokens: r.gasto.crudo[k], ponderado: p, pct: r.gasto.ponderado ? redondeo(p / r.gasto.ponderado * 100) : 0 }
  }
  r.grandes.sort((a, b) => b.tokens - a.tokens)
  return r
}

// Transcripciones con actividad ese día en <home>/.claude/projects.
export function leerTranscripciones(dia, raiz = join(homedir(), '.claude', 'projects')) {
  const r = []
  let dirs = []
  try { dirs = readdirSync(raiz) } catch {}
  for (const p of dirs) {
    const d = join(raiz, p)
    let fs = []
    try { if (!statSync(d).isDirectory()) continue; fs = readdirSync(d) } catch { continue }
    for (const f of fs) {
      if (!f.endsWith('.jsonl')) continue
      try {
        if (statSync(join(d, f)).mtime < new Date(dia)) continue
        r.push({ proyecto: p.replace(/^-Users-[^-]+-(Desktop-)?(Desarrollo-)?/, ''), sid: basename(f, '.jsonl').slice(0, 8), texto: readFileSync(join(d, f), 'utf8') })
      } catch {}
    }
  }
  return r
}

const k = (n) => `${Math.round(n / 1000)}k`
const fila = (etiqueta, o) => `- ${etiqueta}: ${o.n} · ${k(o.tokens)} tokens`

export function textoAuditoria(r, dia = r.dia) {
  const g = r.gasto
  const L = [`Auditoría del ${dia}: ${r.sesiones} sesiones · ${r.llamadas} llamadas`, '', '## Composición del gasto (tokens ponderados: entrada ×1, escritura de caché ×2, lectura de caché ×0,1, salida ×5)']
  for (const [n, e] of [['entrada', 'Entrada'], ['escritura', 'Escritura de caché'], ['lectura', 'Lectura de caché'], ['salida', 'Salida']]) L.push(`- ${e}: ${k(g.partes[n].tokens)} tokens → ${k(g.partes[n].ponderado)} ponderados (${g.partes[n].pct} %)`)
  L.push(`- Total ponderado: ${k(g.ponderado)}`, '', `## Tool results >${UMBRAL_GRANDE / 1000}k (${r.grandes.length}, suma ${k(r.grandes.reduce((a, b) => a + b.tokens, 0))})`)
  for (const b of r.grandes.slice(0, 25)) L.push(`- ${k(b.tokens)} · ${b.sid} · ${b.proyecto.slice(0, 20)} · ${b.tool} · ${b.entrada}`)
  L.push('', '## Bash sobre BACKLOG (sed -n / grep / awk)', fila('llamadas', r.bashBacklog), '', '## Extractor `backlog.mjs` (hábito bueno)', fila('llamadas', r.backlogCli), '', '## `cat` completos (sin acotar)', fila('llamadas', r.catCompletos), '', '## Read sin límite (>3k tokens, sin offset ni limit)', fila('lecturas', r.readSinLimite))
  return L.join('\n')
}

// --utc: el día se corta en UTC en vez de la hora local.
// ---- --modelos: Sn de ejecución con effort medio, Opus frente a Sonnet -------------------------
const familia = (m) => (String(m ?? '').match(/opus|sonnet|haiku|fable/i) || [])[0]?.toLowerCase() ?? null
const mediana = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function porModelo(textoBitacora) {
  const tareas = new Map() // clave de la Sn → { modelo, costo, retrabajo (costo de sus Snb), nb }
  const filas = parsearBitacora(textoBitacora).registro
  for (const f of filas) {
    if (tipoDeTarea(f.tarea) !== 'Sn') continue
    const t = tareas.get(f.tarea) ?? { modelo: null, medio: true, costo: 0, retrabajo: 0, nb: 0 }
    t.modelo ??= familia(f.modelo)
    // Opus/Sonnet 5.x tienen effort medio por defecto (PLAN_EFICIENCIA, Exp. 10c): solo se excluye lo explícito o 4.x.
    if (/\((low|high|xhigh|max)\)|\b4\.\d/i.test(f.modelo)) t.medio = false
    t.costo += f.costo ?? 0
    tareas.set(f.tarea, t)
  }
  for (const f of filas) {
    if (tipoDeTarea(f.tarea) !== 'Snb') continue
    const t = tareas.get(f.tarea.replace(/[a-z]+$/, ''))
    if (t) { t.retrabajo += f.costo ?? 0; t.nb++ }
  }
  const grupos = {}
  for (const t of tareas.values()) if (t.medio && ['opus', 'sonnet'].includes(t.modelo)) (grupos[t.modelo] ??= []).push(t)
  return Object.entries(grupos).sort().map(([modelo, ts]) => {
    const conRetrabajo = ts.filter((t) => t.nb).length
    return {
      modelo, n: ts.length, conRetrabajo, tasa: conRetrabajo / ts.length,
      costoMediano: mediana(ts.map((t) => t.costo)),
      costoMedianoConRetrabajo: mediana(ts.map((t) => t.costo + t.retrabajo)),
    }
  })
}

export function textoModelos(m) {
  const d = (n) => (n == null ? '—' : `$${n.toFixed(2)}`)
  const L = ['## Sn de ejecución con effort medio, por modelo', '', 'modelo | n | con Snb | tasa Snb/Sn | costo mediano Sn | costo mediano con Snb']
  for (const x of m) L.push(`${x.modelo} | ${x.n} | ${x.conRetrabajo} | ${Math.round(x.tasa * 100)} % | ${d(x.costoMediano)} | ${d(x.costoMedianoConRetrabajo)}`)
  if (!m.length) L.push('(sin filas Sn con effort medio)')
  return L.join('\n')
}

// Pestaña Bitácora: auditoría de los últimos `dias` días (hora local, el más reciente primero) + Opus frente a Sonnet.
// Sin transcripciones → null (la tarjeta no se muestra).
export function auditoriaPanel(archivos, textoBitacora, { hoy = diaLocal(Date.now()), dias = 7 } = {}) {
  if (!archivos.length) return null
  const lista = Array.from({ length: dias }, (_, i) => new Date(Date.parse(hoy) - i * 864e5).toISOString().slice(0, 10))
  // /api/datos no debe llevar la palabra «token» (guarda contra fugas) → `volumen`; y sin `entrada` (comandos de la sesión).
  const limpiar = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'entrada' && typeof x === 'string' ? undefined : x)).replace(/"tokens":/g, '"volumen":'))
  return { dias: lista.map((dia) => limpiar(auditar(archivos, { dia }))), modelos: textoBitacora ? porModelo(textoBitacora) : [] }
}

// Lee las transcripciones una vez (desde el día más antiguo) y arma el panel.
export function auditoriaDe(raiz, textoBitacora, opciones = {}) {
  const dias = opciones.dias ?? 7, hoy = opciones.hoy ?? diaLocal(Date.now())
  const desde = new Date(Date.parse(hoy) - (dias - 1) * 864e5).toISOString().slice(0, 10)
  return auditoriaPanel(leerTranscripciones(desde, raiz), textoBitacora, { hoy, dias })
}
