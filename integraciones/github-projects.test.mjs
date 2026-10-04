// Adaptador GitHub Projects con `gh` simulado (respuestas ficticias en fixtures/integraciones).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leer, crear, actualizar, listar, traducirError } from './github-projects.mjs'

const R = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'integraciones', 'github-projects.json'), 'utf8'))
const CFG = { id: 'gh', tipo: 'github-projects', propietario: 'usuario', numero: 1 }

// exec falso: responde según la operación GraphQL y registra las variables de cada llamada.
function gh(respuestas = {}) {
  const llamadas = []
  const exec = async (args) => {
    const query = args.find((a) => a.startsWith('query=')).slice(6)
    const vars = Object.fromEntries(args.filter((a, i) => args[i - 1] === '-f' || args[i - 1] === '-F').filter((a) => !a.startsWith('query=')).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]))
    const op = query.match(/(addProjectV2DraftIssue|updateProjectV2ItemFieldValue|updateProjectV2DraftIssue|updateIssue|node\(id|repositoryOwner|viewer)/)[1]
    llamadas.push({ op, vars, args })
    const r = respuestas[op] ?? { repositoryOwner: R.proyecto, addProjectV2DraftIssue: R.crear, updateProjectV2ItemFieldValue: R.ok, 'node(id': R.contenido, updateProjectV2DraftIssue: { data: {} } }[op]
    if (r instanceof Error) throw r
    return JSON.stringify(r)
  }
  return { exec, llamadas, memo: new Map() }
}

test('leer: ítems con columna y hecha, URL de borrador e issue; omite archivados', async () => {
  const d = gh()
  const r = await leer(CFG, {}, d)
  assert.equal(r.url, 'https://github.com/users/usuario/projects/1')
  assert.deepEqual(r.columnas, ['Todo', 'In Progress', 'Done'])
  assert.deepEqual(r.items.map((x) => [x.id, x.titulo, x.hecha, x.columna]), [
    ['PVTI_1', 'Crear el esquema', true, 'Done'], ['PVTI_2', 'Probar el login', false, 'In Progress'], ['PVTI_3', 'Sin estado', false, null]])
  assert.equal(r.items[0].url, 'https://github.com/users/usuario/projects/1?pane=issue&itemId=1001')
  assert.equal(r.items[1].url, 'https://github.com/usuario/repo/issues/2')
  assert.deepEqual(d.llamadas[0].vars, { owner: 'usuario', number: '1' })
  assert.ok(d.llamadas[0].args.includes('-F'), 'el número va con -F (entero)')
})

test('leer: opción «hecho» configurable y error si no existe', async () => {
  const r = await leer({ ...CFG, columnas: { hecho: 'In Progress' } }, {}, gh())
  assert.deepEqual(r.items.map((x) => x.hecha), [false, true, false])
  await assert.rejects(leer({ ...CFG, columnas: { hecho: 'Cerrado' } }, {}, gh()), /no tiene la opción «Cerrado»/)
})

test('crear: borrador con cuerpo, estado inicial y sección; títulos con @ van literales (-f)', async () => {
  const d = gh()
  const r = await crear(CFG, {}, { titulo: '@raro título', hecha: false, seccion: 'S3', descripcion: '- [ ] sub' }, d)
  assert.deepEqual(r, { id: 'PVTI_nuevo', url: 'https://github.com/users/usuario/projects/1?pane=issue&itemId=2001' })
  const ops = d.llamadas.map((l) => l.op)
  assert.deepEqual(ops, ['repositoryOwner', 'addProjectV2DraftIssue', 'updateProjectV2ItemFieldValue', 'updateProjectV2ItemFieldValue'])
  assert.deepEqual(d.llamadas[1].vars, { projectId: 'PVT_ejemplo', title: '@raro título', body: '- [ ] sub' })
  assert.equal(d.llamadas[1].args[d.llamadas[1].args.indexOf('title=@raro título') - 1], '-f')
  assert.equal(d.llamadas[2].vars.optionId, 'op_todo')
  assert.deepEqual([d.llamadas[3].vars.fieldId, d.llamadas[3].vars.text], ['PVTF_seccion', 'S3'])
  const d2 = gh()
  await crear(CFG, {}, { titulo: 'Hecha', hecha: true }, d2)
  assert.equal(d2.llamadas[2].vars.optionId, 'op_done')
  assert.equal(d2.llamadas.length, 3, 'sin sección no se escribe el campo')
})

