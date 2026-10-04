// Conector Trello (API REST, key + token por query). Misma interfaz que github-projects.mjs (deps = { fetch, memo }):
//   leer(cfg, cred, deps)                 → { url, titulo, columnas, items: [{ id, titulo, hecha, columna, url, actualizado }], avisos }
//   crear(cfg, cred, tarea, deps)         → { id, url }      tarea = { titulo, hecha, seccion, descripcion }
//   actualizar(cfg, cred, id, cambios, deps)                 cambios = { titulo?, hecha? }
// Nunca borra ni archiva nada. Los mensajes de error no incluyen la URL (lleva la key y el token).
export const NOMBRE = 'Trello'
const BASE = 'https://api.trello.com/1'
const TIMEOUT_MS = 10000

export function traducirError(e, cfg = {}) {
  if (e?.status === 401 || e?.status === 403) return 'Credencial inválida o vencida (revisa trello.key y trello.token).'
  if (e?.status === 404 || e?.status === 400 && /invalid id/i.test(e?.cuerpo || '')) return `No existe el tablero ${cfg.tablero} o tu cuenta de Trello no tiene acceso.`
  if (e?.status === 429) return 'Trello limitó las peticiones (429): espera unos segundos y reintenta.'
  if (e?.status) return `Trello respondió ${e.status}${e.cuerpo ? `: ${String(e.cuerpo).slice(0, 200)}` : ''}.`
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return `Sin conexión: Trello no respondió en ${TIMEOUT_MS / 1000} s.`
  return 'Sin conexión con Trello.'
}

// Una llamada REST. key/token van en la query; el resto, en el cuerpo JSON. Lanza Error con mensaje ya traducido.
async function api(deps, cfg, cred, metodo, ruta, { query = {}, cuerpo } = {}) {
  const f = deps.fetch || globalThis.fetch
  const q = new URLSearchParams({ ...query, key: cred.key, token: cred.token })
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await f(`${BASE}/${ruta}?${q}`, {
      method: metodo, signal: ctl.signal,
      headers: cuerpo ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    if (!r.ok) throw Object.assign(new Error('http'), { status: r.status, cuerpo: await r.text().catch(() => '') })
    return await r.json()
  } catch (e) {
    throw new Error(traducirError(e, cfg))
  } finally { clearTimeout(t) }
}

const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
const buscar = (listas, nombres) => { for (const n of nombres) { const l = listas.find((x) => igual(x.name, n)); if (l) return l } return null }

// Tablero + listas abiertas; se memoriza en deps.memo durante una sincronía.
async function cargar(cfg, cred, deps) {
  const k = `trello:${cfg.tablero}`
  if (deps.memo?.has(k)) return deps.memo.get(k)
  const tablero = await api(deps, cfg, cred, 'GET', `boards/${encodeURIComponent(cfg.tablero)}`, { query: { fields: 'name,url' } })
  const listas = await api(deps, cfg, cred, 'GET', `boards/${tablero.id}/lists`, { query: { filter: 'open' } })
  const nHecho = cfg.columnas?.hecho ? [cfg.columnas.hecho] : ['Hecho', 'Done']
  const hecho = buscar(listas, nHecho)
  if (!hecho) throw new Error(`El tablero ${cfg.tablero} no tiene la lista «${nHecho[0]}» (configúrala en columnas.hecho).`)
  const pendiente = (cfg.columnas?.pendiente ? buscar(listas, [cfg.columnas.pendiente]) : buscar(listas, ['Por hacer', 'To Do'])) || listas.find((l) => l.id !== hecho.id)
  const r = { id: tablero.id, url: tablero.url, titulo: tablero.name, listas, hecho, pendiente, etiquetas: null }
  ;(deps.memo ||= new Map()).set(k, r)
  return r
}

export async function leer(cfg, cred, deps = {}) {
  const b = await cargar(cfg, cred, deps)
  const tarjetas = await api(deps, cfg, cred, 'GET', `boards/${b.id}/cards`, { query: { filter: 'open', fields: 'name,idList,url,dateLastActivity' } })
  const lista = new Map(b.listas.map((l) => [l.id, l.name]))
  const items = tarjetas.map((c) => ({
    id: c.id, titulo: c.name, hecha: c.idList === b.hecho.id, columna: lista.get(c.idList) || null, url: c.url, actualizado: c.dateLastActivity,
  }))
  return { url: b.url, titulo: b.titulo, columnas: b.listas.map((l) => l.name), items, avisos: b.pendiente ? [] : ['El tablero solo tiene la lista de hecho: las tarjetas pendientes no tienen dónde ir.'] }
}

// Id de la etiqueta con el nombre de la sección; se crea si no existe.
async function etiqueta(cfg, cred, deps, b, nombre) {
  b.etiquetas ||= await api(deps, cfg, cred, 'GET', `boards/${b.id}/labels`, { query: { limit: 1000 } })
  let e = b.etiquetas.find((x) => igual(x.name, nombre))
  if (!e) { e = await api(deps, cfg, cred, 'POST', `boards/${b.id}/labels`, { cuerpo: { name: nombre, color: null } }); b.etiquetas.push(e) }
  return e.id
}

export async function crear(cfg, cred, tarea, deps = {}) {
  const b = await cargar(cfg, cred, deps)
  const lista = tarea.hecha ? b.hecho : b.pendiente || b.hecho
  const cuerpo = { idList: lista.id, name: tarea.titulo, desc: tarea.descripcion || '' }
  if (tarea.seccion) cuerpo.idLabels = [await etiqueta(cfg, cred, deps, b, tarea.seccion)]
  const c = await api(deps, cfg, cred, 'POST', 'cards', { cuerpo })
  return { id: c.id, url: c.shortUrl || c.url }
}

export async function actualizar(cfg, cred, id, cambios, deps = {}) {
  const cuerpo = {}
  if (cambios.titulo !== undefined) cuerpo.name = cambios.titulo
  if (cambios.hecha !== undefined) {
    const b = await cargar(cfg, cred, deps)
    const lista = cambios.hecha ? b.hecho : b.pendiente
    if (lista) cuerpo.idList = lista.id
  }
  if (Object.keys(cuerpo).length) await api(deps, cfg, cred, 'PUT', `cards/${encodeURIComponent(id)}`, { cuerpo })
}

// Descubrimiento para el formulario (solo lectura). Sin `tablero`: tableros abiertos del usuario; con él: sus listas abiertas.
export async function listar(cfg = {}, cred = {}, deps = {}) {
  if (!cfg.tablero) {
    const t = await api(deps, cfg, cred, 'GET', 'members/me/boards', { query: { filter: 'open', fields: 'name,url,shortLink' } })
    return { tableros: t.map((x) => ({ id: x.shortLink || x.id, nombre: x.name, url: x.url })) }
  }
  const b = await api(deps, cfg, cred, 'GET', `boards/${encodeURIComponent(cfg.tablero)}`, { query: { fields: 'name' } })
  const l = await api(deps, cfg, cred, 'GET', `boards/${b.id}/lists`, { query: { filter: 'open' } })
  return { titulo: b.name, listas: l.map((x) => x.name) }
}
