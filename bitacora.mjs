// Bitácora de sesiones (BITACORA.md de metodologia-claude): parser, asociación a proyectos y
// edición de una sola fila. Formato de fila: el que escribe ../registrar_sesion.sh (hook SessionEnd):
// | Fecha | Tarea (sid8) | Modo | Modelo | ~N min | $X | ctx Ak→Bk 🟢 | Calidad | Seguridad | Notas |
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export const PENDIENTE = '_pendiente_'
export const CALIDADES = ['✅', '🟡', '🔴']
const RE_SID = /\(([0-9a-f]{8})\)/
const COL = { calidad: 7, seguridad: 8, notas: 9 }
export class ErrorBitacora extends Error { constructor(msg, estado) { super(msg); this.estado = estado } }

export const hashBitacora = (t) => createHash('sha1').update(t).digest('hex')
export const escaparCelda = (t) => String(t).replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
export const desescaparCelda = (t) => String(t).replace(/\\([\\|])/g, '$1')

// Segmentos crudos entre «|» no escapados (incluye el vacío antes del primero y después del último).
function segmentos(linea) {
  const r = []
  let act = ''
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '\\' && i + 1 < linea.length) { act += c + linea[++i]; continue }
    if (c === '|') { r.push(act); act = '' } else act += c
  }
  r.push(act)
  return r
}
export const celdas = (linea) => segmentos(linea.trim()).slice(1, -1).map((c) => desescaparCelda(c.trim()))
const esTabla = (l) => /^\s*\|/.test(l)
const esSeparador = (l) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l)

const numero = (t) => { const m = String(t).replace(',', '.').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null }
export function analizarContexto(t) {
  const m = String(t).match(/(\d+)k\s*→\s*(\d+)k/)
  const solo = !m && String(t).match(/(\d+)k/)
  return { ini: m ? +m[1] : null, fin: m ? +m[2] : solo ? +solo[1] : null, semaforo: (String(t).match(/🟢|🟡|🔴/) || [null])[0] }
}

function fila(c, linea) {
  const sid = (c[1].match(RE_SID) || [])[1] || null
  return {
    linea, sid, fecha: c[0], tarea: c[1].replace(RE_SID, '').trim(), modo: c[2], modelo: c[3],
    duracion: c[4], minutos: numero(c[4]), costoTxt: c[5], costo: numero(c[5]),
    contextoTxt: c[6], contexto: analizarContexto(c[6]),
    calidad: c[7], seguridad: c[8], notas: c[9] ?? '',
    pendiente: c[7] === PENDIENTE || c[8] === PENDIENTE,
  }
}