test('actualizar: estado mueve de columna; título renombra el borrador; nunca borra', async () => {
  const d = gh()
  await actualizar(CFG, {}, 'PVTI_1', { hecha: false, titulo: 'Nuevo' }, d)
  assert.deepEqual(d.llamadas.map((l) => l.op), ['repositoryOwner', 'node(id', 'updateProjectV2DraftIssue', 'updateProjectV2ItemFieldValue'])
  assert.deepEqual(d.llamadas[2].vars, { id: 'DI_1', title: 'Nuevo' })
  assert.equal(d.llamadas[3].vars.optionId, 'op_todo')
  assert.ok(d.llamadas.every((l) => !/delete[A-Z]\w*\(|archive[A-Z]\w*\(/.test(l.args.join(' '))))
})

test('errores en español: 404 / NOT_FOUND, credencial, scope, timeout, sin gh, sin red', async () => {
  await assert.rejects(leer({ ...CFG, numero: 99 }, {}, gh({ repositoryOwner: R.noExiste })), /No existe el proyecto usuario\/99/)
  await assert.rejects(leer(CFG, {}, gh({ repositoryOwner: { data: { repositoryOwner: null } } })), /No existe el proyecto usuario\/1/)
  const falla = (props) => gh({ repositoryOwner: Object.assign(new Error('Command failed'), props) })
  await assert.rejects(leer(CFG, {}, falla({ stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)' })), /Credencial inválida o vencida/)
  await assert.rejects(leer(CFG, {}, falla({ stderr: "INSUFFICIENT_SCOPES: Your token has not been granted the required scopes" })), /gh auth refresh -s project/)
  await assert.rejects(leer(CFG, {}, falla({ killed: true, signal: 'SIGTERM' })), /no respondió en 10 s/)
  await assert.rejects(leer(CFG, {}, falla({ code: 'ENOENT' })), /No está instalado gh/)
  assert.equal(traducirError({ stderr: 'error connecting to api.github.com' }), 'Sin conexión con GitHub.')
})

test('listar: sin proyecto → Projects abiertos del usuario y de sus orgs; con proyecto → campos de selección y de texto', async () => {
  const proy = (n, t, closed = false) => ({ number: n, title: t, url: `https://github.com/p/${n}`, closed })
  const d = gh({ viewer: { data: { viewer: { login: 'yo', projectsV2: { nodes: [proy(1, 'Mío'), proy(2, 'Cerrado', true)] },
    organizations: { nodes: [{ login: 'acme', projectsV2: { nodes: [proy(9, 'De la org')] } }, { login: 'vacia', projectsV2: { nodes: [] } }] } } } } })
  const r = await listar({}, {}, d)
  assert.deepEqual(r.proyectos.map((x) => [x.propietario, x.numero, x.titulo]), [['yo', 1, 'Mío'], ['acme', 9, 'De la org']])
  const c = await listar({ propietario: 'usuario', numero: 1 }, {}, gh({ repositoryOwner: R.proyecto }))
  assert.deepEqual(c.camposSeleccion, [{ nombre: 'Status', opciones: ['Todo', 'In Progress', 'Done'] }])
  assert.deepEqual(c.camposTexto, ['Sección'])
})

test('listar: errores de gh traducidos y proyecto inexistente', async () => {
  const sinScope = Object.assign(new Error('x'), { stderr: 'missing scope read:project' })
  await assert.rejects(listar({}, {}, gh({ viewer: sinScope })), /gh auth refresh -s project/)
  await assert.rejects(listar({ propietario: 'u', numero: 3 }, {}, gh({ repositoryOwner: { data: { repositoryOwner: null } } })), /No existe el proyecto u\/3/)
})
