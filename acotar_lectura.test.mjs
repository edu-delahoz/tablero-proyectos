// Tests del hook ~/.claude/hooks/acotar_lectura.mjs (E2). node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const HOOK = process.env.HOOK_ACOTAR || join(homedir(), '.claude/hooks/acotar_lectura.mjs')
const dir = mkdtempSync(join(tmpdir(), 'acotar-'))
const grande = join(dir, 'grande.md')
writeFileSync(grande, '# t\n' + 'linea de relleno de texto\n'.repeat(600)) // ~15 KB ≈ 3.9k tokens
const chico = join(dir, 'chico.md')
writeFileSync(chico, 'poco\n')
mkdirSync(join(dir, 'tool-results'))
const resultado = join(dir, 'tool-results', 'abc.txt')
writeFileSync(resultado, 'x'.repeat(20000))

function correr(entrada, modo = 'aviso') {
  const log = join(dir, `log-${Math.random().toString(36).slice(2)}.jsonl`)
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: 's1', cwd: dir, hook_event_name: 'PreToolUse', ...entrada }),
    encoding: 'utf8',
    env: { ...process.env, MODO: modo, ACOTAR_LOG: log },
  })
  const salida = r.stdout.trim() ? JSON.parse(r.stdout) : null
  const lineas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []
  return { status: r.status, salida, lineas, ctx: salida?.hookSpecificOutput?.additionalContext || '' }
}
const leer = (file_path, extra = {}) => ({ tool_name: 'Read', tool_input: { file_path, ...extra } })
const bash = command => ({ tool_name: 'Bash', tool_input: { command } })

test('Read grande sin limit: aviso con sugerencia, log y sin bloqueo', () => {
  const r = correr(leer(grande))
  assert.equal(r.status, 0)
  assert.match(r.ctx, /grep -n '\^#'/)
  assert.equal(r.salida.hookSpecificOutput.permissionDecision, undefined)
  assert.equal(r.lineas.length, 1)
  assert.equal(r.lineas[0].tool, 'Read')
  assert.equal(r.lineas[0].archivo, grande)
  assert.equal(r.lineas[0].lineas, 601)
  assert.ok(r.lineas[0].tokens > 3000)
  assert.equal(r.lineas[0].habriaBloqueado, true)
  assert.equal(r.lineas[0].sid, 's1')
})

test('Read de tool-results sin limit: aviso', () => {
  const r = correr(leer(resultado))
  assert.match(r.ctx, /limit|offset|grep/)
  assert.equal(r.lineas.length, 1)
})

test('Read con offset/limit: pasa sin log', () => {
  for (const extra of [{ limit: 50 }, { offset: 10, limit: 50 }]) {
    const r = correr(leer(grande, extra))
    assert.equal(r.salida, null)
    assert.equal(r.lineas.length, 0)
  }
})

test('Read de archivo chico o inexistente: pasa', () => {
  assert.equal(correr(leer(chico)).salida, null)
  assert.equal(correr(leer(join(dir, 'no-existe.md'))).salida, null)
})

test('cat <ruta> grande por Bash: avisa midiendo la ruta (relativa y con ~ también)', () => {
  const r = correr(bash(`cat ${grande}`))
  assert.match(r.ctx, /grep -n/)
  assert.equal(r.lineas[0].tool, 'Bash')
  assert.equal(r.lineas[0].lineas, 601)
  assert.equal(correr(bash('cat grande.md')).lineas.length, 1) // relativa al cwd
})

test('cat de archivo chico, cat en tubería o ruta no resoluble: pasa', () => {
  assert.equal(correr(bash(`cat ${chico}`)).salida, null)
  assert.equal(correr(bash(`cat ${grande} | grep linea`)).salida, null)
  assert.equal(correr(bash(`cat ${join(dir, 'no-existe.md')}`)).salida, null)
  assert.equal(correr(bash('cat "$X"')).salida, null)
  assert.equal(correr(bash('echo cat grande.md')).salida, null)
})

test('MODO=bloqueo: el Read grande se bloquea y habriaBloqueado queda en el log', () => {
  const r = correr(leer(grande), 'bloqueo')
  assert.equal(r.salida.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(r.salida.hookSpecificOutput.permissionDecisionReason, /grep -n/)
  assert.equal(r.lineas[0].habriaBloqueado, true)
})

test('PostToolUse Bash con salida ≥2k tokens: aviso; menor: nada', () => {
  const post = out => ({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls -R' }, tool_response: { stdout: out, stderr: '' } })
  assert.match(correr(post('y'.repeat(9000))).ctx, /tokens|acota|head|tail|grep/i)
  assert.equal(correr(post('corto')).salida, null)
})

test('entrada vacía o rota: sale 0 sin ruido', () => {
  const r = spawnSync('node', [HOOK], { input: 'no es json', encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '')
})
