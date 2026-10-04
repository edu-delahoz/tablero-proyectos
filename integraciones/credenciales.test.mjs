import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leerCredenciales, credencialesPara } from './credenciales.mjs'

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
