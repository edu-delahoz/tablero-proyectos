// Adaptador Azure DevOps con `fetch` simulado (respuestas ficticias en fixtures/integraciones).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leer, crear, actualizar, descripcionHtml, traducirError } from './azure-devops.mjs'

const R = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'integraciones', 'azure-devops.json'), 'utf8'))
const CFG = { id: 'ado', tipo: 'azure-devops', organizacion: 'org-ejemplo', proyecto: 'proyecto-ejemplo', tipoItem: 'Task' }
const CRED = { pat: 'PAT-secreto' }
const res = (cuerpo, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo), text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) })

// fetch falso: responde por «MÉTODO ruta» (sin api-version ni ids) y registra cada llamada.
function ado(rutas = {}) {
  const llamadas = []
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    const ruta = decodeURIComponent(u.pathname.split('/_apis/')[1]).replace(/^(wit\/workitems)\/\d+$/, '$1/N')
    const clave = `${init.method} ${ruta}`
    llamadas.push({ clave, url, query: Object.fromEntries(u.searchParams), metodo: init.method, cuerpo: init.body ? JSON.parse(init.body) : null, cabeceras: init.headers })
    const r = rutas[clave] ?? {
      'POST wit/wiql': R.wiql, 'GET wit/workitems': R.items, 'GET wit/workitemtypes/Task/states': R.estados,
      'POST wit/workitems/$Task': R.nuevo, 'PATCH wit/workitems/N': R.nuevo,
    }[clave]
    if (r instanceof Error) throw r
    if (r === undefined) throw new Error(`ruta no simulada: ${clave}`)
    return r.ok !== undefined && r.status !== undefined ? r : res(r)
  }
  return { fetch, llamadas, memo: new Map() }
}

test('leer: WIQL por tipo, ítems con estado/hecha/URL y estados del tipo; Authorization Basic correcto', async () => {
  const d = ado()
  const r = await leer(CFG, CRED, d)
  assert.deepEqual(r.columnas, ['To Do', 'Active', 'Done', 'Removed'])
  assert.deepEqual(r.items.map((x) => [x.id, x.titulo, x.hecha, x.columna]), [['101', 'Crear el esquema', true, 'Done'], ['102', 'Probar el login', false, 'Active'], ['103', 'Sin empezar', false, 'To Do']])
  assert.equal(r.items[0].url, 'https://dev.azure.com/org-ejemplo/proyecto-ejemplo/_workitems/edit/101')
  assert.equal(r.items[1].actualizado, '2026-01-11T10:00:00Z')
  const wiql = d.llamadas[0]
  assert.match(wiql.cuerpo.query, /\[System\.WorkItemType\] = 'Task' AND \[System\.State\] <> 'Removed'/)
  assert.equal(wiql.query['api-version'], '7.1')
  assert.equal(wiql.cabeceras.Authorization, `Basic ${Buffer.from(':PAT-secreto').toString('base64')}`)
  assert.equal(d.llamadas[1].query.fields, 'System.Title,System.State,System.ChangedDate')
})

test('leer: lotes de 200 ids; estados configurables; aviso si fallan los estados', async () => {
  const muchos = { workItems: Array.from({ length: 450 }, (_, i) => ({ id: i + 1 })) }
  const d = ado({ 'POST wit/wiql': muchos, 'GET wit/workitems': { value: [] }, 'GET wit/workitemtypes/Task/states': res('no', 404) })
  const r = await leer(CFG, CRED, d)
  const lotes = d.llamadas.filter((l) => l.clave === 'GET wit/workitems').map((l) => l.query.ids.split(',').length)
  assert.deepEqual(lotes, [200, 200, 50])
  assert.match(r.avisos[0], /se deducen de los ítems/)
  const r2 = await leer({ ...CFG, columnas: { hecho: 'Active' } }, CRED, ado())
  assert.deepEqual(r2.items.map((x) => x.hecha), [false, true, false])
})

