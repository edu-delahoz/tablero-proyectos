// Credenciales de los conectores: ~/.config/tablero/credenciales.json (chmod 600) o variables de entorno.
// Nunca salen del proceso de Node: el HTML solo recibe «conectado» o «falta credencial X».
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const RUTA_CREDENCIALES = join(homedir(), '.config', 'tablero', 'credenciales.json')

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
