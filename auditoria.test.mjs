// Tests de la auditoría repetible del gasto (auditoria.mjs). node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { auditarSesion, auditar, porModelo, textoAuditoria, textoModelos, PESOS } from './auditoria.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const L = (o) => JSON.stringify(o)
const TS = '2026-10-04T15:00:00.000Z'
const asis = (req, usage, content = [], ts = TS) => L({ type: 'assistant', timestamp: ts, requestId: req, message: { model: 'claude-opus-5-5', usage, content } })
const uso = (id, name, input) => ({ type: 'tool_use', id, name, input })
const res = (id, content, ts = TS) => L({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] } })
const grande = 'x'.repeat(24000) // 6000 tokens
const medio = 'x'.repeat(12000) // 3000 tokens

// r1 (en dos líneas, usage repetido): entrada 100, escritura 1000, lectura 10000, salida 200.
// r2: Read sin límite de BACKLOG.md (6000), r3: cat completo (3000), r4: sed sobre BACKLOG (3000), r5: Bash acotado, r6: otro día.
const JSONL = [
  L({ type: 'user', timestamp: TS, message: { role: 'user', content: 'hola' } }),
  asis('r1', { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000, output_tokens: 200 }, [uso('a', 'Read', { file_path: '/p/BACKLOG.md' })]),
  asis('r1', { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000, output_tokens: 200 }, [{ type: 'text', text: 'leo' }]),
  res('a', grande),
  asis('r2', { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10 }, [uso('b', 'Read', { file_path: '/p/mod.mjs', limit: 50 }), uso('c', 'Bash', { command: 'cat /p/leeme.txt' }), uso('d', 'Bash', { command: 'sed -n 1,40p BACKLOG.md' }), uso('e', 'Bash', { command: 'cat /p/x | head -5' })]),
  res('b', 'x'.repeat(100)),
  res('c', medio),
  res('d', medio),
  res('e', 'ok'),
  asis('r3', { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 }, [], '2026-10-03T15:00:00.000Z'),
].join('\n')

test('composición del gasto: pesos 1 / 2 / 0,1 / 5 y una sola vez por llamada', () => {
  assert.deepEqual(PESOS, { entrada: 1, escritura: 2, lectura: 0.1, salida: 5 })
  const s = auditarSesion(JSONL, { dia: '2026-10-04' })
  assert.equal(s.llamadas, 2) // r3 es de otro día
  assert.deepEqual(s.gasto, { entrada: 110, escritura: 1000, lectura: 10000, salida: 210 })
  const r = auditar([{ proyecto: 'p', sid: 's1', texto: JSONL }], { dia: '2026-10-04' })
  assert.equal(r.gasto.ponderado, 110 + 2000 + 1000 + 1050)
  assert.equal(r.gasto.partes.lectura.pct, Math.round(1000 / 4160 * 1000) / 10)
})

test('tool results >5k, Bash sobre BACKLOG, cat completos y Read sin límite', () => {
  const r = auditar([{ proyecto: 'p', sid: 's1', texto: JSONL }], { dia: '2026-10-04' })
  assert.equal(r.grandes.length, 1)
  assert.deepEqual([r.grandes[0].tool, r.grandes[0].tokens, r.grandes[0].sid], ['Read', 6000, 's1'])
  assert.deepEqual(r.bashBacklog, { n: 1, tokens: 3000 })
  assert.deepEqual(r.catCompletos, { n: 1, tokens: 3000 })
  assert.deepEqual(r.readSinLimite, { n: 1, tokens: 6000 })
})

test('textoAuditoria imprime las cinco secciones', () => {
  const r = auditar([{ proyecto: 'p', sid: 's1', texto: JSONL }], { dia: '2026-10-04' })
  const t = textoAuditoria(r, '2026-10-04')
  for (const s of ['Composición del gasto', 'Tool results >5k', 'Bash sobre BACKLOG', '`cat` completos', 'Read sin límite']) assert.match(t, new RegExp(s))
})

