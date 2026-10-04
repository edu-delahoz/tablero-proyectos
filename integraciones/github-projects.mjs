// Conector GitHub Projects (v2) vía `gh api graphql`: usa la sesión de gh (scope «project»), sin tokens propios.
// Interfaz común de los adaptadores (deps = { exec, memo } se inyecta en los tests):
//   leer(cfg, cred, deps)                 → { url, columnas, items: [{ id, titulo, hecha, columna, url, actualizado }] }
//   crear(cfg, cred, tarea, deps)         → { id, url }      tarea = { titulo, hecha, seccion, descripcion }
//   actualizar(cfg, cred, id, cambios, deps)                 cambios = { titulo?, hecha? }
// Nunca borra ni archiva nada.
import { execFile } from 'node:child_process'

export const NOMBRE = 'GitHub Projects'
const TIMEOUT_MS = 10000

const execGh = (args, timeout = TIMEOUT_MS) => new Promise((ok, mal) => {
  execFile('gh', args, { timeout, maxBuffer: 20e6, env: { ...process.env, GH_PROMPT_DISABLED: '1' } }, (e, stdout, stderr) => e ? mal(Object.assign(e, { stderr: String(stderr || '') })) : ok(stdout))
})

// Error de gh → mensaje en español con el paso para resolverlo.
export function traducirError(e, cfg = {}) {
  const txt = `${e?.stderr || ''} ${e?.message || ''}`
  const proyecto = `${cfg.propietario}/${cfg.numero}`
  if (e?.code === 'ENOENT') return 'No está instalado gh: instálalo desde https://cli.github.com y ejecuta «gh auth login».'
  if (e?.killed || e?.code === 'ETIMEDOUT' || /timed? ?out/i.test(txt)) return `Sin conexión: GitHub no respondió en ${TIMEOUT_MS / 1000} s.`
  if (/INSUFFICIENT_SCOPES|required scopes|missing scope/i.test(txt)) return 'Al token de gh le falta el scope «project»: ejecuta «gh auth refresh -s project».'
  if (/HTTP 401|Bad credentials|gh auth login|not logged/i.test(txt)) return 'Credencial inválida o vencida: ejecuta «gh auth login».'
  if (/Could not resolve to a ProjectV2|NOT_FOUND|HTTP 404|no existe/i.test(txt)) return `No existe el proyecto ${proyecto} o tu cuenta de gh no tiene acceso.`
  if (/error connecting|dial tcp|no such host|ENOTFOUND|ECONNRESET|network/i.test(txt)) return 'Sin conexión con GitHub.'
  return `GitHub Projects: ${(e?.stderr || e?.message || String(e)).trim().split('\n')[0].slice(0, 300)}`
}

