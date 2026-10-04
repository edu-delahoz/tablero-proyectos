// Tests de la bitácora: parser, asociación por transcripciones y edición de una sola fila. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsearBitacora, editarFila, sidsPorProyecto, asociar, escaparCelda, desescaparCelda, celdas, analizarContexto, agregar, semanaISO, normalizarModelo, ramaDeTranscripcion, ErrorBitacora } from './bitacora.mjs'

const BIT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'BITACORA.md'), 'utf8')
const lineasDistintas = (a, b) => { const x = a.split('\n'), y = b.split('\n'); assert.equal(x.length, y.length); return x.flatMap((l, i) => l === y[i] ? [] : [i]) }

test('celdas: escapar y desescapar «|» y «\\» ida y vuelta', () => {
  for (const t of ['a | b', 'ruta\\x', 'nada', 'a \\| b']) assert.equal(desescaparCelda(escaparCelda(t)), t)
  assert.deepEqual(celdas('| a \\| b | c |'), ['a | b', 'c'])
})

test('parsearBitacora: filas del registro con sid, números, contexto y pendientes', () => {
  const b = parsearBitacora(BIT)
  assert.equal(b.registro.length, 6)
  const [vieja, plan, audit, barra, tubo] = b.registro
  assert.equal(vieja.sid, null)
  assert.equal(vieja.calidad, '✅ CI verde (PR #12)')
  assert.deepEqual(vieja.contexto, { ini: null, fin: 210, semaforo: '🔴' })
  assert.equal(vieja.costo, null)
  assert.equal(plan.costo, 0.9)
  assert.equal(plan.minutos, 70)
  assert.equal(audit.sid, 'aaaa1111')
  assert.equal(audit.tarea, 'auditoría de mcps')
  assert.equal(audit.fecha, '2026-10-04 02:36')
  assert.equal(audit.modelo, 'Sonnet 5.5')
  assert.equal(audit.costo, 1.69)
  assert.equal(audit.minutos, 5)
  assert.deepEqual(audit.contexto, { ini: null, fin: 193, semaforo: '🔴' })
  assert.equal(audit.pendiente, true)
  assert.equal(audit.notas, 'other')
  assert.deepEqual(barra.contexto, { ini: 61, fin: 136, semaforo: '🟡' })
  assert.equal(tubo.tarea, 'Plan con tubo a | b')
  assert.equal(tubo.notas, 'usar a | b con cuidado')
  assert.equal(tubo.pendiente, false)
  assert.equal(b.registro.filter((f) => f.pendiente).length, 3)
  assert.deepEqual(analizarContexto('ctx 1k → 2k 🟢'), { ini: 1, fin: 2, semaforo: '🟢' })
})

test('parsearBitacora: resumen semanal, experimentos y lecciones', () => {
  const b = parsearBitacora(BIT)
  assert.equal(b.semanal.columnas[0], 'Semana')
  assert.equal(b.semanal.columnas.length, 8)
  assert.deepEqual(b.semanal.filas.map((f) => f[0]), ['2026-W40'])
  assert.equal(b.experimentos.length, 1)
  assert.match(b.experimentos[0].titulo, /^E1\. Orquestador/)
  assert.match(b.experimentos[0].texto, /\*\*Resultado:\*\* _pendiente_$/)
  assert.deepEqual(b.lecciones.map((l) => l.fecha), ['2026-10-02', '2026-10-04'])
  assert.match(b.lecciones[1].texto, /^Los cambios de plugins/)
  assert.match(b.hash, /^[0-9a-f]{40}$/)
})

