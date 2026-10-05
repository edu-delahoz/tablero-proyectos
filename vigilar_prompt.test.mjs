// Tests del hook ~/.claude/hooks/vigilar_prompt.mjs (S62): avisa si el prompt de arranque parece de otra sesión. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK = process.env.HOOK_VIGILAR || join(homedir(), '.claude/hooks/vigilar_prompt.mjs')
const BACKLOG_MJS = fileURLToPath(new URL('./backlog.mjs', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'vigilar-'))
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' })

// Proyecto de fixture: BACKLOG con S1 abierta, S2 hecha (todo [x]), S3 con Resultado: y una casilla suelta, S4 abierta.
const proy = join(dir, 'proy')
mkdirSync(proy)
writeFileSync(join(proy, 'BACKLOG.md'), [
  '# Backlog', '', '## Estado', '- nada', '',
  '## H1 — Historia', '',
  '### S1 — Abierta', 'Se espera: algo.', '- [ ] [test] una', '- [ ] [código] dos', '',
  '### S2 — Hecha', '- [x] [test] una', '- [x] [código] dos', '',
  '### S3 — Con resultado', 'Resultado (2026-10-01): hecho.', '- [ ] [docs] suelta', '',
  '### S4 — Otra abierta', '- [ ] [test] una', '',
].join('\n'))
git(proy, 'init', '-q', '-b', 'main')
git(proy, 'add', '.')
git(proy, 'commit', '-q', '-m', 'i')
git(proy, 'branch', 'rama-viva')
const wt = join(dir, '.wt'); mkdirSync(wt)
const fuera = join(dir, 'otro-proyecto'); mkdirSync(fuera)

const AHORA = Date.parse('2026-10-05T12:00:00Z')
const hace = (min) => new Date(AHORA - min * 60e3).toISOString()
function eventos(lista) {
  const f = join(dir, `ev-${Math.random().toString(36).slice(2)}.jsonl`)
  writeFileSync(f, lista.map(e => JSON.stringify({ agente: 'principal', evento: 'PreToolUse', ...e })).join('\n') + '\n')
  return f
}
function transcripcion(prompts) {
  const f = join(dir, `tr-${Math.random().toString(36).slice(2)}.jsonl`)
  writeFileSync(f, prompts.map(p => JSON.stringify({ type: 'user', message: { role: 'user', content: p } })).join('\n') + '\n')
  return f
}

function correr(prompt, { cwd = proy, ev, tr, sid = 'yo' } = {}) {
  const log = join(dir, `log-${Math.random().toString(36).slice(2)}.jsonl`)
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt, transcript_path: tr }),
    encoding: 'utf8',
    env: { ...process.env, VIGILAR_LOG: log, OFICINA_EVENTOS: ev || join(dir, 'no-hay.jsonl'), VIGILAR_AHORA: String(AHORA), VIGILAR_BACKLOG_MJS: BACKLOG_MJS },
  })
  const salida = r.stdout.trim() ? JSON.parse(r.stdout) : null
  const lineas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []
  return { status: r.status, salida, lineas, ctx: salida?.hookSpecificOutput?.additionalContext || '' }
}
const arranque = (sx, extra = '') => `Modelo: Sonnet. Sesión ${sx} de ${join(proy, 'BACKLOG.md')} (léela con \`node ~/.claude/tablero/backlog.mjs arranque ${sx} BACKLOG.md\`)${extra}. Al terminar, ejecuta /relevo.`

