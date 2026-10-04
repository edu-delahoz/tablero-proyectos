// Conector Azure DevOps (Work Items, REST 7.1, PAT por Basic). Misma interfaz que github-projects.mjs (deps = { fetch, memo }):
//   leer(cfg, cred, deps)                 → { url, titulo, columnas, items: [{ id, titulo, hecha, columna, url, actualizado, tipo, asignado, mio? }], avisos }
//   crear(cfg, cred, tarea, deps)         → { id, url }      tarea = { titulo, hecha, seccion, descripcion }
//   actualizar(cfg, cred, id, cambios, deps)                 cambios = { titulo?, hecha? }
// Nunca borra nada. Los mensajes de error no incluyen el PAT.
export const NOMBRE = 'Azure DevOps'
const TIMEOUT_MS = 10000
const API = 'api-version=7.1'
const LOTE = 200
const TOPE = 500
const PARALELO = 4

export function traducirError(e, cfg = {}) {
  if (e?.status === 401 || e?.status === 203 || e?.status === 403) return 'Credencial inválida o vencida (revisa azure-devops.pat y su permiso Work Items: Read & write).'
  if (e?.status === 404) return cfg.proyecto ? `No existe la organización/proyecto ${cfg.organizacion}/${cfg.proyecto} o tu PAT no tiene acceso.` : `No existe la organización ${cfg.organizacion} o el PAT no tiene acceso.`
  if (e?.status === 429) return 'Azure DevOps limitó las peticiones (429): espera unos segundos y reintenta.'
  if (e?.status) return `Azure DevOps respondió ${e.status}${e.cuerpo ? `: ${String(e.cuerpo).replace(/\s+/g, ' ').slice(0, 200)}` : ''}.`
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return `Sin conexión: Azure DevOps no respondió en ${TIMEOUT_MS / 1000} s.`
  return 'Sin conexión con Azure DevOps.'
}

