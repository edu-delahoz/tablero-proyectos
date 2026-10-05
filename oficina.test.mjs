// Oficina de agentes (S57): estado por agente desde el hook de eventos y, de respaldo, las colas .jsonl. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { estadoOficina, accionDe, sesionDe, etiquetaDe, aparienciaDe, distribuirOficina } from './oficina.mjs'

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

// ---------- S-OF1: placa, apariencia y reparto sin solapes ----------
test('sesionDe y etiquetaDe: la placa es la sesión del backlog, si no la rama, si no el título', () => {
  assert.equal(sesionDe(['Modelo: Opus. Sesión S65 de /x/BACKLOG.md (léela…)']), 'S65')
  assert.equal(sesionDe(['hola', 'Sesión S-OF1 de BACKLOG_OFICINA.md']), 'S-OF1')
  assert.equal(sesionDe(['Sesión S57c de BACKLOG.md']), 'S57c')
  assert.equal(sesionDe(['arregla el S3 que falló']), null, 'sin «Sesión SX de» no hay sesión')
  assert.equal(etiquetaDe({ sesion: 'S65', foco: { claves: ['H2', 'S3'] }, rama: 'r', titulo: 't' }), 'S65')
  assert.equal(etiquetaDe({ sesion: null, foco: { claves: ['H2', 'S3', 'S4'] }, rama: 'r', titulo: 't' }), 'S3', 'primera S de las claves')
  assert.equal(etiquetaDe({ sesion: null, foco: { claves: ['H2'] }, rama: 'oficina-pixel', titulo: 't' }), 'oficina-pixel')
  assert.equal(etiquetaDe({ sesion: null, foco: { claves: [] }, rama: null, titulo: 'Arreglar login' }), 'Arreglar login')
  assert.equal(etiquetaDe(null), null)
})

test('aparienciaDe: determinista; el subagente lleva la camiseta de su principal y otro pelo', () => {
  const p = aparienciaDe('sid-uno', 'principal')
  assert.deepEqual(Object.keys(p).sort(), ['camiseta', 'peinado', 'pelo', 'piel'])
  assert.deepEqual(aparienciaDe('sid-uno', 'principal'), p, 'misma entrada, mismo personaje')
  for (const ag of ['a1', 'a2', 'b7', 'xyz']) {
    const s = aparienciaDe('sid-uno', ag)
    assert.equal(s.camiseta, p.camiseta, `${ag}: camiseta del equipo`)
    assert.notEqual(s.pelo, p.pelo, `${ag}: se distingue del principal`)
  }
  const camisetas = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((s) => aparienciaDe(s, 'principal').camiseta))
  assert.ok(camisetas.size >= 4, 'sesiones distintas, camisetas variadas')
})

const ag = (sid, agente, proyecto, accion, desde = '2026-10-05T11:00:00Z') => ({ sid, agente, principal: agente === 'principal', proyecto, accion, desde })
const OCHO = [
  ag('p1', 'principal', 'kanban', 'escribiendo', '2026-10-05T10:00:00Z'), ag('p1', 'a1', 'kanban', 'leyendo'), ag('p1', 'a2', 'kanban', 'leyendo'),
  ag('p2', 'principal', 'kanban', 'ejecutando', '2026-10-05T10:05:00Z'), ag('p2', 'b1', 'kanban', 'escribiendo'),
  ag('p3', 'principal', 'iep', 'quieto', '2026-10-05T10:10:00Z'), ag('p3', 'c1', 'iep', 'buscando'), ag('p3', 'c2', 'iep', 'pensando'),
]
const clave = (a) => `${a.sid}/${a.agente}`
const posiciones = (r) => Object.fromEntries(r.agentes.map((a) => [clave(a), `${a.casilla.sala}:${a.casilla.x},${a.casilla.y}`]))

test('distribuirOficina: una sala por proyecto y cada agente en su casilla, sin compartirla', () => {
  const r = distribuirOficina(OCHO)
  assert.deepEqual(r.salas.map((s) => s.proyecto), ['kanban', 'iep'], 'orden estable por llegada')
  assert.equal(r.agentes.length, 8)
  const pos = Object.values(posiciones(r))
  assert.equal(new Set(pos).size, 8, `sin solapes: ${pos}`)
  for (const a of r.agentes) {
    const sala = r.salas.find((s) => s.id === a.casilla.sala)
    assert.equal(sala.proyecto, a.proyecto, `${clave(a)} en la sala de su proyecto`)
    assert.ok(a.casilla.x >= 0 && a.casilla.x < sala.ancho && a.casilla.y >= 0 && a.casilla.y < sala.alto, `${clave(a)} dentro de la sala`)
  }
  const kanban = r.salas.find((s) => s.proyecto === 'kanban')
  assert.equal(kanban.escritorios.filter((e) => e.sid).length, 2, 'un escritorio por principal')
  const p1 = r.agentes.find((a) => clave(a) === 'p1/principal')
  assert.equal(p1.casilla.zona, 'escritorio', 'escribiendo → en su escritorio')
  assert.equal(r.agentes.find((a) => clave(a) === 'p1/a1').casilla.zona, 'estante', 'leyendo → estante')
  assert.equal(r.agentes.find((a) => clave(a) === 'p2/principal').casilla.zona, 'terminal', 'ejecutando → terminal')
  assert.equal(r.agentes.find((a) => clave(a) === 'p3/principal').casilla.zona, 'sofa', 'quieto → sofá')
  assert.deepEqual(distribuirOficina(OCHO).agentes.map((a) => a.casilla), r.agentes.map((a) => a.casilla), 'determinista')
})

test('distribuirOficina: si uno cambia de acción los demás no se mueven; quien llega no desplaza a nadie', () => {
  const r1 = distribuirOficina(OCHO)
  const antes = posiciones(r1)
  const cambio = OCHO.map((a) => clave(a) === 'p1/a1' ? { ...a, accion: 'ejecutando' } : a)
  const r2 = distribuirOficina(cambio, r1)
  const despues = posiciones(r2)
  for (const k of Object.keys(antes)) if (k !== 'p1/a1') assert.equal(despues[k], antes[k], `${k} no se movió`)
  assert.notEqual(despues['p1/a1'], antes['p1/a1'], 'el que cambió de acción sí se mueve')
  assert.equal(new Set(Object.values(despues)).size, 8)
  const llegan = [...cambio, ag('p4', 'principal', 'kanban', 'leyendo', '2026-10-05T11:30:00Z'), ag('p4', 'd1', 'kanban', 'ejecutando'), ag('p5', 'principal', 'nuevo', 'escribiendo')]
  const r3 = distribuirOficina(llegan, r2)
  const tras = posiciones(r3)
  for (const k of Object.keys(despues)) assert.equal(tras[k], despues[k], `${k} sigue donde estaba`)
  assert.equal(new Set(Object.values(tras)).size, 11, 'sin solapes con los recién llegados')
  assert.deepEqual(r3.salas.map((s) => s.proyecto), ['kanban', 'iep', 'nuevo'], 'la sala nueva va al final')
  // Un principal que se va libera su escritorio sin mover los de los demás.
  const sinP2 = llegan.filter((a) => a.sid !== 'p2')
  const r4 = distribuirOficina(sinP2, r3)
  const esc = (r, sid) => r.salas.find((s) => s.proyecto === 'kanban').escritorios.find((e) => e.sid === sid)
  assert.deepEqual(esc(r4, 'p1'), esc(r3, 'p1'))
  assert.deepEqual(esc(r4, 'p4'), esc(r3, 'p4'))
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