function sinAviso(r) {
  assert.equal(r.status, 0)
  assert.equal(r.ctx, '')
  assert.equal(r.salida, null)
}
function conAviso(r, motivo) {
  assert.equal(r.status, 0)
  assert.match(r.ctx, /parece de otra sesión/)
  assert.match(r.ctx, /pregunta al usuario/)
  assert.match(r.ctx, motivo)
  assert.equal(r.salida.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.equal(r.salida.hookSpecificOutput.permissionDecision, undefined) // nunca bloquea
}

test('prompt correcto (sesión abierta, rama existente): sin aviso, y deja su registro', () => {
  const r = correr(arranque('S1', ', en la rama `rama-viva`'))
  sinAviso(r)
  assert.equal(r.lineas.length, 1)
  assert.equal(r.lineas[0].sesion, 'S1')
  assert.deepEqual(r.lineas[0].avisos, [])
  assert.ok(!JSON.stringify(r.lineas[0]).includes('léela'), 'el registro no guarda el texto del prompt')
})

test('prompt que crea la rama («sale de»): rama nueva sin aviso', () => {
  sinAviso(correr(arranque('S4', ', en la rama `rama-nueva` (sale de `main`)')))
})

test('sesión sin casillas abiertas: aviso «ya hecha»', () => {
  conAviso(correr(arranque('S2')), /ya está hecha|ya hecha/)
})

test('sesión con Resultado: aviso «ya hecha» aunque quede una casilla', () => {
  conAviso(correr(arranque('S3')), /Resultado/)
})

test('sesión que no existe en el backlog: aviso', () => {
  conAviso(correr(arranque('S99')), /S99.*no existe|no existe.*S99/)
})

test('otra sesión viva en el worktree del prompt: aviso', () => {
  const ev = eventos([{ sid: 'otra', cwd: wt, t: hace(5) }])
  conAviso(correr(arranque('S1', `, trabaja en el worktree \`${wt}\``), { ev }), /otra sesión.*viva|viva.*otra sesión/)
})

test('otra sesión viva en la misma rama: aviso', () => {
  const rama = join(dir, 'proy-rama'); git(proy, 'worktree', 'add', '-q', rama, 'rama-viva')
  const ev = eventos([{ sid: 'otra', cwd: rama, t: hace(2) }])
  conAviso(correr(arranque('S1', ', en la rama `rama-viva`'), { ev }), /rama-viva/)
})

test('la otra sesión es antigua (> 30 min) o soy yo: sin aviso', () => {
  const vieja = eventos([{ sid: 'otra', cwd: wt, t: hace(45) }])
  sinAviso(correr(arranque('S1', `, trabaja en el worktree \`${wt}\``), { ev: vieja }))
  const mia = eventos([{ sid: 'yo', cwd: wt, t: hace(1) }])
  sinAviso(correr(arranque('S1', `, trabaja en el worktree \`${wt}\``), { ev: mia }))
})

test('otra sesión ya cerrada (SessionEnd, p. ej. /clear en la misma ventana): sin aviso', () => {
  const ev = eventos([
    { sid: 'otra', cwd: wt, t: hace(2) },
    { sid: 'otra', cwd: wt, t: hace(1), evento: 'SessionEnd' },
    { sid: 'otra', agente: 'sub1', cwd: wt, t: hace(1), evento: 'SubagentStop' },
  ])
  sinAviso(correr(arranque('S1', `, trabaja en el worktree \`${wt}\``), { ev }))
})

test('un subagente de otra sesión no cuenta como sesión viva', () => {
  const ev = eventos([{ sid: 'otra', agente: 'sub1', cwd: wt, t: hace(1) }])
  sinAviso(correr(arranque('S1', `, trabaja en el worktree \`${wt}\``), { ev }))
})

test('backlog fuera del cwd: aviso', () => {
  conAviso(correr(arranque('S1'), { cwd: fuera }), /fuera/)
})

test('cwd dentro del worktree del prompt: el backlog no cuenta como fuera', () => {
  sinAviso(correr(arranque('S1', `, trabaja en el worktree \`${wt}\``), { cwd: wt }))
})

test('worktree que no existe: aviso', () => {
  conAviso(correr(arranque('S1', ', worktree `../.no-existe`')), /worktree.*no existe|no existe.*worktree/)
})

test('rama inexistente sin «sale de»: aviso', () => {
  conAviso(correr(arranque('S1', ', en la rama `fantasma`')), /fantasma/)
})

test('cambio de hilo: la transcripción ya trabajaba otra sesión: aviso', () => {
  const tr = transcripcion([arranque('S4'), 'sigue con lo tuyo'])
  conAviso(correr(arranque('S1'), { tr }), /S4/)
})

test('misma sesión repetida en la transcripción: sin aviso', () => {
  const tr = transcripcion([arranque('S1'), 'ok'])
  sinAviso(correr(arranque('S1'), { tr }))
})

test('prompt sin patrón de arranque: sin aviso y sin registro', () => {
  const r = correr('arregla el bug del botón y corre los tests')
  sinAviso(r)
  assert.equal(r.lineas.length, 0)
})

test('entrada rota: sale 0 sin escribir nada', () => {
  const r = spawnSync('node', [HOOK], { input: 'no es json', encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})
