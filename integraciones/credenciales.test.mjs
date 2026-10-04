import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leerCredenciales, credencialesPara, guardarCredencial, resumenCredenciales } from './credenciales.mjs'

const dir = mkdtempSync(join(tmpdir(), 'tablero-cred-'))

test('leerCredenciales: archivo ausente → vacío y sin aviso; permisos abiertos → aviso; JSON roto → aviso', () => {
  assert.deepEqual(leerCredenciales(join(dir, 'no-existe.json')), { datos: {}, aviso: null })
  const r = join(dir, 'c.json')
  writeFileSync(r, JSON.stringify({ trello: { key: 'k', token: 't' } }))
  chmodSync(r, 0o644)
  const a = leerCredenciales(r)
  assert.equal(a.datos.trello.key, 'k')
  assert.match(a.aviso, /chmod 600/)
  chmodSync(r, 0o600)
  assert.equal(leerCredenciales(r).aviso, null)
  const roto = join(dir, 'roto.json')
  writeFileSync(roto, '{ no es json')
  chmodSync(roto, 0o600)
  assert.match(leerCredenciales(roto).aviso, /JSON inválido/)
})

test('credencialesPara: por tipo, por id y entorno; dice exactamente qué falta', () => {
  const trello = { id: 'trello-2', tipo: 'trello' }
  assert.deepEqual(credencialesPara(trello, {}, {}).faltan, ['trello.key (o TRELLO_KEY)', 'trello.token (o TRELLO_TOKEN)'])
  const r = credencialesPara(trello, { trello: { key: 'k', token: 'viejo' }, 'trello-2': { token: 'del-id' } }, {})
  assert.deepEqual([r.cred, r.faltan, r.paso], [{ key: 'k', token: 'del-id' }, [], null])
  assert.equal(credencialesPara(trello, {}, { TRELLO_KEY: 'a', TRELLO_TOKEN: 'b' }).faltan.length, 0)
  assert.match(credencialesPara({ id: 'ado', tipo: 'azure-devops' }, {}, {}).paso, /AZURE_DEVOPS_PAT/)
  assert.deepEqual(credencialesPara({ id: 'gh', tipo: 'github-projects' }, {}, {}).faltan, [])
})

test('guardarCredencial: mezcla, borra campos vacíos, crea la carpeta y deja 0600 (también si ya estaba abierto)', () => {
  const r = join(dir, 'nueva', 'credenciales.json')
  guardarCredencial('trello', { key: 'k1', token: 't1' }, r)
  assert.equal(statSync(r).mode & 0o777, 0o600)
  guardarCredencial('azure-devops', { pat: 'p1' }, r)
  guardarCredencial('trello', { token: ' t2 ' }, r)
  assert.deepEqual(JSON.parse(readFileSync(r, 'utf8')), { trello: { key: 'k1', token: 't2' }, 'azure-devops': { pat: 'p1' } })
  chmodSync(r, 0o644)
  guardarCredencial('azure-devops', { pat: '' }, r)
  assert.deepEqual(JSON.parse(readFileSync(r, 'utf8')), { trello: { key: 'k1', token: 't2' } })
  assert.equal(statSync(r).mode & 0o777, 0o600)
  const roto = join(dir, 'roto2.json')
  writeFileSync(roto, '{ no es json')
  chmodSync(roto, 0o600)
  assert.throws(() => guardarCredencial('trello', { key: 'k' }, roto), /JSON inválido/)
  assert.equal(readFileSync(roto, 'utf8'), '{ no es json')
})

test('resumenCredenciales: completa, fuente y últimos 4; nunca el valor ni los nombres de campo', () => {
  const datos = { trello: { key: 'clave-larga-1234', token: 'token-muy-secreto-abcd' }, 'tr-2': { token: 'otro-token-secreto-wxyz' } }
  const r = resumenCredenciales(datos, {}, [{ id: 'tr-2', tipo: 'trello' }, { id: 'gh', tipo: 'github-projects' }])
  assert.deepEqual(r.trello, { tipo: 'trello', guardada: true, fuente: 'archivo', fin: '…abcd' })
  assert.deepEqual(r['tr-2'], { tipo: 'trello', guardada: true, fuente: 'archivo', fin: '…wxyz' })
  assert.deepEqual(r['azure-devops'], { tipo: 'azure-devops', guardada: false, fuente: null, fin: null })
  assert.equal(r.gh, undefined)
  assert.equal(r['github-projects'].guardada, true)
  assert.deepEqual(resumenCredenciales({}, { AZURE_DEVOPS_PAT: 'pat-de-entorno-9876' })['azure-devops'], { tipo: 'azure-devops', guardada: true, fuente: 'entorno', fin: '…9876' })
  assert.equal(resumenCredenciales({ trello: { key: 'k', token: 'corto' } }).trello.fin, null)
  const json = JSON.stringify(r)
  for (const s of ['secreto', 'clave-larga', 'token', 'key']) assert.ok(!json.includes(s), s)
})
