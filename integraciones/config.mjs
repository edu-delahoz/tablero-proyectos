// Alta, edición y baja de integraciones en proyectos.json desde la vista. Puro salvo escribirAtomico.
// Trabaja sobre el JSON crudo (sin expandir «~») para no reescribir rutas ni campos ajenos.
import { writeFileSync, renameSync, mkdirSync, unlinkSync, statSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { ADAPTADORES, NOMBRES } from './index.mjs'

// Lista blanca por tipo: solo estos campos llegan a proyectos.json. obligatorios ⊂ campos.
const COMUNES = ['id', 'tipo', 'backlog', 'auto']
export const CAMPOS = {
  'github-projects': { obligatorios: ['propietario', 'numero'], opcionales: ['campoEstado', 'campoSeccion', 'columnas'] },
  trello: { obligatorios: ['tablero'], opcionales: ['columnas'] },
  'azure-devops': { obligatorios: ['organizacion', 'proyecto'], opcionales: ['tipoItem', 'columnas'] },
}
const COLUMNAS = ['pendiente', 'en-curso', 'hecho']
const RE_ID = /^[a-z0-9-]{1,30}$/
const texto = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= 200

// → { errores: ['…'], limpia } — limpia solo lleva campos de la lista blanca, con espacios recortados.
// backlogs: archivos del proyecto (['BACKLOG.md', …]); otras: ids de las demás integraciones del proyecto.
export function validarIntegracion(cfg, { backlogs = [], otras = [], adaptadores = ADAPTADORES } = {}) {
  const errores = []
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { errores: ['Falta la integración.'], limpia: null }
  const def = CAMPOS[cfg.tipo]
  if (!def || !adaptadores[cfg.tipo]) errores.push(`Tipo desconocido «${cfg.tipo}»: usa ${Object.keys(CAMPOS).join(', ')}.`)
  if (!RE_ID.test(cfg.id ?? '')) errores.push('El id solo admite minúsculas, números y guiones (1 a 30).')
  else if (otras.includes(cfg.id)) errores.push(`Ya hay otra integración con id «${cfg.id}» en este proyecto.`)
  if (!texto(cfg.backlog)) errores.push('Elige el backlog que se sincroniza.')
  else if (!backlogs.includes(cfg.backlog)) errores.push(`No encuentro «${cfg.backlog}» en las carpetas «docs» del proyecto.`)
  if (cfg.auto !== undefined && typeof cfg.auto !== 'boolean') errores.push('«auto» debe ser sí o no.')
  if (!def) return { errores, limpia: null }
  const limpia = { id: cfg.id, tipo: cfg.tipo, backlog: typeof cfg.backlog === 'string' ? cfg.backlog.trim() : cfg.backlog }
  const nombre = NOMBRES[cfg.tipo] || cfg.tipo
  for (const campo of [...def.obligatorios, ...def.opcionales]) {
    const v = cfg[campo]
    const falta = v === undefined || v === null || v === ''
    if (falta) { if (def.obligatorios.includes(campo)) errores.push(`${nombre}: falta «${campo}».`); continue }
    if (campo === 'numero') {
      const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v
      if (!Number.isInteger(n) || n < 1) errores.push(`${nombre}: «numero» debe ser un entero positivo.`)
      else limpia.numero = n
    } else if (campo === 'columnas') {
      if (typeof v !== 'object' || Array.isArray(v)) { errores.push(`${nombre}: «columnas» debe ser { pendiente, hecho }.`); continue }
      const col = {}
      for (const [k, x] of Object.entries(v)) {
        if (!COLUMNAS.includes(k)) { errores.push(`${nombre}: columna desconocida «${k}» (usa ${COLUMNAS.join(', ')}).`); continue }
        if (x === undefined || x === null || x === '') continue
        if (texto(x)) col[k] = x.trim()
        else if (Array.isArray(x) && x.length && x.length <= 10 && x.every(texto)) col[k] = x.map((s) => s.trim())
        else errores.push(`${nombre}: la columna «${k}» debe ser un nombre (o lista de nombres).`)
      }
      if (Object.keys(col).length) limpia.columnas = col
    } else if (texto(v)) limpia[campo] = v.trim()
    else errores.push(`${nombre}: «${campo}» debe ser texto (hasta 200 caracteres).`)
  }
  if (cfg.auto !== undefined) limpia.auto = cfg.auto === true
  return { errores, limpia }
}

export class ErrorConfig extends Error { constructor(msg, estado = 400) { super(msg); this.estado = estado } }

// Nuevo texto de proyectos.json con el cambio aplicado; conserva el resto de campos, su orden y la sangría.
// op 'guardar': reemplaza la de idOriginal (en su sitio) o la añade al final; op 'quitar': borra la de id.
// Solo toca campos de la lista blanca de la integración editada; los ajenos que ya tuviera se conservan.
export function aplicarCambio(jsonCrudo, proyectoId, { op, integracion, idOriginal, id } = {}) {
  let lista
  try { lista = JSON.parse(jsonCrudo) } catch { throw new ErrorConfig('proyectos.json no es JSON válido: corrígelo a mano antes de editar desde la vista.', 409) }
  if (!Array.isArray(lista)) throw new ErrorConfig('proyectos.json debe ser una lista de proyectos.', 409)
  const p = lista.find((x) => x && x.id === proyectoId)
  if (!p) throw new ErrorConfig(`No hay un proyecto «${proyectoId}» en proyectos.json.`, 404)
  const actuales = Array.isArray(p.integraciones) ? p.integraciones : []
  if (op === 'quitar') {
    const i = actuales.findIndex((x) => x?.id === id)
    if (i < 0) throw new ErrorConfig(`Esa integración («${id}») ya no está en proyectos.json.`, 404)
    actuales.splice(i, 1)
    if (actuales.length) p.integraciones = actuales; else delete p.integraciones
  } else if (op === 'guardar') {
    if (!integracion?.id) throw new ErrorConfig('Falta la integración.')
    const i = idOriginal ? actuales.findIndex((x) => x?.id === idOriginal) : -1
    if (idOriginal && i < 0) throw new ErrorConfig(`Esa integración («${idOriginal}») ya no está en proyectos.json.`, 404)
    if (actuales.some((x, j) => j !== i && x?.id === integracion.id)) throw new ErrorConfig(`Ya hay otra integración con id «${integracion.id}» en este proyecto.`)
    if (i < 0) actuales.push(integracion)
    else {
      // Campos ajenos a la lista blanca (de una versión futura o puestos a mano) se conservan; los de la lista, los manda la vista.
      const blanca = new Set([...COMUNES, ...Object.values(CAMPOS).flatMap((d) => [...d.obligatorios, ...d.opcionales])])
      const ajenos = Object.fromEntries(Object.entries(actuales[i]).filter(([k]) => !blanca.has(k)))
      actuales[i] = { ...integracion, ...ajenos }
    }
    p.integraciones = actuales
  } else throw new ErrorConfig(`Operación desconocida «${op}».`)
  const sangria = (jsonCrudo.match(/^\[\s*\n([ \t]+)/) || [, '  '])[1]
  return JSON.stringify(lista, null, sangria) + '\n'
}

// Escritura atómica: temporal en la misma carpeta + rename (nadie lee nunca un archivo a medias).
// Sin modo, conserva los permisos del archivo que reemplaza.
export function escribirAtomico(ruta, contenido, modo) {
  mkdirSync(dirname(ruta), { recursive: true, ...(modo !== undefined && { mode: 0o700 }) })
  modo ??= statSync(ruta, { throwIfNoEntry: false })?.mode & 0o777 || 0o644
  const tmp = join(dirname(ruta), `.${basename(ruta)}.${process.pid}.${Date.now()}.tmp`)
  try {
    writeFileSync(tmp, contenido, { mode: modo })
    renameSync(tmp, ruta)
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    throw e
  }
}
