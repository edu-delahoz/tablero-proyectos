// Credenciales de los conectores: ~/.config/tablero/credenciales.json (chmod 600) o variables de entorno.
// Nunca salen del proceso de Node: el HTML solo recibe «conectado» o «falta credencial X».
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { escribirAtomico } from './config.mjs'

// TABLERO_CREDENCIALES: otra ruta (la usan los tests para no tocar nunca el archivo real).
export const RUTA_CREDENCIALES = process.env.TABLERO_CREDENCIALES || join(homedir(), '.config', 'tablero', 'credenciales.json')

// Por tipo: campo del archivo → variable de entorno que lo reemplaza.
export const REQUISITOS = {
  'github-projects': {},
  trello: { key: 'TRELLO_KEY', token: 'TRELLO_TOKEN' },
  'azure-devops': { pat: 'AZURE_DEVOPS_PAT' },
}

// Lee el archivo; avisa si otros usuarios pueden leerlo. → { datos, aviso }
export function leerCredenciales(ruta = RUTA_CREDENCIALES) {
  let datos = {}, aviso = null
  try {
    const modo = statSync(ruta).mode & 0o777
    if (modo & 0o077) aviso = `${ruta} tiene permisos ${modo.toString(8)}: ejecuta «chmod 600 ${ruta}».`
    datos = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (e) {
    if (e.code !== 'ENOENT') aviso = `No se pudo leer ${ruta}: ${e instanceof SyntaxError ? 'JSON inválido' : e.message}`
  }
  return { datos, aviso }
}

// Credencial de una integración: primero la entrada con su id, luego la de su tipo; el entorno manda.
// → { cred, faltan: ['TRELLO_TOKEN', …], paso }
export function credencialesPara(cfg, datos = {}, env = process.env) {
  const req = REQUISITOS[cfg.tipo] || {}
  const cred = { ...(datos[cfg.tipo] || {}), ...(datos[cfg.id] || {}) }
  for (const [campo, variable] of Object.entries(req)) if (env[variable]) cred[campo] = env[variable]
  const faltan = Object.entries(req).filter(([campo]) => !cred[campo]).map(([campo, variable]) => `${cfg.tipo}.${campo} (o ${variable})`)
  const paso = faltan.length
    ? `Añade ${faltan.join(' y ')} en ${RUTA_CREDENCIALES} (chmod 600) o como variable de entorno. Formato en el README, «Conectores y credenciales».`
    : null
  return { cred, faltan, paso }
}

// Guarda (mezcla) los campos de una clave (tipo o id de integración) y deja el archivo en 0600.
// Un campo vacío o null lo borra; si la clave se queda sin campos, desaparece. → los datos nuevos.
export function guardarCredencial(clave, campos, ruta = RUTA_CREDENCIALES) {
  // Un archivo ilegible no se pisa: se perderían las demás credenciales.
  const { datos, aviso } = leerCredenciales(ruta)
  if (aviso && !/chmod 600/.test(aviso)) throw new Error(`${aviso}. Corrígelo a mano antes de guardar desde la vista.`)
  const entrada = { ...(datos[clave] || {}) }
  for (const [k, v] of Object.entries(campos)) {
    if (v === '' || v === null || v === undefined) delete entrada[k]
    else entrada[k] = String(v).trim()
  }
  const nuevos = { ...datos }
  if (Object.keys(entrada).length) nuevos[clave] = entrada; else delete nuevos[clave]
  escribirAtomico(ruta, JSON.stringify(nuevos, null, 2) + '\n', 0o600)
  return nuevos
}

// Lo único que sale hacia el HTML: por tipo y por id con entrada propia, si está completa, de dónde sale
// y los 4 últimos caracteres del último campo. Nunca un valor entero ni el nombre de los campos.
// integraciones: [{ id, tipo }] de todos los proyectos (para saber el tipo de las entradas por id).
export function resumenCredenciales(datos = {}, env = process.env, integraciones = []) {
  const resumen = {}
  const uno = (tipo, cred) => {
    const req = Object.entries(REQUISITOS[tipo] || {})
    if (!req.length) return { tipo, guardada: true, fuente: 'gh', fin: null }
    const valor = (campo, variable) => env[variable] || cred[campo]
    const guardada = req.every(([c, v]) => valor(c, v))
    const fuente = req.some(([, v]) => env[v]) ? 'entorno' : req.some(([c]) => cred[c]) ? 'archivo' : null
    const ultimo = String(valor(...req.at(-1)) || '')
    return { tipo, guardada, fuente, fin: ultimo.length >= 8 ? `…${ultimo.slice(-4)}` : null }
  }
  for (const tipo of Object.keys(REQUISITOS)) resumen[tipo] = uno(tipo, datos[tipo] || {})
  for (const cfg of integraciones) {
    if (!cfg?.id || REQUISITOS[cfg.id] || resumen[cfg.id] || !datos[cfg.id]) continue
    resumen[cfg.id] = uno(cfg.tipo, { ...(datos[cfg.tipo] || {}), ...datos[cfg.id] })
  }
  return resumen
}
