// Adaptador Azure DevOps con `fetch` simulado (respuestas ficticias en fixtures/integraciones).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ADO from './azure-devops.mjs'
const { leer, crear, actualizar, listar, descripcionHtml, traducirError, normalizarOrganizacion } = ADO

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
    const r0 = rutas[clave] ?? {
      'POST wit/wiql': (c) => (/@Me/.test(c.query) ? R.mias : R.wiql), 'GET wit/workitems': R.items, 'GET wit/workitemtypes': R.tipos,
      'POST wit/workitems/$Task': R.nuevo, 'PATCH wit/workitems/N': R.nuevo,
    }[clave]
    const r = typeof r0 === 'function' ? r0(init.body ? JSON.parse(init.body) : null) : r0
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
  assert.equal(d.llamadas.filter((l) => l.clave === 'GET wit/workitemtypes').length, 1)
  assert.deepEqual(r.items.map((x) => [x.id, x.titulo, x.hecha, x.columna]), [['101', 'Crear el esquema', true, 'Done'], ['102', 'Probar el login', false, 'Active'], ['103', 'Sin empezar', false, 'To Do']])
  assert.equal(r.items[0].url, 'https://dev.azure.com/org-ejemplo/proyecto-ejemplo/_workitems/edit/101')
  assert.equal(r.items[1].actualizado, '2026-01-11T10:00:00Z')
  const wiql = d.llamadas[0]
  assert.match(wiql.cuerpo.query, /\[System\.WorkItemType\] = 'Task' AND \[System\.State\] <> 'Removed'/)
  assert.equal(wiql.query['api-version'], '7.1')
  assert.equal(wiql.cabeceras.Authorization, `Basic ${Buffer.from(':PAT-secreto').toString('base64')}`)
  assert.equal(d.llamadas[1].query.fields, 'System.Title,System.State,System.ChangedDate,System.AssignedTo,System.WorkItemType,System.Description,Microsoft.VSTS.Common.Priority,System.IterationPath,System.Parent')
})

