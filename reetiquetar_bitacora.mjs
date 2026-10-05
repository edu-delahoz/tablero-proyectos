#!/usr/bin/env node
// Re-etiqueta la columna «Sesión / tarea» de BITACORA.md con la tarea del primer prompt de cada
// sesión (misma regex que registrar_sesion.sh, en metricas_jsonl.mjs). Las filas sin coincidencia
// no se tocan.
//   node reetiquetar_bitacora.mjs [--dry-run] [--bitacora <ruta>] [--transcripciones <dir>]
import { readFileSync, writeFileSync, openSync, readSync, closeSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsearBitacora, sidsPorProyecto, asociar, escaparCelda } from './bitacora.mjs'
import { metricasJsonl, tareaDePrompt, tipoDeTarea } from './metricas_jsonl.mjs'

// primerPromptDe(sid) → texto | null. Devuelve { texto, cambios: [{ linea, sid, antes, despues }], salenDeOtro }.
export function reetiquetar(texto, primerPromptDe) {
  const lineas = String(texto).split('\n')
  const cambios = []
  for (const f of parsearBitacora(texto).registro) {
    if (!f.sid) continue
    const despues = tareaDePrompt(primerPromptDe(f.sid))
    if (!despues || despues === f.tarea) continue
    const antes = `| ${escaparCelda(f.tarea)} (${f.sid}) |`
    if (!lineas[f.linea].includes(antes)) continue
    lineas[f.linea] = lineas[f.linea].replace(antes, `| ${escaparCelda(despues)} (${f.sid}) |`)
    cambios.push({ linea: f.linea + 1, sid: f.sid, antes: f.tarea, despues })
  }
  const salenDeOtro = cambios.filter((c) => tipoDeTarea(c.antes) === 'otro' && tipoDeTarea(c.despues) !== 'otro').length
  return { texto: lineas.join('\n'), cambios, salenDeOtro }
}

// Primer prompt de un .jsonl leyendo solo el principio (los prompts van arriba).
function primerPromptDeArchivo(ruta) {
  try {
    const fd = openSync(ruta, 'r')
    try {
      const buf = Buffer.alloc(512 * 1024)
      const n = readSync(fd, buf, 0, buf.length, 0)
      return metricasJsonl(buf.toString('utf8', 0, n)).primerPrompt
    } finally { closeSync(fd) }
  } catch { return null }
}

let esPrincipal = false
try { esPrincipal = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch {}
if (esPrincipal) {
  const a = process.argv.slice(2)
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d }
  const seco = a.includes('--dry-run')
  const ruta = opt('--bitacora', join(homedir(), 'Desktop/Desarrollo/metodologia-claude/BITACORA.md'))
  const dir = opt('--transcripciones', join(homedir(), '.claude/projects'))
  const texto = readFileSync(ruta, 'utf8')
  const rutas = new Map()
  // Un único «proyecto» con prefijo «-»: casa con todas las carpetas de transcripción.
  const conRuta = asociar(parsearBitacora(texto), sidsPorProyecto([{ id: '*', transcripciones: '-' }], dir, rutas), rutas)
  const sinTranscripcion = conRuta.registro.filter((f) => f.sid && !rutas.has(f.sid)).length
  const r = reetiquetar(texto, (sid) => (rutas.has(sid) ? primerPromptDeArchivo(rutas.get(sid)) : null))
  for (const c of r.cambios) console.log(`L${c.linea} ${c.sid}: ${c.antes}  →  ${c.despues}`)
  const filas = conRuta.registro.length
  console.log(`\n${filas} filas · ${r.cambios.length} re-etiquetadas · salen de «otro»: ${r.salenDeOtro} · sin transcripción: ${sinTranscripcion}`)
  if (seco) console.log('(--dry-run: no se escribió nada)')
  else if (r.cambios.length) writeFileSync(ruta, r.texto)
}