// { registro: [fila], semanal: { columnas, filas }, experimentos: [{ titulo, texto }], lecciones: [{ fecha, texto }], hash }
export function parsearBitacora(texto) {
  const lineas = String(texto).split('\n')
  const r = { registro: [], semanal: { columnas: [], filas: [] }, experimentos: [], lecciones: [], hash: hashBitacora(String(texto)) }
  let seccion = '', cabecera = null, exp = null
  lineas.forEach((l, i) => {
    const h2 = l.match(/^##\s+(.+?)\s*$/)
    if (h2) { seccion = h2[1].toLowerCase(); cabecera = null; exp = null; return }
    if (esTabla(l)) {
      if (esSeparador(l)) return
      const c = celdas(l)
      if (!cabecera) { cabecera = c; if (/resumen semanal/.test(seccion)) r.semanal.columnas = c; return }
      if (c.every((x) => !x)) return
      if (/^registro/.test(seccion) && c.length >= 10) r.registro.push(fila(c, i))
      else if (/resumen semanal/.test(seccion)) r.semanal.filas.push(c)
      return
    }
    cabecera = null
    if (/experimentos/.test(seccion)) {
      const h3 = l.match(/^###\s+(.+?)\s*$/)
      if (h3) { exp = { titulo: h3[1], texto: '' }; r.experimentos.push(exp) }
      else if (exp && l.trim() !== '---') exp.texto += l + '\n'
    } else if (/lecciones/.test(seccion)) {
      const m = l.match(/^\s*[-*]\s+(?:\*\*([^*]+)\*\*\s*[—–-]\s*)?(.+)$/)
      if (m) r.lecciones.push({ fecha: m[1] || null, texto: m[2].trim() })
    }
  })
  for (const e of r.experimentos) e.texto = e.texto.trim()
  return r
}

// sid corto (8 hex) → id de proyecto, por los <sid>.jsonl de las carpetas de transcripción de cada
// proyecto. Si una carpeta casa con el prefijo de varios proyectos, gana el prefijo más largo.
// Si se pasa `rutas` (Map), se llena sid → ruta del .jsonl (para leer la rama con ramaDeTranscripcion).
export function sidsPorProyecto(proyectos, dirTranscripciones, rutas = new Map()) {
  const mapa = new Map()
  if (!existsSync(dirTranscripciones)) return mapa
  const conPrefijo = proyectos.filter((p) => p.transcripciones)
  for (const d of readdirSync(dirTranscripciones)) {
    const p = conPrefijo.filter((x) => d.startsWith(x.transcripciones)).sort((a, b) => b.transcripciones.length - a.transcripciones.length)[0]
    if (!p) continue
    let archivos = []
    try { archivos = readdirSync(join(dirTranscripciones, d)) } catch { continue }
    for (const f of archivos) if (/^[0-9a-f]{8}.*\.jsonl$/.test(f) && !mapa.has(f.slice(0, 8))) {
      mapa.set(f.slice(0, 8), p.id)
      rutas.set(f.slice(0, 8), join(dirTranscripciones, d, f))
    }
  }
  return mapa
}

// Primer `gitBranch` no vacío en las ~50 primeras líneas del .jsonl (o null). Cache por ruta y mtime.
const cacheRamas = new Map()
export function ramaDeTranscripcion(ruta) {
  let mtime
  try { mtime = statSync(ruta).mtimeMs } catch { return null }
  const c = cacheRamas.get(ruta)
  if (c && c.mtime === mtime) return c.rama
  let rama = null
  try {
    const fd = openSync(ruta, 'r')
    try {
      const buf = Buffer.alloc(256 * 1024)
      const n = readSync(fd, buf, 0, buf.length, 0)
      for (const l of buf.toString('utf8', 0, n).split('\n').slice(0, 50)) {
        const m = l.match(/"gitBranch"\s*:\s*"([^"]+)"/)
        if (m) { rama = m[1]; break }
      }
    } finally { closeSync(fd) }
  } catch { rama = null }
  cacheRamas.set(ruta, { mtime, rama })
  return rama
}

export const asociar = (bit, mapa, rutas = new Map()) => ({
  ...bit,
  registro: bit.registro.map((f) => ({ ...f, proyecto: (f.sid && mapa.get(f.sid)) || null, rama: (f.sid && rutas.has(f.sid) ? ramaDeTranscripcion(rutas.get(f.sid)) : null) })),
})

// Semana ISO («2026-W40») de una fecha AAAA-MM-DD.
export function semanaISO(fecha) {
  const d = new Date(`${fecha}T00:00:00Z`)
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const ini = Date.UTC(d.getUTCFullYear(), 0, 1)
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - ini) / 864e5 + 1) / 7)).padStart(2, '0')}`
}
// «Opus 5.5» → «Opus»; vacío → null.
export const normalizarModelo = (m) => { const t = String(m ?? '').trim().replace(/[\s-]*v?\d+(?:[.,]\d+)*.*$/, ''); return t || null }

// Agrega el registro por 'dia'|'semana'|'mes'|'rama'|'modelo' → { grupos: [{ clave, costo, minutos, sesiones }], excluidas }.
// Se excluyen (y se cuentan en `excluidas`) las filas con costo «?» y, por tiempo, las de fecha incompleta;
// por rama, las sin rama. Orden: por clave en fechas; por costo descendente en rama/modelo.
export function agregar(registro, { por }) {
  const tiempo = { dia: (f) => f, semana: semanaISO, mes: (f) => f.slice(0, 7) }[por]
  if (!tiempo && por !== 'rama' && por !== 'modelo') throw new Error(`agregar: «por» desconocido (${por})`)
  const grupos = new Map()
  let excluidas = 0
  for (const f of registro) {
    const fecha = (String(f.fecha).match(/^\d{4}-\d{2}-\d{2}/) || [])[0]
    const clave = tiempo ? (fecha && tiempo(fecha)) : por === 'rama' ? f.rama : normalizarModelo(f.modelo)
    if (!clave || f.costo == null) { excluidas++; continue }
    const g = grupos.get(clave) || { clave, costo: 0, minutos: 0, sesiones: 0 }
    g.costo += f.costo; g.minutos += f.minutos ?? 0; g.sesiones++
    grupos.set(clave, g)
  }
  const lista = [...grupos.values()].map((g) => ({ ...g, costo: Math.round(g.costo * 100) / 100 }))
  lista.sort(tiempo ? (a, b) => a.clave.localeCompare(b.clave) : (a, b) => b.costo - a.costo)
  return { grupos: lista, excluidas }
}

// Valida lo que llega del navegador; devuelve los valores limpios.
export function validarEdicion({ sid, calidad, seguridad, notas } = {}) {
  if (typeof sid !== 'string' || !/^[0-9a-f]{8}$/.test(sid)) throw new ErrorBitacora('Falta el id corto de la sesión (8 caracteres hex).', 400)
  const textos = { calidad, seguridad, notas: notas ?? '' }
  for (const [k, v] of Object.entries(textos)) {
    if (typeof v !== 'string') throw new ErrorBitacora(`«${k}» debe ser texto.`, 400)
    if (/[\r\n]/.test(v)) throw new ErrorBitacora(`«${k}» no puede tener saltos de línea.`, 400)
    if (v.length > 1000) throw new ErrorBitacora(`«${k}» es demasiado largo.`, 400)
    textos[k] = v.trim()
  }
  if (!CALIDADES.some((e) => textos.calidad.startsWith(e))) throw new ErrorBitacora(`La calidad debe empezar por ${CALIDADES.join(', ')}.`, 400)
  if (!textos.seguridad || textos.seguridad === PENDIENTE) throw new ErrorBitacora('Falta la seguridad.', 400)
  return { sid, ...textos }
}

// Reescribe Calidad, Seguridad y (si llegan) Notas de la fila de la sesión; el resto del archivo intacto.
export function editarFila(texto, edicion) {
  const { sid, calidad, seguridad, notas } = validarEdicion(edicion)
  const bit = parsearBitacora(texto)
  const hits = bit.registro.filter((f) => f.sid === sid)
  if (!hits.length) throw new ErrorBitacora(`No hay una fila de la sesión ${sid} en la bitácora.`, 404)
  if (hits.length > 1) throw new ErrorBitacora(`Hay ${hits.length} filas de la sesión ${sid}; corrígelas a mano.`, 409)
  const lineas = String(texto).split('\n')
  const seg = segmentos(lineas[hits[0].linea])
  const poner = (col, v) => { seg[col + 1] = ` ${escaparCelda(v)} ` }
  poner(COL.calidad, calidad)
  poner(COL.seguridad, seguridad)
  if (notas) poner(COL.notas, notas)
  lineas[hits[0].linea] = seg.join('|')
  return lineas.join('\n')
}