test('sidsPorProyecto + asociar: por <sid>.jsonl; el prefijo más largo gana; el resto, sin proyecto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tablero-tr-'))
  const crear = (carpeta, sid) => { mkdirSync(join(dir, carpeta), { recursive: true }); writeFileSync(join(dir, carpeta, `${sid}-0000-0000.jsonl`), '') }
  crear('-Users-x-metodologia-claude', 'aaaa1111')
  crear('-Users-x-metodologia-claude-tablero', 'bbbb2222')
  crear('-Users-x-metodologia-claude-tablero-sub', 'cccc3333')
  crear('-Users-x-otro', 'dddd4444')
  const proyectos = [{ id: 'meto', transcripciones: '-Users-x-metodologia-claude' }, { id: 'tablero', transcripciones: '-Users-x-metodologia-claude-tablero' }, { id: 'sin' }]
  const mapa = sidsPorProyecto(proyectos, dir)
  assert.deepEqual(Object.fromEntries(mapa), { aaaa1111: 'meto', bbbb2222: 'tablero', cccc3333: 'tablero' })
  const b = asociar(parsearBitacora(BIT), mapa)
  assert.deepEqual(b.registro.map((f) => f.proyecto), [null, null, 'meto', 'tablero', 'tablero', null])
  assert.equal(sidsPorProyecto(proyectos, join(dir, 'no-existe')).size, 0)
})

test('editarFila: cambia solo la fila pedida (calidad, seguridad, notas) y escapa «|»', () => {
  const nuevo = editarFila(BIT, { sid: 'bbbb2222', calidad: '🟡', seguridad: 'sin prod', notas: 'medir antes | después' })
  const cambiadas = lineasDistintas(BIT, nuevo)
  assert.equal(cambiadas.length, 1)
  const linea = nuevo.split('\n')[cambiadas[0]]
  assert.equal(linea, '| 2026-10-04 02:44 | Tablero barra de estado (bbbb2222) | auto | Opus 5.5 | ~31 min | $2.05 | ctx 61k→136k 🟡 | 🟡 | sin prod | medir antes \\| después |')
  const f = parsearBitacora(nuevo).registro.find((x) => x.sid === 'bbbb2222')
  assert.deepEqual([f.calidad, f.seguridad, f.notas, f.pendiente], ['🟡', 'sin prod', 'medir antes | después', false])
  // Ya no casa con el patrón con el que el hook reescribe filas pendientes.
  assert.ok(!/_pendiente_ \| _pendiente_/.test(linea))
})

test('editarFila: notas vacías conservan las del hook; la fila con «\\|» se reescribe sin romper otras celdas', () => {
  const a = editarFila(BIT, { sid: 'aaaa1111', calidad: '✅ CI verde', seguridad: 'no tocó prod', notas: '  ' })
  assert.match(a.split('\n')[lineasDistintas(BIT, a)[0]], /\| ✅ CI verde \| no tocó prod \| other \|$/)
  const t = editarFila(BIT, { sid: 'cccc3333', calidad: '✅', seguridad: 'sin prod' })
  assert.equal(t.split('\n')[lineasDistintas(BIT, t)[0]], '| 2026-10-04 03:19 | Plan con tubo a \\| b (cccc3333) | auto | Sonnet 5.5 | ~2 min | $0.41 | ctx 42k→73k 🟢 | ✅ | sin prod | usar a \\| b con cuidado |')
})

test('editarFila: valida valores y sesiones', () => {
  const mal = (e, estado, re) => assert.throws(() => editarFila(BIT, e), (x) => x instanceof ErrorBitacora && x.estado === estado && re.test(x.message))
  const ok = { sid: 'aaaa1111', calidad: '✅', seguridad: 'sin prod' }
  mal({ ...ok, sid: 'AAAA' }, 400, /id corto/)
  mal({ ...ok, calidad: 'bien' }, 400, /calidad/)
  mal({ ...ok, calidad: '_pendiente_' }, 400, /calidad/)
  mal({ ...ok, seguridad: '' }, 400, /seguridad/)
  mal({ ...ok, notas: 'dos\nlíneas' }, 400, /saltos de línea/)
  mal({ ...ok, seguridad: 3 }, 400, /texto/)
  mal({ ...ok, sid: 'eeee5555' }, 404, /No hay una fila/)
  const doble = BIT.replace('| | | | | | | | | | |', '| 2026-10-05 | Repetida (aaaa1111) | auto | Opus | ~1 min | $0.1 | ctx 1k→2k 🟢 | _pendiente_ | _pendiente_ | clear |\n| | | | | | | | | | |')
  assert.throws(() => editarFila(doble, ok), (x) => x.estado === 409)
})