test('crear: tipo, título, tag de sección, descripción HTML escapada y estado si ya está hecha', async () => {
  const d = ado()
  const r = await crear(CFG, CRED, { titulo: 'Nueva', hecha: true, seccion: 'S3', descripcion: 'Texto <b>\n- [x] uno & dos\n- [ ] tres' }, d)
  assert.deepEqual(r, { id: '201', url: 'https://dev.azure.com/org-ejemplo/proyecto-ejemplo/_workitems/edit/201' })
  const l = d.llamadas[0]
  assert.equal(l.cabeceras['Content-Type'], 'application/json-patch+json')
  assert.deepEqual(l.cuerpo, [
    { op: 'add', path: '/fields/System.Title', value: 'Nueva' },
    { op: 'add', path: '/fields/System.Tags', value: 'S3' },
    { op: 'add', path: '/fields/System.Description', value: '<p>Texto &lt;b&gt;</p><ul><li>☑ uno &amp; dos</li><li>☐ tres</li></ul>' },
    { op: 'add', path: '/fields/System.State', value: 'Done' },
  ])
  const d2 = ado()
  await crear(CFG, CRED, { titulo: 'Pendiente', hecha: false }, d2)
  assert.deepEqual(d2.llamadas[0].cuerpo, [{ op: 'add', path: '/fields/System.Title', value: 'Pendiente' }])
  assert.equal(descripcionHtml(''), '')
})

test('actualizar: PATCH replace de título/estado; sin cambios no llama; nunca DELETE', async () => {
  const d = ado()
  await actualizar(CFG, CRED, '101', { titulo: 'Nuevo', hecha: false }, d)
  assert.equal(d.llamadas[0].clave, 'PATCH wit/workitems/N')
  assert.equal(d.llamadas[0].cabeceras['Content-Type'], 'application/json-patch+json')
  assert.deepEqual(d.llamadas[0].cuerpo, [{ op: 'replace', path: '/fields/System.Title', value: 'Nuevo' }, { op: 'replace', path: '/fields/System.State', value: 'To Do' }])
  const d2 = ado()
  await actualizar(CFG, CRED, '101', { hecha: true }, d2)
  assert.deepEqual(d2.llamadas[0].cuerpo, [{ op: 'replace', path: '/fields/System.State', value: 'Done' }])
  const d3 = ado()
  await actualizar(CFG, CRED, '101', {}, d3)
  assert.equal(d3.llamadas.length, 0)
  assert.ok([...d.llamadas, ...d2.llamadas].every((l) => l.metodo !== 'DELETE'))
})

test('errores en español: 401, 203 con HTML de login, 404, timeout, red; ningún mensaje contiene el PAT', async () => {
  const msg = async (rutas) => { try { await leer(CFG, CRED, ado(rutas)) } catch (e) { return e.message } }
  const m401 = await msg({ 'POST wit/wiql': res('no', 401) })
  const m203 = await msg({ 'POST wit/wiql': { ok: true, status: 203, json: async () => { throw new SyntaxError('<!DOCTYPE') }, text: async () => R.loginHtml } })
  const m200html = await msg({ 'POST wit/wiql': { ok: true, status: 200, json: async () => { throw new SyntaxError('<!DOCTYPE') }, text: async () => R.loginHtml } })
  const m404 = await msg({ 'POST wit/wiql': res('no', 404) })
  const mTime = await msg({ 'POST wit/wiql': Object.assign(new Error('x'), { name: 'AbortError' }) })
  const mRed = await msg({ 'POST wit/wiql': new TypeError('fetch failed Basic UEFULXNlY3JldG8=') })
  for (const m of [m401, m203, m200html]) assert.match(m, /Credencial inválida o vencida/)
  assert.match(m404, /No existe la organización\/proyecto org-ejemplo\/proyecto-ejemplo/)
  assert.match(mTime, /Azure DevOps no respondió en 10 s/)
  assert.equal(mRed, 'Sin conexión con Azure DevOps.')
  for (const m of [m401, m203, m404, mTime, mRed]) assert.ok(!/PAT-secreto|UEFULXNlY3JldG8|https?:/.test(m), m)
  assert.match(traducirError({ status: 500, cuerpo: 'a\n b' }), /respondió 500: a b/)
})
