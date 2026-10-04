// S39: pedírselo a Claude — CLI --tareas / --asignarme / --estado y la línea del hook. Sin red: fetch simulado por --import. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { textoTareas, lineasIntegraciones } from './generar.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ITEMS = [
  { id: '1', titulo: 'Login roto', hecha: false, columna: 'Active', url: 'https://x/1', tipo: 'Bug', asignado: { nombre: 'Ana', correo: 'ana@x' }, mio: false, prioridad: '1', iteracion: 'Sprint 3', descripcion: 'No entra' },
  { id: '2', titulo: 'Reporte mensual', hecha: false, columna: 'New', url: 'https://x/2', tipo: 'Task', asignado: null, mio: false, prioridad: '2', iteracion: 'Sprint 4', descripcion: 'Exportar a PDF\ncon logo' },
  { id: '3', titulo: 'Mi tarea', hecha: false, columna: 'Active', url: 'https://x/3', tipo: 'Task', asignado: { nombre: 'Yo', correo: 'yo@x' }, mio: true, prioridad: null, iteracion: null, descripcion: null },
  { id: '4', titulo: 'Ya cerrada', hecha: true, columna: 'Closed', url: 'https://x/4', tipo: 'Task', asignado: null, mio: false },
]
const COLS = ['New', 'Active', 'Closed']

