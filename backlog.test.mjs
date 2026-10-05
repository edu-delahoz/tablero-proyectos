// Tests del extractor de backlog: sección con nº de línea y marcado de una casilla. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { seccion, marcar } from './backlog.mjs'

const BIN = join(dirname(fileURLToPath(import.meta.url)), 'backlog.mjs')
const MD = `# Backlog

## Estado
- algo

## H1 — Hito
### S4b — continuación
- [ ] primera
  - [ ] sub
- [x] segunda
- [ ] tercera

### S5 — otra
- [ ] ajena

### E1 — Extractor
- [ ] uno
`
const lineas = MD.split('\n')

test('seccion: solo esa sección, con nº de línea', () => {
  const r = seccion(MD, 'S4b')
  assert.equal(r.linea, 7)
  assert.match(r.texto, /^### S4b/)
  assert.match(r.texto, /tercera/)
  assert.doesNotMatch(r.texto, /ajena|## Estado/)
  assert.equal(seccion(MD, 'E1').linea, 16)
})

test('seccion: inexistente → null', () => assert.equal(seccion(MD, 'S99'), null))

test('marcar: cambia solo esa casilla y deja el resto intacto', () => {
  const r = marcar(MD, 'S4b', 4)
  assert.equal(r.linea, 11)
  const sal = r.texto.split('\n')
  assert.equal(sal[10], '- [x] tercera')
  sal[10] = lineas[10]
  assert.deepEqual(sal, lineas)
  assert.equal(marcar(MD, 'S4b', 1).texto.split('\n')[7], '- [x] primera')
})

test('marcar: casilla inexistente → null', () => assert.equal(marcar(MD, 'S4b', 9), null))

test('CLI: seccion y marcar; inexistente → código 1', () => {
  const d = mkdtempSync(join(tmpdir(), 'bk-')), f = join(d, 'BACKLOG.md')
  writeFileSync(f, MD)
  const run = (...a) => spawnSync(process.execPath, [BIN, ...a], { encoding: 'utf8' })
  assert.equal(run('seccion', 'S4b', f).status, 0)
  assert.match(run('seccion', 'S4b', f).stdout, /tercera/)
  assert.equal(run('seccion', 'S99', f).status, 1)
  assert.equal(run('marcar', 'S4b', '2', f).status, 0)
  assert.equal(readFileSync(f, 'utf8').split('\n')[8], '  - [x] sub')
  assert.equal(run('marcar', 'S4b', '4', f).status, 0)
  assert.equal(readFileSync(f, 'utf8').split('\n')[10], '- [x] tercera')
  assert.equal(run('marcar', 'S4b', '9', f).status, 1)
  assert.equal(run('marcar', 'S99', '1', f).status, 1)
})

test('seccion: claves generales (E5b, S-CI1b) y sub-sesiones «####» dentro de su sesión (S45)', () => {
  const md = `# Backlog

## H16 — Eficiencia
### E5b — Costo por feature (Opus; sigue a E5)
- [ ] una
#### E5c — Auditoría · **Sonnet**
- [ ] dos

## CI — optimización (S-CI1) — ✅ CERRADA
### S-CI1b — verificación post-merge (Sonnet, ~10k; plugins/MCP: ninguno)
- [x] mergear
### S-CI2 — higiene
- [ ] fijar SHA
`
  const e5b = seccion(md, 'E5b')
  assert.equal(e5b.linea, 4)
  assert.match(e5b.texto, /#### E5c[\s\S]*- \[ \] dos/)
  assert.equal(seccion(md, 'E5c').texto, '#### E5c — Auditoría · **Sonnet**\n- [ ] dos')
  assert.equal(seccion(md, 'S-CI1b').texto, '### S-CI1b — verificación post-merge (Sonnet, ~10k; plugins/MCP: ninguno)\n- [x] mergear')
  assert.equal(seccion(md, 'S-CI1'), null)
  assert.equal(marcar(md, 'E5b', 2).linea, 7)
})
