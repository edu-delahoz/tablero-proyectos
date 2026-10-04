import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, statSync, chmodSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as CONFIG from './config.mjs'
const { validarIntegracion, aplicarCambio, editarProyecto, escribirAtomico } = CONFIG

const dir = mkdtempSync(join(tmpdir(), 'tablero-config-'))
const ctx = { backlogs: ['BACKLOG.md'], otras: ['gh'] }

test('validarIntegracion: obligatorios por tipo, id, backlog y tipo, con mensajes en español', () => {
  assert.deepEqual(validarIntegracion(null).errores, ['Falta la integración.'])
  const mal = validarIntegracion({ id: 'Mal Id', tipo: 'trello', backlog: 'OTRO.md' }, ctx).errores
  assert.ok(mal.some((e) => /minúsculas/.test(e)))
  assert.ok(mal.some((e) => /No encuentro «OTRO.md»/.test(e)))
  assert.ok(mal.some((e) => /Trello: falta «tablero»/.test(e)))
  assert.match(validarIntegracion({ id: 'gh', tipo: 'github-projects', propietario: 'u', numero: 1, backlog: 'BACKLOG.md' }, ctx).errores[0], /Ya hay otra/)
  assert.match(validarIntegracion({ id: 'x', tipo: 'jira', backlog: 'BACKLOG.md' }, ctx).errores[0], /Tipo desconocido/)
  const ado = validarIntegracion({ id: 'ado', tipo: 'azure-devops', organizacion: 'o', backlog: 'BACKLOG.md' }, ctx).errores
  assert.deepEqual(ado, ['Azure DevOps: falta «proyecto».'])
  assert.match(validarIntegracion({ id: 'g2', tipo: 'github-projects', propietario: 'u', numero: 0, backlog: 'BACKLOG.md' }, ctx).errores[0], /entero positivo/)
  assert.match(validarIntegracion({ id: 't', tipo: 'trello', tablero: 'b', backlog: 'BACKLOG.md', columnas: { listo: 'x' } }, ctx).errores[0], /columna desconocida/)
})

test('validarIntegracion: lista blanca, recorta, convierte el número y admite listas en columnas', () => {
  const { errores, limpia } = validarIntegracion({
    id: 'gh2', tipo: 'github-projects', propietario: ' usuario ', numero: '3', backlog: 'BACKLOG.md', auto: true,
    columnas: { hecho: 'Done', pendiente: '' }, tablero: 'no-aplica', token: 'secreto', __proto__x: 1,
  }, ctx)
  assert.deepEqual(errores, [])
  assert.deepEqual(limpia, { id: 'gh2', tipo: 'github-projects', backlog: 'BACKLOG.md', propietario: 'usuario', numero: 3, columnas: { hecho: 'Done' }, auto: true })
  const ado = validarIntegracion({ id: 'ado', tipo: 'azure-devops', organizacion: 'o', proyecto: 'p', backlog: 'BACKLOG.md', columnas: { hecho: ['Done', 'Closed'] } }, ctx)
  assert.deepEqual(ado.limpia.columnas, { hecho: ['Done', 'Closed'] })
  assert.equal('auto' in ado.limpia, false)
})

test('validarIntegracion: la organización de Azure DevOps se guarda como nombre y no pisa un proyecto escrito', () => {
  const base = { id: 'ado', tipo: 'azure-devops', backlog: 'BACKLOG.md' }
  const url = validarIntegracion({ ...base, organizacion: 'https://dev.azure.com/CodeFactory2026-2', proyecto: 'EAP10' }, ctx)
  assert.deepEqual([url.errores, url.limpia.organizacion, url.limpia.proyecto], [[], 'CodeFactory2026-2', 'EAP10'])
  const conProy = validarIntegracion({ ...base, organizacion: 'https://dev.azure.com/Org/Otro/_boards', proyecto: 'Mio' }, ctx)
  assert.equal(conProy.limpia.proyecto, 'Mio')
  assert.deepEqual(validarIntegracion({ ...base, organizacion: 'https://dev.azure.com/Org/Otro/_boards' }, ctx).limpia.proyecto, 'Otro')
  const mal = validarIntegracion({ ...base, organizacion: 'https://ejemplo.com/x', proyecto: 'p' }, ctx).errores
  assert.match(mal[0], /^Azure DevOps: No entiendo la organización/)
})

