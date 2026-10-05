// Tests de métricas por sesión desde el .jsonl de la transcripción, la tarea derivada del primer
// prompt y el re-etiquetado de la bitácora. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { metricasJsonl, tareaDePrompt, tareaDeSesion, tipoDeTarea, modeloDistinto, modeloPlanDe } from './metricas_jsonl.mjs'
import { reetiquetar } from './reetiquetar_bitacora.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const L = (o) => JSON.stringify(o)
const uso = (ctx, out = 50) => ({ input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: ctx - 10, output_tokens: out })
const asis = (req, ctx, content, model = 'claude-opus-5-5') => L({ type: 'assistant', requestId: req, message: { model, usage: uso(ctx), content } })
const resultado = (id, content) => L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] } })

// Fixture: /clear (meta), 2 prompts, 3 llamadas (r1 en dos líneas), un resultado de 6000 tokens.
const JSONL = [
  L({ type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>…</local-command-caveat>' } }),
  L({ type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>' } }),
  L({ type: 'user', message: { role: 'user', content: 'Sesión S4b de BACKLOG_H3.md. Lee el Estado y trabaja solo esa sesión.' } }),
  asis('r1', 25000, [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/x/BACKLOG_H3.md' } }]),
  asis('r1', 25000, [{ type: 'text', text: 'leo' }]),
  resultado('t1', 'x'.repeat(24000)),
  asis('r2', 40000, [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } }]),
  resultado('t2', [{ type: 'text', text: 'ok' }]),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'sigue' }] } }),
  asis('r3', 35000, [{ type: 'text', text: 'hecho' }], 'claude-sonnet-5-5'),
  'línea rota que no es JSON',
].join('\n')

test('metricasJsonl: llamadas, prompts, contexto final y máximo, resultados >5k', () => {
  const m = metricasJsonl(JSONL)
  assert.equal(m.llamadas, 3)
  assert.equal(m.prompts, 2)
  assert.equal(m.ctxFinal, 35000)
  assert.equal(m.ctxMax, 40000)
  assert.equal(m.primerPrompt, 'Sesión S4b de BACKLOG_H3.md. Lee el Estado y trabaja solo esa sesión.')
  assert.deepEqual(m.resultadosGrandes, [{ tool: 'Read', tokens: 6000, entrada: L({ file_path: '/x/BACKLOG_H3.md' }) }])
  assert.deepEqual(m.modelos, ['claude-opus-5-5', 'claude-sonnet-5-5'])
})

test('metricasJsonl: texto vacío no rompe', () => {
  assert.deepEqual(metricasJsonl(''), { llamadas: 0, prompts: 0, ctxFinal: 0, ctxMax: 0, resultadosGrandes: [], primerPrompt: null, modelos: [] })
})

test('tareaDePrompt: «Sesión SX de BACKLOG…» → BACKLOG…/SX; sin coincidencia → null', () => {
  assert.equal(tareaDePrompt('Sesión S4b de BACKLOG_H3.md. Lee…'), 'BACKLOG_H3/S4b')
  assert.equal(tareaDePrompt('Sesión S12 de ~/x/BACKLOG_MVP.md (H2)'), 'BACKLOG_MVP/S12')
  assert.equal(tareaDePrompt('Sesión E4 de BACKLOG.md (H16).'), 'BACKLOG/E4')
  assert.equal(tareaDePrompt('Sesión S2c (H3 personas) de BACKLOG_MVP.md. Lee…'), 'BACKLOG_MVP/S2c')
  assert.equal(tareaDePrompt('Sesión H3 personas S1b de BACKLOG_MVP.md. Lee…'), 'BACKLOG_MVP/S1b')
  assert.equal(tareaDePrompt('Sesión 1 de H3 personas. Lee BACKLOG_MVP.md'), null)
  assert.equal(tareaDePrompt('arregla el botón'), null)
  assert.equal(tareaDePrompt(null), null)
})

test('tareaDeSesion: primer prompt manda; si no, session_name', () => {
  assert.equal(tareaDeSesion('Sesión S4b de BACKLOG_H3.md', 'verificacion manual del mod'), 'BACKLOG_H3/S4b')
  assert.equal(tareaDeSesion('hola', 'verificacion manual del mod'), 'verificacion manual del mod')
  assert.equal(tareaDeSesion(null, null), 'sin nombre')
})

test('tipoDeTarea: plan, Sn, Snb, migración, catálogo, cierre, otro', () => {
  assert.equal(tipoDeTarea('BACKLOG_H3/S0'), 'plan')
  assert.equal(tipoDeTarea('BACKLOG_H3/S4'), 'Sn')
  assert.equal(tipoDeTarea('BACKLOG_H3/S4b'), 'Snb')
  assert.equal(tipoDeTarea('auditoría de mcps'), 'plan')
  assert.equal(tipoDeTarea('migración de personas'), 'migración')
  assert.equal(tipoDeTarea('catálogo de tablas'), 'catálogo')
  assert.equal(tipoDeTarea('relevo H3'), 'cierre')
  assert.equal(tipoDeTarea('verificacion manual del mod'), 'otro')
})

