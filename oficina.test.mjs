// Oficina de agentes (S57): estado por agente desde el hook de eventos y, de respaldo, las colas .jsonl. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { estadoOficina, accionDe } from './oficina.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FIX = join(AQUI, 'fixtures', 'eventos')
const leerJsonl = (f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const EVENTOS = leerJsonl(join(FIX, 'eventos.jsonl'))
const AHORA = Date.parse('2026-10-05T12:00:00Z')
const de = (r, sid, agente) => r.agentes.find((a) => a.sid === sid && a.agente === agente)

test('accionDe: cada herramienta cae en una acción de la oficina', () => {
  assert.equal(accionDe('Read'), 'leyendo')
  for (const h of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.equal(accionDe(h), 'escribiendo', h)
  assert.equal(accionDe('Bash'), 'ejecutando')
  for (const h of ['Grep', 'Glob', 'WebSearch', 'WebFetch']) assert.equal(accionDe(h), 'buscando', h)
  assert.equal(accionDe('Agent'), 'pensando')
  assert.equal(accionDe('mcp__algo__raro'), 'pensando')
})

test('estadoOficina: principal y subagente con su acción, archivo y tipo', () => {
  const r = estadoOficina(EVENTOS, [], AHORA)
  const p = de(r, 's1', 'principal')
  assert.equal(p.principal, true)
  assert.equal(p.accion, 'escribiendo', 'Edit → escribiendo')
  assert.equal(p.herramienta, 'Edit')
  assert.equal(p.archivo, 'generar.mjs')
  assert.equal(p.cwd, '/Users/x/demo')
  assert.equal(p.fuente, 'hook')
  assert.equal(p.desde, '2026-10-05T11:58:30Z')
  const b = de(r, 's1', 'a1')
  assert.equal(b.principal, false)
  assert.equal(b.tipo, 'buscador')
  assert.equal(b.accion, 'leyendo', 'Read → leyendo')
  assert.equal(b.archivo, 'oficina.mjs')
})

test('estadoOficina: SubagentStop saca al subagente; permiso → esperando; Stop → quieto; SessionEnd y lo viejo salen', () => {
  const r = estadoOficina(EVENTOS, [], AHORA)
  assert.equal(de(r, 's1', 'a2'), undefined, 'SubagentStop → sale por la puerta')
  const s2 = de(r, 's2', 'principal')
  assert.equal(s2.accion, 'esperando', 'PermissionRequest → esperando')
  assert.equal(s2.herramienta, 'Bash', 'espera aprobación para la herramienta en curso')
  // Permiso real medido (S57c): lo pide el subagente (PermissionRequest con su agente) y el Notification llega como «principal».
  assert.equal(de(r, 's10', 'a7').accion, 'esperando', 'el subagente es quien espera')
  assert.equal(de(r, 's10', 'principal').accion, 'pensando', 'el Notification de permiso no marca al principal')
  assert.equal(de(r, 's3', 'principal').accion, 'quieto', 'Stop → quieto')
  assert.equal(de(r, 's4', 'principal'), undefined, 'SessionEnd → sale')
  assert.equal(de(r, 's5', 'principal'), undefined, 'sin avisos hace 2 h → fuera')
  assert.equal(de(r, 's6', 'a3'), undefined, 'subagente callado 20 min sin SubagentStop → fuera')
  assert.equal(de(r, 's6', 'principal').accion, 'pensando', 'PostToolUse → pensando')
  // Orden estable: por sesión, el principal primero.
  const s1 = r.agentes.filter((a) => a.sid === 's1').map((a) => a.agente)
  assert.deepEqual(s1, ['principal', 'a1'])
})

test('estadoOficina: respaldo con colas .jsonl cuando la sesión no tiene avisos del hook', () => {
  const ms = (t) => Date.parse(`2026-10-05T${t}Z`)
  const usa = (name, input = {}) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `u-${name}`, name, input }] } })
  const resultado = (id) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x' }] } })
  const texto = { type: 'assistant', message: { content: [{ type: 'text', text: 'listo' }], stop_reason: 'end_turn' } }
  const colas = [
    { sid: 's7', agente: 'principal', tipo: null, cwd: '/Users/x/kanban', mtime: ms('11:59:50'), lineas: [usa('Read', { file_path: '/a/b.md' }), resultado('u-Read'), usa('Bash', { command: 'ls' })] },
    { sid: 's7', agente: 'b1', tipo: 'buscador', cwd: '/Users/x/kanban', mtime: ms('11:59:40'), lineas: [usa('Grep'), resultado('u-Grep'), texto] },
    { sid: 's7', agente: 'b2', tipo: 'general-purpose', cwd: '/Users/x/kanban', mtime: ms('11:59:45'), lineas: [usa('Read', { file_path: '/a/c.mjs' })] },
    { sid: 's8', agente: 'principal', tipo: null, cwd: '/Users/x/kanban', mtime: ms('11:59:00'), lineas: [usa('Edit', { file_path: '/a/d.mjs' }), resultado('u-Edit')] },
    { sid: 's9', agente: 'principal', tipo: null, cwd: '/Users/x/kanban', mtime: ms('11:59:00'), lineas: [texto] },
    // s1 tiene avisos del hook: su cola se ignora.
    { sid: 's1', agente: 'principal', tipo: null, cwd: '/Users/x/demo', mtime: ms('11:59:59'), lineas: [usa('Bash')] },
  ]
  const r = estadoOficina(EVENTOS, colas, AHORA)
  const p = de(r, 's7', 'principal')
  assert.equal(p.accion, 'ejecutando', 'tool_use sin resultado → la herramienta en curso')
  assert.equal(p.fuente, 'transcripcion')
  assert.equal(de(r, 's7', 'b1'), undefined, 'subagente que terminó su turno → fuera')
  const b2 = de(r, 's7', 'b2')
  assert.equal(b2.accion, 'leyendo')
  assert.equal(b2.archivo, 'c.mjs', 'solo el nombre, nunca la ruta')
  assert.equal(de(r, 's8', 'principal').accion, 'pensando', 'último es un resultado → pensando')
  assert.equal(de(r, 's9', 'principal').accion, 'quieto', 'terminó su turno → quieto')
  assert.equal(de(r, 's1', 'principal').fuente, 'hook')
  assert.equal(de(r, 's1', 'principal').accion, 'escribiendo')
})

