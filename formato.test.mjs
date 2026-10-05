// Contrato del formato de backlog (H17, `metodologia-claude-code/metodologia/FORMATO_BACKLOG.md`). node --test
// Recorre `fixtures/formato/*.md`: cada ejemplo trae su `.esperado.json` con las sesiones que `sesiones(texto)`
// de `generar.mjs` debe devolver. Un ejemplo nuevo queda cubierto solo con añadir el par .md + .esperado.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as G from './generar.mjs'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'formato')
const EJEMPLOS = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()
const CAMPOS = ['titulo', 'modelo', 'rama', 'seEspera', 'resultado', 'prompt', 'hechas', 'total', 'subsesiones', 'despues', 'tareas']

test('formato: hay un ejemplo canónico y uno por cada formato legado', () => {
  assert.ok(EJEMPLOS.includes('canonico.md'))
  assert.ok(EJEMPLOS.filter((f) => f.startsWith('legado-')).length >= 3)
  for (const f of EJEMPLOS) assert.ok(existsSync(join(DIR, f.replace(/\.md$/, '.esperado.json'))), `${f} sin .esperado.json`)
})

for (const f of EJEMPLOS) {
  const texto = readFileSync(join(DIR, f), 'utf8')
  const { sesiones: esperadas } = JSON.parse(readFileSync(join(DIR, f.replace(/\.md$/, '.esperado.json')), 'utf8'))
  const leer = () => {
    assert.equal(typeof G.sesiones, 'function', 'generar.mjs debe exportar sesiones(texto)')
    return G.sesiones(texto)
  }

  test(`formato ${f}: encuentra todas las claves`, () => {
    const claves = leer().map((s) => s.clave)
    for (const e of esperadas) assert.ok(claves.includes(e.clave), `falta ${e.clave} (hay: ${claves.join(', ')})`)
  })

  for (const e of esperadas) {
    for (const campo of CAMPOS) {
      test(`formato ${f} · ${e.clave} · ${campo}`, () => {
        const s = leer().find((x) => x.clave === e.clave)
        assert.ok(s, `no hay sesión ${e.clave}`)
        const real = campo === 'tareas'
          ? (s.tareas ?? []).map(({ hecha, tipo = null, llano = null, tecnico = null }) => ({ hecha, tipo, llano, tecnico }))
          : s[campo] ?? null
        assert.deepEqual(real, e[campo])
      })
    }
  }
}