async function gql(deps, cfg, query, vars = {}) {
  const exec = deps.exec || execGh
  const args = ['api', 'graphql', '-f', `query=${query}`]
  for (const [k, v] of Object.entries(vars)) {
    if (v == null) continue
    args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`) // -f: texto literal (un título que empiece por @ no se lee como archivo)
  }
  let salida
  try { salida = await exec(args) } catch (e) { throw new Error(traducirError(e, cfg)) }
  const r = JSON.parse(salida)
  if (r.errors?.length) throw new Error(traducirError({ stderr: r.errors.map((x) => `${x.type || ''} ${x.message}`).join('\n') }, cfg))
  return r.data
}

const Q_PROYECTO = `query($owner:String!,$number:Int!,$after:String){
  repositoryOwner(login:$owner){ ... on ProjectV2Owner { projectV2(number:$number){ id url title
    fields(first:50){ nodes{ ... on ProjectV2FieldCommon { id name dataType } ... on ProjectV2SingleSelectField { options{ id name } } } }
    items(first:100, after:$after){ pageInfo{ hasNextPage endCursor } nodes{ id isArchived updatedAt fullDatabaseId
      fieldValues(first:20){ nodes{ ... on ProjectV2ItemFieldSingleSelectValue { name field{ ... on ProjectV2FieldCommon { name } } } } }
      content{ __typename ... on DraftIssue { id title } ... on Issue { id title url } ... on PullRequest { id title url } } } } } } } }`

const nombres = (cfg) => ({
  estado: cfg.campoEstado || 'Status',
  seccion: cfg.campoSeccion || 'Sección',
  hecho: cfg.columnas?.hecho || 'Done',
  pendiente: cfg.columnas?.pendiente || 'Todo',
})
const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()

// Proyecto + campos + todos los ítems (paginado). Se memoriza en deps.memo durante una sincronía.
async function cargar(cfg, deps, conItems = true) {
  const k = `${cfg.propietario}/${cfg.numero}`
  if (deps.memo?.has(k) && (!conItems || deps.memo.get(k).items)) return deps.memo.get(k)
  let after = null, p = null
  const items = []
  do {
    const d = await gql(deps, cfg, Q_PROYECTO, { owner: cfg.propietario, number: Number(cfg.numero), after })
    p = d?.repositoryOwner?.projectV2
    if (!p) throw new Error(`No existe el proyecto ${k} o tu cuenta de gh no tiene acceso.`)
    items.push(...p.items.nodes)
    after = conItems && p.items.pageInfo.hasNextPage ? p.items.pageInfo.endCursor : null
  } while (after)
  const n = nombres(cfg)
  const campos = p.fields.nodes.filter((f) => f && f.id)
  const estado = campos.find((f) => f.dataType === 'SINGLE_SELECT' && igual(f.name, n.estado))
  if (!estado) throw new Error(`El proyecto ${k} no tiene un campo de selección «${n.estado}».`)
  const opcion = (nombre) => estado.options.find((o) => igual(o.name, nombre))
  const hecho = opcion(n.hecho)
  if (!hecho) throw new Error(`El campo «${n.estado}» de ${k} no tiene la opción «${n.hecho}» (configúrala en columnas.hecho).`)
  const r = {
    id: p.id, url: p.url, titulo: p.title, estado, hecho,
    pendiente: opcion(n.pendiente) || estado.options.find((o) => o !== hecho),
    seccion: campos.find((f) => f.dataType === 'TEXT' && igual(f.name, n.seccion)) || null,
    items: conItems ? items : null,
  }
  ;(deps.memo ||= new Map()).set(k, r)
  return r
}

export async function leer(cfg, cred, deps = {}) {
  const p = await cargar(cfg, deps)
  const n = nombres(cfg)
  const items = p.items.filter((x) => !x.isArchived && x.content?.title != null).map((x) => {
    const columna = x.fieldValues.nodes.find((v) => v?.field && igual(v.field.name, n.estado))?.name || null
    return {
      id: x.id, titulo: x.content.title, hecha: !!columna && igual(columna, p.hecho.name), columna,
      url: x.content.url || `${p.url}?pane=issue&itemId=${x.fullDatabaseId}`, actualizado: x.updatedAt,
    }
  })
  return { url: p.url, titulo: p.titulo, columnas: p.estado.options.map((o) => o.name), items, avisos: p.seccion ? [] : [`Sin campo de texto «${n.seccion}»: la sección no se envía (opcional).`] }
}

const M_CREAR = `mutation($projectId:ID!,$title:String!,$body:String){
  addProjectV2DraftIssue(input:{projectId:$projectId,title:$title,body:$body}){ projectItem{ id fullDatabaseId } } }`
const M_OPCION = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){
  updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ projectV2Item{ id } } }`
const M_TEXTO = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$text:String!){
  updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{text:$text}}){ projectV2Item{ id } } }`
const Q_CONTENIDO = `query($id:ID!){ node(id:$id){ ... on ProjectV2Item { content{ __typename ... on DraftIssue { id } ... on Issue { id } ... on PullRequest { id } } } } }`
const M_TITULO = {
  DraftIssue: `mutation($id:ID!,$title:String!){ updateProjectV2DraftIssue(input:{draftIssueId:$id,title:$title}){ draftIssue{ id } } }`,
  Issue: `mutation($id:ID!,$title:String!){ updateIssue(input:{id:$id,title:$title}){ issue{ id } } }`,
  PullRequest: `mutation($id:ID!,$title:String!){ updatePullRequest(input:{pullRequestId:$id,title:$title}){ pullRequest{ id } } }`,
}

async function moverA(cfg, deps, p, itemId, hecha) {
  const opcion = hecha ? p.hecho : p.pendiente
  if (opcion) await gql(deps, cfg, M_OPCION, { projectId: p.id, itemId, fieldId: p.estado.id, optionId: opcion.id })
}

export async function crear(cfg, cred, tarea, deps = {}) {
  const p = await cargar(cfg, deps, false)
  const d = await gql(deps, cfg, M_CREAR, { projectId: p.id, title: tarea.titulo, body: tarea.descripcion || '' })
  const item = d.addProjectV2DraftIssue.projectItem
  await moverA(cfg, deps, p, item.id, tarea.hecha)
  if (p.seccion && tarea.seccion) await gql(deps, cfg, M_TEXTO, { projectId: p.id, itemId: item.id, fieldId: p.seccion.id, text: tarea.seccion })
  return { id: item.id, url: `${p.url}?pane=issue&itemId=${item.fullDatabaseId}` }
}

export async function actualizar(cfg, cred, id, cambios, deps = {}) {
  const p = await cargar(cfg, deps, false)
  if (cambios.titulo !== undefined) {
    const c = (await gql(deps, cfg, Q_CONTENIDO, { id }))?.node?.content
    if (!c || !M_TITULO[c.__typename]) throw new Error('Ese ítem ya no existe en el proyecto o no se puede renombrar.')
    await gql(deps, cfg, M_TITULO[c.__typename], { id: c.id, title: cambios.titulo })
  }
  if (cambios.hecha !== undefined) await moverA(cfg, deps, p, id, cambios.hecha)
}

const Q_LISTA = `query{ viewer{ login projectsV2(first:50){ nodes{ number title url closed } }
  organizations(first:50){ nodes{ login projectsV2(first:50){ nodes{ number title url closed } } } } } }`
const Q_CAMPOS = `query($owner:String!,$number:Int!){ repositoryOwner(login:$owner){ ... on ProjectV2Owner { projectV2(number:$number){ title
  fields(first:50){ nodes{ ... on ProjectV2FieldCommon { name dataType } ... on ProjectV2SingleSelectField { options{ name } } } } } } } }`

// Descubrimiento para el formulario (solo lectura). Sin `propietario`+`numero`: los Projects abiertos del usuario y de sus orgs.
// Con ellos: campos de selección (con opciones) y de texto del proyecto. cfg = { propietario?, numero? }.
export async function listar(cfg = {}, cred = {}, deps = {}) {
  if (cfg.propietario == null || cfg.numero == null) {
    const v = (await gql(deps, cfg, Q_LISTA))?.viewer
    const grupos = [{ login: v?.login, nodes: v?.projectsV2?.nodes }, ...(v?.organizations?.nodes || []).map((o) => ({ login: o.login, nodes: o.projectsV2?.nodes }))]
    return { proyectos: grupos.flatMap((g) => (g.nodes || []).filter((x) => x && !x.closed).map((x) => ({ propietario: g.login, numero: x.number, titulo: x.title, url: x.url }))) }
  }
  const p = (await gql(deps, cfg, Q_CAMPOS, { owner: cfg.propietario, number: Number(cfg.numero) }))?.repositoryOwner?.projectV2
  if (!p) throw new Error(`No existe el proyecto ${cfg.propietario}/${cfg.numero} o tu cuenta de gh no tiene acceso.`)
  const campos = p.fields.nodes.filter((f) => f?.name)
  return {
    titulo: p.title,
    camposSeleccion: campos.filter((f) => f.dataType === 'SINGLE_SELECT').map((f) => ({ nombre: f.name, opciones: (f.options || []).map((o) => o.name) })),
    camposTexto: campos.filter((f) => f.dataType === 'TEXT').map((f) => f.name),
  }
}