// ---------- Hook: claude/hooks/eventos_agentes.mjs del repo metodologia-claude-code ----------
const HOOK = process.env.HOOK_EVENTOS
  || [join(homedir(), '.claude/hooks/eventos_agentes.mjs'), join(AQUI, '../../metodologia-claude-code/claude/hooks/eventos_agentes.mjs')].find(existsSync)
  || join(AQUI, '../../metodologia-claude-code/claude/hooks/eventos_agentes.mjs')
const PERMITIDOS = ['t', 'sid', 'agente', 'tipo', 'evento', 'herramienta', 'archivo', 'cwd']

function correrHook(payloads, salida) {
  for (const p of payloads) {
    const r = spawnSync('node', [HOOK], { input: JSON.stringify(p), encoding: 'utf8', env: { ...process.env, OFICINA_EVENTOS: salida } })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', 'el hook no habla con Claude')
  }
  return existsSync(salida) ? leerJsonl(salida) : []
}

test('hook de eventos: una línea por aviso, solo campos permitidos y sin prompts ni contenido', () => {
  const salida = join(mkdtempSync(join(tmpdir(), 'oficina-')), 'sub', 'eventos.jsonl')
  const payloads = leerJsonl(join(FIX, 'payloads.jsonl'))
  const lineas = correrHook(payloads, salida)
  assert.equal(lineas.length, payloads.length)
  for (const l of lineas) {
    for (const k of Object.keys(l)) assert.ok(PERMITIDOS.includes(k), `campo no permitido: ${k}`)
    for (const v of Object.values(l)) assert.ok(v === null || typeof v === 'string', 'solo textos cortos')
    assert.ok(!JSON.stringify(l).includes('SECRETO'), `se coló contenido: ${JSON.stringify(l)}`)
    assert.ok(!Number.isNaN(Date.parse(l.t)))
  }
  const [prompt, leer, bash, editar] = lineas
  assert.deepEqual({ ...prompt, t: 0 }, { t: 0, sid: 'sp', agente: 'principal', tipo: null, evento: 'UserPromptSubmit', herramienta: null, archivo: null, cwd: '/Users/x/demo' })
  assert.equal(leer.archivo, 'notas.md', 'solo el nombre, nunca la carpeta')
  assert.equal(bash.herramienta, 'Bash')
  assert.equal(bash.archivo, null, 'de Bash no se guarda el comando')
  assert.equal(editar.archivo, 'a.mjs', 'solo basename')
  assert.equal(lineas[6].evento, 'Notification:permission_prompt')
  assert.deepEqual([lineas[7].agente, lineas[7].tipo, lineas[7].evento], ['a9', 'buscador', 'SubagentStart'])
  assert.equal(lineas[9].evento, 'SubagentStop')
  // Lo que escribe el hook lo entiende estadoOficina.
  const r = estadoOficina(lineas, [], Date.parse(lineas.at(-1).t) + 1000)
  assert.deepEqual(r.agentes.map((a) => [a.agente, a.accion]), [['principal', 'quieto']])
})

test('hook de eventos: rota a 2000 líneas y nunca falla con entrada rota', () => {
  const salida = join(mkdtempSync(join(tmpdir(), 'oficina-')), 'eventos.jsonl')
  const vieja = JSON.stringify({ t: '2026-10-05T00:00:00Z', sid: 'v', agente: 'principal', tipo: null, evento: 'PreToolUse', herramienta: 'Read', archivo: 'x'.repeat(150), cwd: '/x' })
  writeFileSync(salida, (vieja + '\n').repeat(2500))
  const lineas = correrHook([{ session_id: 'nuevo', cwd: '/x', hook_event_name: 'Stop' }], salida)
  assert.equal(lineas.length, 2000)
  assert.equal(lineas.at(-1).sid, 'nuevo')
  const r = spawnSync('node', [HOOK], { input: 'no es json', encoding: 'utf8', env: { ...process.env, OFICINA_EVENTOS: salida } })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})