const BIT = `# Bitácora

## Registro

| Fecha | Sesión / tarea | Modo | Modelo | Duración | Costo USD | Contexto máx. | Calidad | Seguridad | Notas |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04 02:36 | verificacion manual del mod (aaaa1111) | auto | Opus 5.5 | ~5 min | $1.69 | ctx final 93k 🟢 | _pendiente_ | _pendiente_ | clear |
| 2026-10-04 02:44 | verificacion manual del mod (bbbb2222) | auto | Opus 5.5 | ~5 min | $1.69 | ctx final 93k 🟢 | _pendiente_ | _pendiente_ | clear |
| 2026-10-04 02:50 | migración de personas (cccc3333) | auto | Opus 5.5 | ~5 min | $1.69 | ctx final 93k 🟢 | _pendiente_ | _pendiente_ | clear |
| 2026-10-02 | Revisión de metodología | plan | Opus | ~70 min | ~0,9+ | ~70k 🟢 | — | — | sin sid |
| | | | | | | | | | |
`
const PROMPTS = { aaaa1111: 'Sesión S4b de BACKLOG_H3.md', bbbb2222: 'arregla el botón', cccc3333: 'Sesión S2 de BACKLOG_H3.md' }

test('reetiquetar: cambia la tarea por la del primer prompt y cuenta las que salen de «otro»', () => {
  const r = reetiquetar(BIT, (sid) => PROMPTS[sid] ?? null)
  assert.deepEqual(r.cambios.map((c) => [c.sid, c.antes, c.despues]), [
    ['aaaa1111', 'verificacion manual del mod', 'BACKLOG_H3/S4b'],
    ['cccc3333', 'migración de personas', 'BACKLOG_H3/S2'],
  ])
  assert.equal(r.salenDeOtro, 1)
  assert.match(r.texto, /\| BACKLOG_H3\/S4b \(aaaa1111\) \|/)
  assert.match(r.texto, /\| verificacion manual del mod \(bbbb2222\) \|/)
  assert.equal(r.texto.split('\n').length, BIT.split('\n').length)
})

test('reetiquetar_bitacora --dry-run no escribe; sin --dry-run aplica', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'reetiq-'))
  const trans = join(tmp, 'projects')
  mkdirSync(join(trans, '-Users-x-demo'), { recursive: true })
  for (const [sid, p] of Object.entries(PROMPTS))
    writeFileSync(join(trans, '-Users-x-demo', `${sid}-0000-0000-0000-000000000000.jsonl`), L({ type: 'user', message: { role: 'user', content: p } }) + '\n')
  const bit = join(tmp, 'BITACORA.md')
  writeFileSync(bit, BIT)
  const correr = (...a) => spawnSync('node', [join(DIR, 'reetiquetar_bitacora.mjs'), '--bitacora', bit, '--transcripciones', trans, ...a], { encoding: 'utf8' })
  const seco = correr('--dry-run')
  assert.equal(seco.status, 0, seco.stderr)
  assert.match(seco.stdout, /aaaa1111/)
  assert.match(seco.stdout, /salen de «otro»: 1/)
  assert.equal(readFileSync(bit, 'utf8'), BIT)
  const real = correr()
  assert.equal(real.status, 0, real.stderr)
  assert.match(readFileSync(bit, 'utf8'), /BACKLOG_H3\/S4b \(aaaa1111\)/)
})

test('CLI metricas_jsonl: imprime métricas y tarea', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'metr-'))
  const f = join(tmp, 's.jsonl')
  writeFileSync(f, JSONL)
  const r = spawnSync('node', [join(DIR, 'metricas_jsonl.mjs'), f, '--session-name', 'otra cosa'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  assert.equal(j.tarea, 'BACKLOG_H3/S4b')
  assert.equal(j.llamadas, 3)
  const vacio = spawnSync('node', [join(DIR, 'metricas_jsonl.mjs'), join(tmp, 'no-existe.jsonl'), '--session-name', 'otra cosa'], { encoding: 'utf8' })
  assert.equal(vacio.status, 0)
  assert.equal(JSON.parse(vacio.stdout).tarea, 'otra cosa')
})

test('modeloDistinto: compara familia del plan con model.id / display_name de la foto', () => {
  assert.equal(modeloDistinto('Opus', 'Sonnet 5.5 (medium)'), true)
  assert.equal(modeloDistinto('Sonnet', 'claude-sonnet-5-5'), false)
  assert.equal(modeloDistinto(null, 'claude-opus-5-5'), false)
  assert.equal(modeloDistinto('Opus', '?'), false)
})

test('modeloPlanDe: busca el prompt de la sesión en el backlog de la tarea', () => {
  const backlogs = [
    { archivo: 'BACKLOG.md', estructura: [{ prompts: [], hijas: [{ prompts: [{ clave: 'E4', modelo: 'Opus' }], hijas: [] }] }] },
    { archivo: 'BACKLOG_H3.md', estructura: [{ prompts: [{ clave: 'S4b', modelo: 'Sonnet' }, { clave: 'S5', modelo: null }], hijas: [] }] },
  ]
  assert.equal(modeloPlanDe('BACKLOG/E4', backlogs), 'Opus')
  assert.equal(modeloPlanDe('BACKLOG_H3/S4b', backlogs), 'Sonnet')
  assert.equal(modeloPlanDe('BACKLOG_H3/S5', backlogs), null)
  assert.equal(modeloPlanDe('BACKLOG_H9/S1', backlogs), null)
  assert.equal(modeloPlanDe('verificacion manual del mod', backlogs), null)
})

test('plantilla: la fila de la bitácora pinta el badge «≠ plan» con el modelo del plan', () => {
  const html = readFileSync(join(DIR, 'plantilla.html'), 'utf8')
  assert.match(html, /f\.modeloDistinto/)
  assert.match(html, /≠ plan/)
})