// Acepta el nombre solo o cualquier URL de la organización → { organizacion, proyecto? }. Lanza Error en español si no se entiende.
export function normalizarOrganizacion(texto) {
  const t = String(texto ?? '').trim()
  const invalido = () => new Error(`No entiendo la organización «${t}»: escribe su nombre (p. ej. MiOrg) o la URL de dev.azure.com/MiOrg.`)
  if (!t) throw invalido()
  const dec = (s) => { try { return decodeURIComponent(s) } catch { return s } }
  const RE_NOMBRE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
  if (!/[/:@]/.test(t)) { if (!RE_NOMBRE.test(t)) throw invalido(); return { organizacion: t } }
  let u
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`) } catch { throw invalido() }
  if (!/^https?:$/.test(u.protocol)) throw invalido()
  const host = u.hostname.toLowerCase()
  const hostOriginal = u.hostname // la URL pasa el host a minúsculas; el nombre de la organización se conserva tal cual
  const trozos = u.pathname.split('/').filter(Boolean).map(dec)
  let organizacion, resto
  if (host === 'dev.azure.com') [organizacion, ...resto] = trozos
  else if (host.endsWith('.visualstudio.com')) {
    organizacion = (t.match(/([^/@.\s]+)\.visualstudio\.com/i) || [])[1] || hostOriginal.slice(0, -'.visualstudio.com'.length)
    resto = trozos[0]?.toLowerCase() === 'defaultcollection' ? trozos.slice(1) : trozos
  } else throw invalido()
  if (!organizacion || !RE_NOMBRE.test(organizacion)) throw invalido()
  const proyecto = resto[0] && !resto[0].startsWith('_') ? resto[0] : undefined
  return proyecto ? { organizacion, proyecto } : { organizacion }
}

// tipoItem: texto, lista o '*' (todos). Sin valor, Task.
const tiposDe = (cfg) => (cfg.tipoItem === '*' ? '*' : Array.isArray(cfg.tipoItem) && cfg.tipoItem.length ? cfg.tipoItem : [cfg.tipoItem || 'Task'])
const tipoItem = (cfg) => { const t = tiposDe(cfg); return t === '*' ? 'Task' : t[0] } // para crear: el primero
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
// Identidad de ADO: objeto { displayName, uniqueName } o texto «Nombre <correo>».
function identidad(v) {
  if (!v) return null
  if (typeof v === 'object') return v.displayName || v.uniqueName ? { nombre: v.displayName || v.uniqueName, correo: v.uniqueName || null } : null
  const m = String(v).match(/^(.*?)\s*<(.+)>$/)
  return m ? { nombre: m[1] || m[2], correo: m[2] } : { nombre: String(v), correo: null }
}
const org = (cfg) => normalizarOrganizacion(cfg.organizacion).organizacion
const urlItem = (cfg, id) => `https://dev.azure.com/${encodeURIComponent(org(cfg))}/${encodeURIComponent(cfg.proyecto)}/_workitems/edit/${id}`

// Una llamada REST; `ruta` cuelga de …/{organizacion}/{proyecto}/_apis/. Lanza Error con mensaje ya traducido.
async function api(deps, cfg, cred, metodo, ruta, { cuerpo, tipo = 'application/json' } = {}) {
  const f = deps.fetch || globalThis.fetch
  const organizacion = normalizarOrganizacion(cfg.organizacion).organizacion
  const alcance = cfg.proyecto ? `/${encodeURIComponent(cfg.proyecto)}` : '' // sin proyecto: llamadas de la organización
  const url = `https://dev.azure.com/${encodeURIComponent(organizacion)}${alcance}/_apis/${ruta}${ruta.includes('?') ? '&' : '?'}${API}`
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await f(url, {
      method: metodo, signal: ctl.signal, redirect: 'manual',
      headers: { Authorization: `Basic ${Buffer.from(`:${cred.pat}`).toString('base64')}`, Accept: 'application/json', ...(cuerpo ? { 'Content-Type': tipo } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    // PAT inválido: ADO responde 203 (o redirige) con el HTML de login en lugar de 401.
    if (r.status === 203 || (r.status >= 300 && r.status < 400)) throw Object.assign(new Error('http'), { status: 203 })
    if (!r.ok) throw Object.assign(new Error('http'), { status: r.status, cuerpo: await r.text().catch(() => '') })
    try { return await r.json() } catch { throw Object.assign(new Error('http'), { status: 203 }) }
  } catch (e) {
    throw new Error(traducirError(e, cfg))
  } finally { clearTimeout(t) }
}

const lista = (v, def) => (v == null ? def : Array.isArray(v) ? v : [v])
const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
const esta = (arr, x) => arr.some((y) => igual(y, x))
const estados = (cfg) => ({
  hecho: lista(cfg.columnas?.hecho, ['Done', 'Closed', 'Completed']),
  pendiente: lista(cfg.columnas?.pendiente, ['To Do', 'New']),
})

export async function leer(cfg, cred, deps = {}) {
  const tipos = tiposDe(cfg), n = estados(cfg), avisos = []
  const filtroTipo = tipos === '*' ? '' : tipos.length === 1 ? ` AND [System.WorkItemType] = ${lit(tipos[0])}` : ` AND [System.WorkItemType] IN (${tipos.map(lit).join(', ')})`
  const wiql = (extra = '') => `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project${filtroTipo} AND [System.State] <> 'Removed'${extra} ORDER BY [System.ChangedDate] DESC`
  const consulta = async (q) => (await api(deps, cfg, cred, 'POST', 'wit/wiql', { cuerpo: { query: q } })).workItems?.map((w) => w.id) || []
  const todos = await consulta(wiql())
  const ids = todos.slice(0, TOPE)
  if (todos.length > TOPE) avisos.push(`Mostrando ${TOPE} de ${todos.length} ítems (los más recientes).`)
  const lotes = []
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE))
  const traidos = []
  for (let i = 0; i < lotes.length; i += PARALELO) {
    traidos.push(...await Promise.all(lotes.slice(i, i + PARALELO).map((l) => api(deps, cfg, cred, 'GET', `wit/workitems?ids=${l.join(',')}&fields=System.Title,System.State,System.ChangedDate,System.AssignedTo,System.WorkItemType`))))
  }
  const items = []
  for (const r of traidos) {
    for (const w of r.value || []) {
      const estado = w.fields['System.State'] || null
      items.push({ id: String(w.id), titulo: w.fields['System.Title'], hecha: !!estado && esta(n.hecho, estado), columna: estado, url: urlItem(cfg, w.id), actualizado: w.fields['System.ChangedDate'], tipo: w.fields['System.WorkItemType'] || null, asignado: identidad(w.fields['System.AssignedTo']) })
    }
  }
  try {
    const mias = new Set((await consulta(wiql(' AND [System.AssignedTo] = @Me'))).map(String))
    for (const x of items) x.mio = mias.has(x.id)
  } catch (e) { avisos.push(`No se pudo saber cuáles son tuyas (${e.message}).`) }
  let columnas
  try {
    const r = await api(deps, cfg, cred, 'GET', 'wit/workitemtypes')
    const elegidos = (r.value || []).filter((t) => !t.isDisabled && (tipos === '*' || esta(tipos, t.name)))
    columnas = [...new Set(elegidos.flatMap((t) => (t.states || []).map((s) => s.name)))]
    if (!columnas.length) throw new Error('sin estados en la respuesta')
  } catch (e) {
    avisos.push(`No se pudieron leer los estados (${e.message}); se deducen de los ítems.`)
    columnas = [...new Set(items.map((x) => x.columna).filter(Boolean))]
  }
  const o = org(cfg)
  return { url: `https://dev.azure.com/${encodeURIComponent(o)}/${encodeURIComponent(cfg.proyecto)}/_workitems`, titulo: `${o}/${cfg.proyecto}`, columnas, items, avisos }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Descripción en texto/Markdown simple → HTML: las líneas «- [ ] x» forman una lista; el resto, párrafos. Todo escapado.
export function descripcionHtml(txt) {
  const out = []
  let abierta = false
  for (const l of String(txt || '').split('\n')) {
    const m = l.match(/^\s*-\s+(?:\[([ xX])\]\s+)?(.*)$/)
    if (m) { if (!abierta) { out.push('<ul>'); abierta = true } out.push(`<li>${m[1] ? (m[1] === ' ' ? '☐ ' : '☑ ') : ''}${esc(m[2])}</li>`) } else {
      if (abierta) { out.push('</ul>'); abierta = false }
      if (l.trim()) out.push(`<p>${esc(l)}</p>`)
    }
  }
  if (abierta) out.push('</ul>')
  return out.join('')
}

const TIPO_PARCHE = 'application/json-patch+json'
const op = (o, campo, valor) => ({ op: o, path: `/fields/${campo}`, value: valor })

export async function crear(cfg, cred, tarea, deps = {}) {
  const n = estados(cfg)
  const ops = [op('add', 'System.Title', tarea.titulo)]
  if (tarea.seccion) ops.push(op('add', 'System.Tags', tarea.seccion))
  if (tarea.descripcion) ops.push(op('add', 'System.Description', descripcionHtml(tarea.descripcion)))
  if (tarea.hecha) ops.push(op('add', 'System.State', n.hecho[0]))
  const w = await api(deps, cfg, cred, 'POST', `wit/workitems/$${encodeURIComponent(tipoItem(cfg))}`, { cuerpo: ops, tipo: TIPO_PARCHE })
  return { id: String(w.id), url: urlItem(cfg, w.id) }
}

export async function actualizar(cfg, cred, id, cambios, deps = {}) {
  const n = estados(cfg), ops = []
  if (cambios.titulo !== undefined) ops.push(op('replace', 'System.Title', cambios.titulo))
  if (cambios.hecha !== undefined) ops.push(op('replace', 'System.State', (cambios.hecha ? n.hecho : n.pendiente)[0]))
  if (ops.length) await api(deps, cfg, cred, 'PATCH', `wit/workitems/${encodeURIComponent(id)}`, { cuerpo: ops, tipo: TIPO_PARCHE })
}

// Descubrimiento para el formulario (solo lectura). Con `organizacion`: sus proyectos; con `proyecto` además: tipos de work item y sus estados.
export async function listar(cfg = {}, cred = {}, deps = {}) {
  if (!cfg.organizacion) throw new Error('Falta la organización de Azure DevOps.')
  if (!cfg.proyecto) {
    let r
    try { r = await api(deps, cfg, cred, 'GET', 'projects?$top=200') } catch (e) {
      if (/Credencial inválida/.test(e.message)) throw new Error(`${e.message} Para listar proyectos el PAT necesita el scope «Project and Team: Read»; si no, escribe el proyecto a mano.`)
      throw e
    }
    return { proyectos: (r.value || []).map((p) => p.name) }
  }
  const r = await api(deps, cfg, cred, 'GET', 'wit/workitemtypes')
  const tipos = []
  for (const t of (r.value || []).filter((x) => !x.isDisabled)) {
    const estados = t.states ? t.states.map((s) => s.name) : (await api(deps, cfg, cred, 'GET', `wit/workitemtypes/${encodeURIComponent(t.name)}/states`)).value.map((s) => s.name)
    tipos.push({ nombre: t.name, estados })
  }
  return { tipos }
}
