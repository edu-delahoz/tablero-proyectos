// Conector Azure DevOps (Work Items, REST 7.1, PAT por Basic). Misma interfaz que github-projects.mjs (deps = { fetch, memo }):
//   leer(cfg, cred, deps)                 → { url, titulo, columnas, items: [{ id, titulo, hecha, columna, url, actualizado }], avisos }
//   crear(cfg, cred, tarea, deps)         → { id, url }      tarea = { titulo, hecha, seccion, descripcion }
//   actualizar(cfg, cred, id, cambios, deps)                 cambios = { titulo?, hecha? }
// Nunca borra nada. Los mensajes de error no incluyen el PAT.
export const NOMBRE = 'Azure DevOps'
const TIMEOUT_MS = 10000
const API = 'api-version=7.1'
const LOTE = 200

export function traducirError(e, cfg = {}) {
  if (e?.status === 401 || e?.status === 203 || e?.status === 403) return 'Credencial inválida o vencida (revisa azure-devops.pat y su permiso Work Items: Read & write).'
  if (e?.status === 404) return `No existe la organización/proyecto ${cfg.organizacion}/${cfg.proyecto} o tu PAT no tiene acceso.`
  if (e?.status === 429) return 'Azure DevOps limitó las peticiones (429): espera unos segundos y reintenta.'
  if (e?.status) return `Azure DevOps respondió ${e.status}${e.cuerpo ? `: ${String(e.cuerpo).replace(/\s+/g, ' ').slice(0, 200)}` : ''}.`
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return `Sin conexión: Azure DevOps no respondió en ${TIMEOUT_MS / 1000} s.`
  return 'Sin conexión con Azure DevOps.'
}

const tipoItem = (cfg) => cfg.tipoItem || 'Task'
const urlItem = (cfg, id) => `https://dev.azure.com/${cfg.organizacion}/${cfg.proyecto}/_workitems/edit/${id}`

// Una llamada REST; `ruta` cuelga de …/{organizacion}/{proyecto}/_apis/. Lanza Error con mensaje ya traducido.
async function api(deps, cfg, cred, metodo, ruta, { cuerpo, tipo = 'application/json' } = {}) {
  const f = deps.fetch || globalThis.fetch
  const alcance = cfg.proyecto ? `/${encodeURIComponent(cfg.proyecto)}` : '' // sin proyecto: llamadas de la organización
  const url = `https://dev.azure.com/${encodeURIComponent(cfg.organizacion)}${alcance}/_apis/${ruta}${ruta.includes('?') ? '&' : '?'}${API}`
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
  const tipo = tipoItem(cfg), n = estados(cfg), avisos = []
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = '${tipo.replace(/'/g, "''")}' AND [System.State] <> 'Removed' ORDER BY [System.Id]`
  const ids = (await api(deps, cfg, cred, 'POST', 'wit/wiql', { cuerpo: { query: wiql } })).workItems?.map((w) => w.id) || []
  const items = []
  for (let i = 0; i < ids.length; i += LOTE) {
    const r = await api(deps, cfg, cred, 'GET', `wit/workitems?ids=${ids.slice(i, i + LOTE).join(',')}&fields=System.Title,System.State,System.ChangedDate`)
    for (const w of r.value || []) {
      const estado = w.fields['System.State'] || null
      items.push({ id: String(w.id), titulo: w.fields['System.Title'], hecha: !!estado && esta(n.hecho, estado), columna: estado, url: urlItem(cfg, w.id), actualizado: w.fields['System.ChangedDate'] })
    }
  }
  let columnas
  try { columnas = (await api(deps, cfg, cred, 'GET', `wit/workitemtypes/${encodeURIComponent(tipo)}/states`)).value.map((s) => s.name) } catch (e) {
    avisos.push(`No se pudieron leer los estados de «${tipo}» (${e.message}); se deducen de los ítems.`)
    columnas = [...new Set(items.map((x) => x.columna).filter(Boolean))]
  }
  return { url: `https://dev.azure.com/${cfg.organizacion}/${cfg.proyecto}/_workitems`, titulo: `${cfg.organizacion}/${cfg.proyecto}`, columnas, items, avisos }
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
    const r = await api(deps, cfg, cred, 'GET', 'projects?$top=200')
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