// Bitácora: Opus hace S1, S2 (con S2b) y S3; Sonnet hace S4 y S5 (sin retrabajo); una fila high y una sin Sn se ignoran.
const fila = (tarea, modelo, costo) => `| 2026-10-04 10:00 | ${tarea} (aaaa${Math.random().toString(16).slice(2, 6)}) | auto | ${modelo} | ~5 min | $${costo} | ctx 10k→50k 🟡 | _pendiente_ | _pendiente_ | clear |`
const BITACORA = ['## Registro', '', '| Fecha | Sesión / tarea | Modo | Modelo | Duración | Costo USD | Contexto máx. | Calidad | Seguridad | Notas |', '|---|---|---|---|---|---|---|---|---|---|',
  fila('BACKLOG_H1/S1', 'Opus 5.5 (medium)', '2.00'), fila('BACKLOG_H1/S2', 'Opus 5.5 (medium)', '3.00'), fila('BACKLOG_H1/S2', 'Opus 5.5 (medium)', '1.00'),
  fila('BACKLOG_H1/S2b', 'Sonnet 5.5 (medium)', '0.50'), fila('BACKLOG_H1/S3', 'Opus 5.5 (medium)', '4.00'),
  fila('BACKLOG_H1/S4', 'Sonnet 5.5 (medium)', '1.00'), fila('BACKLOG_H1/S5', 'Sonnet 5.5 (medium)', '2.00'),
  fila('BACKLOG_H1/S6', 'Fable 5.1 (high)', '9.00'), fila('BACKLOG_H1/S0', 'Opus 5.5 (medium)', '0.70'), ''].join('\n')

test('--modelos: Opus frente a Sonnet en Sn de ejecución con effort medio', () => {
  const m = porModelo(BITACORA)
  assert.deepEqual(m.map((x) => x.modelo), ['opus', 'sonnet'])
  const [o, s] = m
  assert.deepEqual([o.n, o.conRetrabajo, o.tasa], [3, 1, 1 / 3])
  assert.equal(o.costoMediano, 4) // S1 2, S2 3+1, S3 4 → mediana 4
  assert.equal(o.costoMedianoConRetrabajo, 4) // S2 con su S2b: 4,5 → 2,4,4.5 → 4... mediana
  assert.deepEqual([s.n, s.conRetrabajo, s.tasa, s.costoMediano], [2, 0, 0, 1.5])
  const t = textoModelos(m)
  assert.match(t, /opus/i); assert.match(t, /sonnet/i)
})

test('CLI: node generar.mjs --auditoria <fecha> sobre una carpeta de transcripciones simulada', () => {
  const home = mkdtempSync(join(tmpdir(), 'aud-'))
  const dir = join(home, '.claude', 'projects', '-Users-x-Desktop-Desarrollo-demo')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'abcdef1234567890.jsonl'), JSONL)
  const r = spawnSync(process.execPath, [join(DIR, 'generar.mjs'), '--auditoria', '2026-10-04'], { encoding: 'utf8', env: { ...process.env, HOME: home } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Composición del gasto/)
  assert.match(r.stdout, /Read sin límite/)
})

test('Bash sobre BACKLOG: solo el hábito malo; el extractor cuenta aparte (backlogCli)', () => {
  const cmds = [
    "sed -n 1,9p BACKLOG_H7.md", // malo
    "grep -n Estado BACKLOG.md", // malo
    "node ~/x/backlog.mjs seccion S60 BACKLOG.md", // bueno
    "node backlog.mjs arranque S60 BACKLOG.md | grep -n Estado", // bueno aunque encadene grep
    "backlog seccion S60 BACKLOG.md && grep -n x BACKLOG.md", // un segmento malo
    "sed -i 's/a/b/' BACKLOG.md", // escritura, no lectura
    "ls ~/.claude/metodologia/FORMATO_BACKLOG.md", // no lee
  ]
  const lineas = [L({ type: 'user', timestamp: TS, message: { role: 'user', content: 'hola' } })]
  cmds.forEach((c, i) => {
    lineas.push(asis(`q${i}`, { input_tokens: 1, output_tokens: 1 }, [uso(`t${i}`, 'Bash', { command: c })]))
    lineas.push(res(`t${i}`, medio))
  })
  const s = auditarSesion(lineas.join('\n'), { dia: '2026-10-04' })
  assert.deepEqual(s.bashBacklog, { n: 3, tokens: 9000 })
  assert.deepEqual(s.backlogCli, { n: 3, tokens: 9000 })
  const r = auditar([{ proyecto: 'p', sid: 's', texto: lineas.join('\n') }], { dia: '2026-10-04' })
  assert.deepEqual(r.backlogCli, { n: 3, tokens: 9000 })
  assert.match(textoAuditoria(r, '2026-10-04'), /backlog\.mjs|extractor/i)
})