const CRUDO = `[
  {
    "id": "a",
    "nombre": "A",
    "repo": "~/Desarrollo/a",
    "docs": ["~/Desarrollo/a/docs"],
    "integraciones": [
      { "id": "gh", "tipo": "github-projects", "propietario": "u", "numero": 1, "backlog": "BACKLOG.md", "futuro": 7 },
      { "id": "tr", "tipo": "trello", "tablero": "b", "backlog": "BACKLOG.md" }
    ],
    "extra": { "z": 1, "a": 2 }
  },
  { "id": "b", "nombre": "B" }
]
`

test('aplicarCambio: añadir conserva «~», campos ajenos, orden y sangría', () => {
  const nuevo = aplicarCambio(CRUDO, 'b', { op: 'guardar', integracion: { id: 'ado', tipo: 'azure-devops', organizacion: 'o', proyecto: 'p', backlog: 'X.md' } })
  const l = JSON.parse(nuevo)
  assert.equal(l[0].repo, '~/Desarrollo/a')
  assert.deepEqual(Object.keys(l[0]), ['id', 'nombre', 'repo', 'docs', 'integraciones', 'extra'])
  assert.deepEqual(Object.keys(l[0].extra), ['z', 'a'])
  assert.deepEqual(l[1].integraciones.map((x) => x.id), ['ado'])
  assert.match(nuevo, /^\[\n {2}\{\n {4}"id": "a"/)
  assert.ok(nuevo.endsWith('\n'))
  // Sangría de 4 si el original la usa.
  assert.match(aplicarCambio('[\n    { "id": "b", "integraciones": [{ "id": "x" }] }\n]', 'b', { op: 'quitar', id: 'x' }), /^\[\n {4}\{\n {8}"id": "b"\n/)
})

test('aplicarCambio: editar en su sitio (también renombrando), conserva campos fuera de la lista blanca', () => {
  const l = JSON.parse(aplicarCambio(CRUDO, 'a', { op: 'guardar', idOriginal: 'gh', integracion: { id: 'gh-nuevo', tipo: 'github-projects', propietario: 'v', numero: 2, backlog: 'BACKLOG.md' } }))
  assert.deepEqual(l[0].integraciones.map((x) => x.id), ['gh-nuevo', 'tr'])
  assert.deepEqual(l[0].integraciones[0], { id: 'gh-nuevo', tipo: 'github-projects', propietario: 'v', numero: 2, backlog: 'BACKLOG.md', futuro: 7 })
  assert.throws(() => aplicarCambio(CRUDO, 'a', { op: 'guardar', idOriginal: 'gh', integracion: { id: 'tr' } }), /Ya hay otra/)
  assert.throws(() => aplicarCambio(CRUDO, 'a', { op: 'guardar', idOriginal: 'nada', integracion: { id: 'x' } }), (e) => e.estado === 404)
  assert.throws(() => aplicarCambio(CRUDO, 'zz', { op: 'guardar', integracion: { id: 'x' } }), (e) => e.estado === 404)
  assert.throws(() => aplicarCambio('{ roto', 'a', { op: 'quitar', id: 'gh' }), (e) => e.estado === 409)
})

test('aplicarCambio: quitar deja el resto y borra la lista vacía', () => {
  let l = JSON.parse(aplicarCambio(CRUDO, 'a', { op: 'quitar', id: 'gh' }))
  assert.deepEqual(l[0].integraciones.map((x) => x.id), ['tr'])
  l = JSON.parse(aplicarCambio(JSON.stringify(l, null, 2), 'a', { op: 'quitar', id: 'tr' }))
  assert.equal('integraciones' in l[0], false)
  assert.throws(() => aplicarCambio(CRUDO, 'a', { op: 'quitar', id: 'nada' }), (e) => e.estado === 404)
})

test('escribirAtomico: reemplaza sin temporales sueltos; con modo deja 0600; sin modo conserva los permisos', () => {
  const r = join(dir, 'sub', 'c.json')
  escribirAtomico(r, '{"a":1}', 0o600)
  assert.equal(readFileSync(r, 'utf8'), '{"a":1}')
  assert.equal(statSync(r).mode & 0o777, 0o600)
  const p = join(dir, 'p.json')
  writeFileSync(p, '[]')
  chmodSync(p, 0o640)
  escribirAtomico(p, '[1]')
  assert.equal(readFileSync(p, 'utf8'), '[1]')
  assert.equal(statSync(p).mode & 0o777, 0o640)
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [])
})

test('azure-devops: tipoItem acepta texto, lista (≤10) o «*» solo en modo lectura', () => {
  const base = { id: 'ado', tipo: 'azure-devops', backlog: 'BACKLOG.md', organizacion: 'Org', proyecto: 'P' }
  const v = (extra) => validarIntegracion({ ...base, ...extra }, { backlogs: ['BACKLOG.md'] })
  assert.equal(v({ tipoItem: ' Bug ' }).limpia.tipoItem, 'Bug')
  assert.deepEqual(v({ tipoItem: ['Task', ' Bug'] }).limpia.tipoItem, ['Task', 'Bug'])
  assert.equal(v({ tipoItem: Array.from({ length: 11 }, (_, i) => `T${i}`) }).errores.length, 1)
  assert.equal(v({ tipoItem: [] }).errores.length, 1)
  assert.match(v({ tipoItem: '*' }).errores[0], /solo sirve en modo solo lectura/)
  assert.deepEqual(v({ tipoItem: '*', modo: 'lectura' }).errores, [])
})

test('modo: lectura guarda sin backlog y rechaza auto; sincronizar (por defecto) sigue exigiendo backlog', () => {
  const ado = { id: 'ado', tipo: 'azure-devops', organizacion: 'Org', proyecto: 'P' }
  const l = validarIntegracion({ ...ado, modo: 'lectura', tipoItem: '*' }, { backlogs: [] })
  assert.deepEqual(l.errores, [])
  assert.deepEqual(l.limpia, { id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'P', tipoItem: '*' })
  assert.match(validarIntegracion({ ...ado, modo: 'lectura', auto: true }, { backlogs: [] }).errores[0], /«auto» no sirve en modo solo lectura/)
  assert.equal(validarIntegracion({ ...ado, modo: 'lectura', auto: false }, { backlogs: [] }).limpia.auto, undefined)
  assert.match(validarIntegracion({ ...ado, modo: 'lectura', backlog: 'NADA.md' }, { backlogs: [] }).errores[0], /NADA.md/)
  assert.match(validarIntegracion(ado, { backlogs: [] }).errores[0], /Elige el backlog/)
  assert.match(validarIntegracion({ ...ado, modo: 'sincronizar' }, { backlogs: [] }).errores[0], /Elige el backlog/)
  assert.equal(validarIntegracion({ ...ado, modo: 'sincronizar', backlog: 'B.md' }, { backlogs: ['B.md'] }).limpia.modo, 'sincronizar')
  assert.match(validarIntegracion({ ...ado, modo: 'escribir', backlog: 'B.md' }, { backlogs: ['B.md'] }).errores[0], /Modo desconocido/)
  // Editar: «modo» está en la lista blanca, así que el reemplazo lo conserva (y quitarlo vuelve a sincronizar).
  const crudo = JSON.stringify([{ id: 'p', integraciones: [{ id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'P' }] }])
  const editado = JSON.parse(aplicarCambio(crudo, 'p', { op: 'guardar', idOriginal: 'ado', integracion: { ...l.limpia, proyecto: 'Q' } }))
  assert.equal(editado[0].integraciones[0].modo, 'lectura')
  assert.equal(editado[0].integraciones[0].proyecto, 'Q')
})

test('editarProyecto: cambia solo los campos pedidos en su sitio; integraciones, «~», orden y campos ajenos intactos', () => {
  const lista = [
    { id: 'otro', nombre: 'Otro', repo: '~/otro' },
    { id: 'eap10', nombre: 'EAP10', futuro: { x: 1 }, notas: '~/n.md', planes: ['a.md'], integraciones: [{ id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'EAP10', tipoItem: '*', ajeno: true }] },
  ]
  const crudo = JSON.stringify(lista, null, 2) + '\n'
  const nuevo = editarProyecto(crudo, 'eap10', { nombre: 'EAP 10', repo: '~/eap10', docs: ['~/eap10/docs'], notas: '' })
  const [otro, p] = JSON.parse(nuevo)
  assert.deepEqual(otro, lista[0])
  assert.deepEqual(Object.keys(p), ['id', 'nombre', 'futuro', 'planes', 'integraciones', 'repo', 'docs'])
  assert.equal(p.nombre, 'EAP 10')
  assert.equal(p.repo, '~/eap10')
  assert.deepEqual(p.integraciones, lista[1].integraciones)
  assert.deepEqual(p.futuro, { x: 1 })
  assert.deepEqual(p.planes, ['a.md'])
  assert.ok(nuevo.startsWith('[\n  {'), 'conserva la sangría')
  assert.throws(() => editarProyecto(crudo, 'eap10', { nombre: '' }), /nombre/)
  assert.throws(() => editarProyecto(crudo, 'eap10', { integraciones: [] }), /no se edita/)
  assert.throws(() => editarProyecto(crudo, 'eap10', { id: 'x' }), /no se edita/)
  assert.throws(() => editarProyecto(crudo, 'nada', { nombre: 'x' }), (e) => e.estado === 404)
  assert.throws(() => editarProyecto('{roto', 'eap10', { nombre: 'x' }), (e) => e.estado === 409)
  assert.equal(editarProyecto(crudo, 'eap10', {}), crudo, 'sin cambios, el texto queda igual')
})

test('modo participar (S37): sin backlog, «*» permitido, «auto» rechazado; solo Azure DevOps; noEscribeMd', () => {
  assert.ok(CONFIG.MODOS.includes('participar'))
  const ado = { id: 'ado', tipo: 'azure-devops', organizacion: 'Org', proyecto: 'P' }
  const p = validarIntegracion({ ...ado, modo: 'participar', tipoItem: '*' }, { backlogs: [] })
  assert.deepEqual(p.errores, [])
  assert.deepEqual(p.limpia, { id: 'ado', tipo: 'azure-devops', modo: 'participar', organizacion: 'Org', proyecto: 'P', tipoItem: '*' })
  assert.match(validarIntegracion({ ...ado, modo: 'participar', auto: true }, { backlogs: [] }).errores[0], /«auto» no sirve/)
  assert.match(validarIntegracion({ id: 'g', tipo: 'github-projects', propietario: 'u', numero: 1, modo: 'participar' }, { backlogs: [] }).errores.join(' '), /aún no participa/)
  assert.match(validarIntegracion({ id: 't', tipo: 'trello', tablero: 'b', modo: 'participar' }, { backlogs: [] }).errores.join(' '), /aún no participa/)
  assert.deepEqual(['lectura', 'participar', 'sincronizar', undefined].map((modo) => CONFIG.noEscribeMd({ modo })), [true, true, false, false])
})