test('textoTareas: Markdown por estado con conteos y campos del ítem', () => {
  const t = textoTareas(ITEMS, {}, { columnas: COLS, nombre: 'Azure DevOps', id: 'ado' })
  assert.match(t, /Azure DevOps `ado`/)
  assert.match(t, /### New \(1\)/)
  assert.match(t, /### Active \(2\)/)
  assert.match(t, /#2 · Task · P2 · Sprint 4 · sin asignar · Reporte mensual · Exportar a PDF con logo · https:\/\/x\/2/)
  assert.match(t, /#3 · Task · .*asignado a Yo.*· Mi tarea/)
  assert.ok(t.indexOf('### New') < t.indexOf('### Active') && t.indexOf('### Active') < t.indexOf('### Closed'), 'orden de columnas')
})

test('textoTareas: --sin-asignar y --mias filtran (y los cerrados no cuentan sin asignar)', () => {
  const sin = textoTareas(ITEMS, { sinAsignar: true }, { columnas: COLS })
  assert.match(sin, /#2 /)
  assert.doesNotMatch(sin, /#1 |#3 /)
  assert.doesNotMatch(sin, /#4 /)
  const mias = textoTareas(ITEMS, { mias: true }, { columnas: COLS })
  assert.match(mias, /#3 /)
  assert.doesNotMatch(mias, /#1 |#2 /)
  assert.match(textoTareas([], { sinAsignar: true }, { columnas: COLS }), /Nada|ningún|0/i)
})

test('lineasIntegraciones (hook): sin asignar y mías abiertas desde la caché, con el comando para pedirlo', () => {
  const p = { id: 'eap10', integraciones: [{ id: 'ado', tipo: 'azure-devops', modo: 'participar' }, { id: 'sol', tipo: 'azure-devops', modo: 'lectura' }, { id: 'gh', tipo: 'github-projects', modo: 'sincronizar' }] }
  const cache = { ado: { items: ITEMS }, sol: { items: ITEMS } }
  const l = lineasIntegraciones(p, cache)
  assert.equal(l.length, 2, 'solo participar y lectura con caché; sincronizar no')
  assert.match(l[0], /Azure DevOps `ado`: 1 sin asignar, 1 mías abiertas/)
  assert.match(l[0], /node .*generar\.mjs --tareas eap10 --sin-asignar/)
  assert.deepEqual(lineasIntegraciones(p, {}), [])
})

// ---- CLI de punta a punta, con fetch de Azure simulado ----
const dir = mkdtempSync(join(tmpdir(), 'tablero-tareas-'))
mkdirSync(join(dir, 'datos'))
const llamadas = join(dir, 'llamadas.json')
writeFileSync(join(dir, 'proyectos.json'), JSON.stringify([
  { id: 'eap', nombre: 'EAP', integraciones: [{ id: 'ado', tipo: 'azure-devops', modo: 'participar', organizacion: 'Org', proyecto: 'P', tipoItem: '*' }] },
  { id: 'sol', nombre: 'Solo', integraciones: [{ id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'P', tipoItem: '*' }] },
]))
for (const p of ['eap', 'sol']) writeFileSync(join(dir, 'datos', `externo-${p}.json`), JSON.stringify({ ado: { titulo: 'EAP10', columnas: COLS, items: ITEMS, fecha: new Date().toISOString() } }))
writeFileSync(join(dir, 'fetch.mjs'), `import { appendFileSync } from 'node:fs'
globalThis.fetch = async (url, o) => {
  appendFileSync(${JSON.stringify(llamadas)}, JSON.stringify([o.method, String(url), o.body || null]) + '\\n')
  const json = (x) => ({ ok: true, status: 200, json: async () => x, text: async () => JSON.stringify(x) })
  if (String(url).includes('connectionData')) return json({ authenticatedUser: { id: 'u1', customDisplayName: 'Yo', properties: { Account: { $value: 'yo@x' } } } })
  const m = String(url).match(/workitems\\/(\\d+)/)
  const op = JSON.parse(o.body || '[]')[0] || {}
  return json({ id: Number(m[1]), fields: { 'System.State': op.path === '/fields/System.State' ? op.value : 'New', ...(op.path === '/fields/System.AssignedTo' && op.op === 'add' ? { 'System.AssignedTo': { displayName: 'Yo', uniqueName: op.value } } : {}) } })
}
`)
const cli = (...a) => spawnSync(process.execPath, ['--import', join(dir, 'fetch.mjs'), join(AQUI, 'generar.mjs'), ...a], {
  encoding: 'utf8', env: { ...process.env, TABLERO_PROYECTOS: join(dir, 'proyectos.json'), TABLERO_DATOS: join(dir, 'datos'), AZURE_DEVOPS_PAT: 'pat-de-prueba-123', TABLERO_CREDENCIALES: join(dir, 'nada.json') },
})
const llamadasHechas = () => { try { return readFileSync(llamadas, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }

test('CLI --tareas: imprime el Markdown desde la caché, con filtros e --integracion', () => {
  const r = cli('--tareas', 'eap', '--sin-asignar')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /#2 · Task/)
  assert.doesNotMatch(r.stdout, /#1 /)
  assert.equal(cli('--tareas', 'eap', '--integracion', 'nada').status, 1)
  assert.equal(cli('--tareas', 'noexiste').status, 1)
  assert.deepEqual(llamadasHechas(), [], '--tareas no usa la red')
})

test('CLI --asignarme / --estado: solo en participar (si no, cómo activarlo); confirman con el título', () => {
  for (const a of [['--asignarme', 'sol', '2'], ['--estado', 'sol', '2', 'Active']]) {
    const r = cli(...a)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /participar/)
  }
  assert.deepEqual(llamadasHechas(), [])
  const a = cli('--asignarme', 'eap', '2')
  assert.equal(a.status, 0, a.stderr)
  assert.match(a.stdout, /#2.*Reporte mensual.*asignad/i)
  const e = cli('--estado', 'eap', '2', 'active')
  assert.equal(e.status, 0, e.stderr)
  assert.match(e.stdout, /#2.*Reporte mensual.*Active/)
  const ext = JSON.parse(readFileSync(join(dir, 'datos', 'externo-eap.json'), 'utf8'))
  assert.equal(ext.ado.items.find((x) => x.id === '2').columna, 'Active', 'parchea la caché')
  const q = cli('--asignarme', 'eap', '2', '--quitar')
  assert.equal(q.status, 0, q.stderr)
  assert.match(q.stdout, /sin asignar|quit/i)
  const mal = cli('--estado', 'eap', '2', 'Inventado')
  assert.equal(mal.status, 1)
  assert.match(mal.stderr, /estado/)
  assert.equal(cli('--asignarme', 'eap', 'abc').status, 1)
  const metodos = llamadasHechas().map(([m]) => m)
  assert.ok(!metodos.includes('POST'), 'nunca crea')
})