test('rama por sesión: primer gitBranch no vacío en las primeras líneas; sin rama → null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tablero-tr-'))
  const crear = (carpeta, sid, lineas) => { mkdirSync(join(dir, carpeta), { recursive: true }); writeFileSync(join(dir, carpeta, `${sid}-0000.jsonl`), lineas.join('\n')) }
  crear('-Users-x-t', 'bbbb2222', ['{"type":"summary"}', '{"gitBranch":"","type":"user"}', '{"type":"user","gitBranch":"notas-tablero"}', '{"gitBranch":"otra"}'])
  crear('-Users-x-t', 'cccc3333', ['{"type":"user"}'])
  crear('-Users-x-t', 'dddd4444', ['{"gitBranch":"main"}'])
  const rutas = new Map()
  const mapa = sidsPorProyecto([{ id: 't', transcripciones: '-Users-x-t' }], dir, rutas)
  const b = asociar(parsearBitacora(BIT), mapa, rutas)
  assert.deepEqual(b.registro.map((f) => f.rama), [null, null, null, 'notas-tablero', null, 'main'])
  assert.equal(ramaDeTranscripcion(join(dir, 'no-existe.jsonl')), null)
  assert.equal(ramaDeTranscripcion(rutas.get('bbbb2222')), 'notas-tablero')
})

test('semanaISO y normalizarModelo', () => {
  assert.equal(semanaISO('2026-10-04'), '2026-W40')
  assert.equal(semanaISO('2026-01-01'), '2026-W01')
  assert.equal(semanaISO('2027-01-01'), '2026-W53')
  assert.equal(semanaISO('2024-12-30'), '2025-W01')
  assert.equal(normalizarModelo('Opus 5.5'), 'Opus')
  assert.equal(normalizarModelo('Sonnet 5.5'), 'Sonnet')
  assert.equal(normalizarModelo('Haiku 4.5'), 'Haiku')
  assert.equal(normalizarModelo('Opus'), 'Opus')
  assert.equal(normalizarModelo('?'), '?')
  assert.equal(normalizarModelo(''), null)
})

test('agregar: por día/semana/mes/rama/modelo; excluye costos «?» y fechas incompletas y los cuenta', () => {
  const reg = parsearBitacora(BIT).registro.map((f, i) => ({ ...f, rama: [null, null, 'a', 'b', 'a', null][i] }))
  const dia = agregar(reg, { por: 'dia' })
  assert.deepEqual(dia.grupos, [
    { clave: '2026-10-02', costo: 0.9, minutos: 70, sesiones: 1 },
    { clave: '2026-10-04', costo: 5.43, minutos: 41, sesiones: 4 },
  ])
  assert.equal(dia.excluidas, 1) // «2026-10-0?» y costo «?»
  assert.deepEqual(agregar(reg, { por: 'semana' }).grupos.map((g) => [g.clave, g.costo, g.sesiones]), [['2026-W40', 6.33, 5]])
  assert.deepEqual(agregar(reg, { por: 'mes' }).grupos.map((g) => [g.clave, g.sesiones]), [['2026-10', 5]])
  const rama = agregar(reg, { por: 'rama' })
  assert.deepEqual(rama.grupos.map((g) => [g.clave, g.costo, g.sesiones]), [['a', 2.1, 2], ['b', 2.05, 1]])
  assert.equal(rama.excluidas, 3)
  assert.deepEqual(agregar(reg, { por: 'modelo' }).grupos.map((g) => [g.clave, g.costo, g.sesiones]), [['Opus', 4.23, 3], ['Sonnet', 2.1, 2]])
  assert.throws(() => agregar(reg, { por: 'x' }))
})