test('leer: lotes de 200 ids; estados configurables; aviso si fallan los estados', async () => {
  const muchos = { workItems: Array.from({ length: 450 }, (_, i) => ({ id: i + 1 })) }
  const d = ado({ 'POST wit/wiql': muchos, 'GET wit/workitems': { value: [] }, 'GET wit/workitemtypes': res('no', 404) })
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

test('listar: proyectos de la organización (sin proyecto en la URL) y tipos con sus estados', async () => {
  const d = ado({
    'GET projects': { value: [{ name: 'P1' }, { name: 'P2' }] },
    'GET wit/workitemtypes': { value: [{ name: 'Task', states: [{ name: 'To Do' }, { name: 'Done' }] }, { name: 'Bug' }, { name: 'Viejo', isDisabled: true, states: [] }] },
    'GET wit/workitemtypes/Bug/states': { value: [{ name: 'New' }, { name: 'Closed' }] },
  })
  const p = await listar({ organizacion: 'org-ejemplo' }, CRED, d)
  assert.deepEqual(p.proyectos, ['P1', 'P2'])
  assert.match(d.llamadas[0].url, /^https:\/\/dev\.azure\.com\/org-ejemplo\/_apis\/projects/)
  const t = await listar({ organizacion: 'org-ejemplo', proyecto: 'P1' }, CRED, d)
  assert.deepEqual(t.tipos, [{ nombre: 'Task', estados: ['To Do', 'Done'] }, { nombre: 'Bug', estados: ['New', 'Closed'] }])
})

test('listar: PAT inválido (203) traducido sin filtrar el PAT; exige organización', async () => {
  await assert.rejects(listar({ organizacion: 'o' }, CRED, ado({ 'GET projects': res('<html>login</html>', 203) })), (e) => /Credencial inválida/.test(e.message) && !/PAT-secreto/.test(e.message))
  await assert.rejects(listar({}, CRED, ado()), /organización/)
})

test('listar sin proyecto: 404 sin «undefined»; 203 sugiere el scope «Project and Team: Read»', async () => {
  await assert.rejects(listar({ organizacion: 'org-x' }, CRED, ado({ 'GET projects': res('no', 404) })), (e) => /No existe la organización org-x o el PAT/.test(e.message) && !/undefined/.test(e.message))
  await assert.rejects(listar({ organizacion: 'o' }, CRED, ado({ 'GET projects': res('<html>login</html>', 203) })), (e) => /Project and Team: Read/.test(e.message) && /a mano/.test(e.message))
})

test('normalizarOrganizacion: nombre, URLs de dev.azure.com y visualstudio.com, proyecto con decodeURIComponent', () => {
  const casos = [
    ['CodeFactory2026-2', { organizacion: 'CodeFactory2026-2' }],
    ['  Org  ', { organizacion: 'Org' }],
    ['https://dev.azure.com/Org', { organizacion: 'Org' }],
    ['http://dev.azure.com/Org/', { organizacion: 'Org' }],
    ['dev.azure.com/Org', { organizacion: 'Org' }],
    ['https://usuario@dev.azure.com/Org', { organizacion: 'Org' }],
    ['https://Org.visualstudio.com', { organizacion: 'Org' }],
    ['https://Org.visualstudio.com/DefaultCollection', { organizacion: 'Org' }],
    ['https://Org.visualstudio.com/Proy', { organizacion: 'Org', proyecto: 'Proy' }],
    ['https://dev.azure.com/Org/Proy/_boards/board', { organizacion: 'Org', proyecto: 'Proy' }],
    ['https://dev.azure.com/Org/_settings', { organizacion: 'Org' }],
    ['https://dev.azure.com/Org/Mi%20Proyecto/_boards', { organizacion: 'Org', proyecto: 'Mi Proyecto' }],
  ]
  for (const [entrada, esperado] of casos) assert.deepEqual(normalizarOrganizacion(entrada), esperado, entrada)
  for (const mal of ['', '   ', 'https://ejemplo.com/Org', 'https://dev.azure.com', 'ftp://dev.azure.com/Org', 'con espacios', undefined]) {
    assert.throws(() => normalizarOrganizacion(mal), /No entiendo la organización/, String(mal))
  }
})

test('una config guardada con la URL completa llama a dev.azure.com/<organización>/_apis', async () => {
  const d = ado()
  await leer({ ...CFG, organizacion: 'https://dev.azure.com/org-ejemplo/' }, CRED, d)
  assert.ok(d.llamadas.length > 0)
  for (const l of d.llamadas) assert.match(l.url, /^https:\/\/dev\.azure\.com\/org-ejemplo\/proyecto-ejemplo\/_apis\//)
  const r = await leer({ ...CFG, organizacion: 'https://dev.azure.com/org-ejemplo/', proyecto: 'Mi Proyecto' }, CRED, ado())
  assert.ok(r.items.every((x) => x.url.startsWith('https://dev.azure.com/org-ejemplo/Mi%20Proyecto/_workitems/edit/')), 'urlItem codifica el proyecto')
  assert.equal(r.url, 'https://dev.azure.com/org-ejemplo/Mi%20Proyecto/_workitems')
})

test('leer: varios tipos (IN), «*» sin filtro y tipoItem antiguo intacto; estados = unión de los tipos con una sola llamada', async () => {
  const d = ado()
  const r = await leer({ ...CFG, tipoItem: ['Task', 'Bug'] }, CRED, d)
  assert.match(d.llamadas[0].cuerpo.query, /\[System\.WorkItemType\] IN \('Task', 'Bug'\) AND \[System\.State\] <> 'Removed'/)
  assert.match(d.llamadas[0].cuerpo.query, /ORDER BY \[System\.ChangedDate\] DESC$/)
  assert.deepEqual(r.columnas, ['To Do', 'Active', 'Done', 'Removed', 'New', 'Resolved'])
  assert.equal(d.llamadas.filter((l) => l.clave === 'GET wit/workitemtypes').length, 1)
  const d2 = ado()
  const r2 = await leer({ ...CFG, tipoItem: '*' }, CRED, d2)
  assert.ok(!/WorkItemType/.test(d2.llamadas[0].cuerpo.query))
  assert.equal(r2.columnas.length, 6) // Epic aporta «New» y «Done», ya presentes
  const d3 = ado()
  await leer({ ...CFG, tipoItem: "O'Brien" }, CRED, d3)
  assert.match(d3.llamadas[0].cuerpo.query, /= 'O''Brien'/)
  const d4 = ado()
  await leer(CFG, CRED, d4)
  assert.match(d4.llamadas[0].cuerpo.query, /\[System\.WorkItemType\] = 'Task'/)
})

test('leer: asignado (objeto, texto, sin asignar), tipo y «mío» por @Me; si @Me falla, aviso y sin «mio»', async () => {
  const r = await leer(CFG, CRED, ado())
  assert.deepEqual(r.items.map((x) => [x.tipo, x.asignado, x.mio]), [
    ['Task', { nombre: 'Ana Ejemplo', correo: 'ana@ejemplo.com' }, true],
    ['Bug', { nombre: 'Luis Ejemplo', correo: 'luis@ejemplo.com' }, false],
    ['Task', null, false],
  ])
  const r2 = await leer(CFG, CRED, ado({ 'POST wit/wiql': (c) => (/@Me/.test(c.query) ? res('no', 400) : R.wiql) }))
  assert.equal(r2.items.length, 3)
  assert.ok(r2.items.every((x) => !('mio' in x)))
  assert.match(r2.avisos[0], /No se pudo saber cuáles son tuyas/)
})

test('leer: tope de 500 con aviso, los más recientes primero y lotes en paralelo (máx. 4)', async () => {
  const muchos = { workItems: Array.from({ length: 1700 }, (_, i) => ({ id: i + 1 })) }
  let vivas = 0, maximo = 0
  const d = ado({ 'POST wit/wiql': (c) => (/@Me/.test(c.query) ? { workItems: [] } : muchos), 'GET wit/workitems': () => ({ value: [] }) })
  const f = d.fetch
  d.fetch = async (url, init) => { vivas++; maximo = Math.max(maximo, vivas); await new Promise((ok) => setTimeout(ok, 2)); try { return await f(url, init) } finally { vivas-- } }
  const r = await leer(CFG, CRED, d)
  const lotes = d.llamadas.filter((l) => l.clave === 'GET wit/workitems').map((l) => l.query.ids.split(',').length)
  assert.deepEqual(lotes, [200, 200, 100])
  assert.ok(maximo <= 4)
  assert.match(r.avisos[0], /Mostrando 500 de 1700/)
})

test('crear con lista de tipos usa el primero', async () => {
  const d = ado({ 'POST wit/workitems/$Bug': R.nuevo })
  await crear({ ...CFG, tipoItem: ['Bug', 'Task'] }, CRED, { titulo: 'X' }, d)
  assert.equal(d.llamadas[0].clave, 'POST wit/workitems/$Bug')
})

// ---------- S37: modo participar (quienSoy, asignar, cambiarEstado) y campos para recomendar ----------
test('leer: descripción (HTML → texto, ≤ 600), prioridad, iteración y padre; null si faltan', async () => {
  const r = await leer(CFG, CRED, ado())
  const [a, b] = r.items
  assert.equal(a.descripcion, 'Crear las tablas base.\nVer el diseño & las notas\ndel equipo <v2>.')
  assert.deepEqual([a.prioridad, a.iteracion, a.padre], [2, 'proyecto-ejemplo\\Sprint 3', '100'])
  assert.deepEqual([b.descripcion, b.prioridad, b.iteracion, b.padre], [null, null, null, null])
  const largo = { value: [{ id: 1, fields: { 'System.Title': 't', 'System.State': 'To Do', 'System.Description': `<p>${'palabra '.repeat(200)}</p>` } }] }
  const r2 = await leer(CFG, CRED, ado({ 'GET wit/workitems': largo }))
  assert.ok(r2.items[0].descripcion.length <= 600 && r2.items[0].descripcion.endsWith('…'))
})

test('quienSoy: connectionData de la organización (sin proyecto) → { id, nombre, correo }; sin correo, error claro', async () => {
  const d = ado({ 'GET connectionData': R.yo })
  assert.deepEqual(await ADO.quienSoy(CFG, CRED, d), { id: 'aaaa-1111', nombre: 'Ana Ejemplo', correo: 'ana@ejemplo.com' })
  assert.match(d.llamadas[0].url, /^https:\/\/dev\.azure\.com\/org-ejemplo\/_apis\/connectionData\?/)
  await assert.rejects(ADO.quienSoy(CFG, CRED, ado({ 'GET connectionData': { authenticatedUser: { id: 'x', properties: {} } } })), /correo/)
  await assert.rejects(ADO.quienSoy(CFG, CRED, ado({ 'GET connectionData': res('no', 401) })), (e) => /Credencial inválida/.test(e.message) && !/PAT-secreto/.test(e.message))
})

test('asignar: PATCH add/remove de System.AssignedTo (json-patch) y devuelve el ítem; 400 traducido; nunca crea', async () => {
  const d = ado({ 'PATCH wit/workitems/N': R.asignado })
  const r = await ADO.asignar(CFG, CRED, '103', 'ana@ejemplo.com', d)
  assert.equal(d.llamadas.length, 1)
  assert.equal(d.llamadas[0].metodo, 'PATCH')
  assert.match(d.llamadas[0].url, /\/_apis\/wit\/workitems\/103\?/)
  assert.equal(d.llamadas[0].cabeceras['Content-Type'], 'application/json-patch+json')
  assert.deepEqual(d.llamadas[0].cuerpo, [{ op: 'add', path: '/fields/System.AssignedTo', value: 'ana@ejemplo.com' }])
  assert.deepEqual(r, { id: '103', columna: 'To Do', hecha: false, asignado: { nombre: 'Ana Ejemplo', correo: 'ana@ejemplo.com' } })
  const d2 = ado({ 'PATCH wit/workitems/N': { id: 103, fields: { 'System.State': 'To Do' } } })
  const r2 = await ADO.asignar(CFG, CRED, '103', null, d2)
  assert.deepEqual(d2.llamadas[0].cuerpo, [{ op: 'remove', path: '/fields/System.AssignedTo' }])
  assert.equal(r2.asignado, null)
  const cuerpo400 = JSON.stringify({ message: "TF401320: Rule Error for field Assigned To. Error code: Required, HasValues, LimitedToValues, AllowsOldValue, InvalidEmpty." })
  await assert.rejects(ADO.asignar(CFG, CRED, '103', 'otro@x.com', ado({ 'PATCH wit/workitems/N': res(cuerpo400, 400) })), (e) => /rechazó/.test(e.message) && /TF401320/.test(e.message) && !/PAT-secreto/.test(e.message))
  await assert.rejects(ADO.asignar(CFG, CRED, 'abc', 'a@b.c', ado()), /id/)
  assert.ok([...d.llamadas, ...d2.llamadas].every((l) => !l.clave.startsWith('POST')))
})

test('cambiarEstado: valida contra los estados (sin distinguir mayúsculas) antes del PATCH; con columnas dadas no las pide', async () => {
  const d = ado({ 'PATCH wit/workitems/N': { id: 102, fields: { 'System.State': 'Done' } } })
  const r = await ADO.cambiarEstado(CFG, CRED, '102', 'done', d)
  const parche = d.llamadas.find((l) => l.metodo === 'PATCH')
  assert.deepEqual(parche.cuerpo, [{ op: 'replace', path: '/fields/System.State', value: 'Done' }])
  assert.deepEqual([r.id, r.columna, r.hecha], ['102', 'Done', true])
  const d2 = ado()
  await assert.rejects(ADO.cambiarEstado(CFG, CRED, '102', 'Inventado', d2), /no es un estado/)
  assert.ok(d2.llamadas.every((l) => l.metodo !== 'PATCH'), 'no parchea un estado desconocido')
  const d3 = ado({ 'PATCH wit/workitems/N': { id: 102, fields: { 'System.State': 'Active' } } })
  await ADO.cambiarEstado(CFG, CRED, '102', 'Active', d3, { columnas: ['To Do', 'Active'] })
  assert.deepEqual(d3.llamadas.map((l) => l.metodo), ['PATCH'])
  await assert.rejects(ADO.cambiarEstado(CFG, CRED, '102', 'Done', ado(), { columnas: ['To Do', 'Active'] }), /no es un estado/)
})
