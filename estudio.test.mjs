// Estudio de un plan con un Claude de solo lectura (S55): argumentos, prompt, acciones, eventos y guía. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { argsEstudio, promptEstudio, preguntaDe, ACCIONES, eventoDe, lanzarEstudio, anadirAGuia, rutaGuia, sesionValida, HERRAMIENTAS } from './estudio.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FALSO = join(AQUI, 'fixtures', 'claude-falso.mjs')
const tras = (args, bandera) => args[args.indexOf(bandera) + 1]

test('argsEstudio: -p con stream-json, solo lectura y sin herramientas de escritura', () => {
  const a = argsEstudio({ plan: '/repo/docs/PLAN.md', cwd: '/repo' })
  assert.ok(a.includes('-p'))
  assert.equal(tras(a, '--output-format'), 'stream-json')
  assert.ok(a.includes('--verbose'), 'stream-json con -p exige --verbose')
  assert.ok(a.includes('--include-partial-messages'), 'el texto llega mientras se escribe')
  const i = a.indexOf('--allowedTools'), permitidas = a.slice(i + 1, a.findIndex((x, k) => k > i && x.startsWith('--')))
  assert.deepEqual(permitidas, ['Read', 'Grep', 'Glob', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git diff:*)'])
  assert.deepEqual(HERRAMIENTAS, permitidas)
  const j = a.indexOf('--disallowedTools'), prohibidas = a.slice(j + 1, j + 4)
  assert.deepEqual(prohibidas, ['Edit', 'Write', 'NotebookEdit'])
  assert.match(tras(a, '--append-system-prompt'), /no propongas mejoras/i)
  assert.equal(tras(a, '--settings'), '{"disableAllHooks":true}', 'sin los hooks del usuario')
  assert.ok(!a.includes('--resume'), 'sin sesión no reanuda')
  assert.ok(!a.includes('--add-dir'), 'plan dentro del repo: no hace falta otra carpeta')
  assert.ok(!a.some((x) => x.includes('PLAN.md')), 'el prompt va por stdin, no en los argumentos')
})

test('argsEstudio: --resume con la sesión y --add-dir si el plan está fuera del repo', () => {
  const a = argsEstudio({ plan: '/home/u/.claude/plans/plan-x.md', cwd: '/repo', sesionId: 'abc-123' })
  assert.equal(tras(a, '--resume'), 'abc-123')
  assert.equal(tras(a, '--add-dir'), '/home/u/.claude/plans')
  assert.ok(sesionValida('abc-123') && !sesionValida('--x') && !sesionValida('a b') && !sesionValida(''))
})

test('promptEstudio: la primera vez nombra el plan; al seguir la conversación, solo la pregunta', () => {
  assert.match(promptEstudio({ plan: '/r/PLAN.md', pregunta: '¿Qué hace S2?' }), /\/r\/PLAN\.md[\s\S]*¿Qué hace S2\?/)
  assert.equal(promptEstudio({ plan: '/r/PLAN.md', pregunta: '¿Y S3?', sesionId: 'abc' }), '¿Y S3?')
})

test('acciones rápidas: técnico, qué se le pide a Claude, sesión X y cómo quedó (git de la rama)', () => {
  assert.deepEqual(Object.keys(ACCIONES), ['tecnico', 'pedidos', 'sesion', 'quedo'])
  for (const a of Object.values(ACCIONES)) assert.equal(typeof a.etiqueta, 'string')
  assert.match(preguntaDe({ accion: 'tecnico' }), /técnic/i)
  assert.match(preguntaDe({ accion: 'pedidos' }), /pide a Claude/i)
  assert.match(preguntaDe({ accion: 'sesion', sesion: 'S3b' }), /S3b/)
  assert.equal(preguntaDe({ accion: 'sesion' }), null, 'la sesión X necesita la clave')
  assert.equal(preguntaDe({ accion: 'sesion', sesion: 'S1; rm -rf' }), null)
  assert.match(preguntaDe({ accion: 'quedo', rama: 'h7-s1' }), /git (log|diff)[\s\S]*h7-s1/)
  assert.match(preguntaDe({ accion: 'quedo' }), /Resultado/)
  assert.equal(preguntaDe({ pregunta: '  ¿por qué?  ' }), '¿por qué?')
  assert.equal(preguntaDe({ pregunta: '' }), null)
  assert.equal(preguntaDe({ accion: 'inventada' }), null)
})

test('eventoDe: traduce stream-json a eventos propios e ignora lo demás', () => {
  assert.deepEqual(eventoDe('{"type":"system","subtype":"init","session_id":"s1"}'), { tipo: 'sesion', sesionId: 's1' })
  assert.deepEqual(eventoDe(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ho' } } })), { tipo: 'texto', texto: 'ho' })
  assert.deepEqual(eventoDe(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/a.md' } }] } })), { tipo: 'herramienta', nombre: 'Read', detalle: '/x/a.md' })
  assert.equal(eventoDe(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'dup' }] } })), null, 'el texto completo ya llegó en trozos')
  assert.deepEqual(eventoDe('{"type":"result","subtype":"success","session_id":"s1","is_error":false,"result":"todo"}'), { tipo: 'fin', sesionId: 's1', texto: 'todo', error: false })
  assert.equal(eventoDe('no es json'), null)
  assert.equal(eventoDe(''), null)
})

test('lanzarEstudio: con el claude falso emite sesión, texto, herramienta y fin; detener() lo corta', async () => {
  const eventos = []
  const r = await lanzarEstudio({ bin: FALSO, args: ['-p'], entrada: 'hola', cwd: AQUI, ms: 5000, alEvento: (e) => eventos.push(e) }).hecho
  assert.equal(r.porTiempo, false)
  assert.deepEqual(eventos.map((e) => e.tipo), ['sesion', 'texto', 'texto', 'herramienta', 'fin'])
  assert.equal(eventos.filter((e) => e.tipo === 'texto').map((e) => e.texto).join(''), 'Hola, este plan…')
  const t0 = Date.now()
  const colgado = await lanzarEstudio({ bin: FALSO, args: ['-p'], entrada: 'colgar', cwd: AQUI, ms: 300, alEvento: () => {} }).hecho
  assert.equal(colgado.porTiempo, true)
  assert.ok(Date.now() - t0 < 3000)
})

test('guía: ruta en datos/estudio/<proyecto>/<plan>.md y cada respuesta se añade con fecha y pregunta', () => {
  const datos = mkdtempSync(join(tmpdir(), 'estudio-'))
  assert.equal(rutaGuia(datos, 'iep', '/r/docs/BACKLOG_H7.md'), join(datos, 'estudio', 'iep', 'BACKLOG_H7.md'))
  assert.equal(rutaGuia(datos, '../x', '/r/P.md'), join(datos, 'estudio', '___x', 'P.md'), 'el id no escapa de datos/estudio')
  const uno = anadirAGuia(null, { plan: '/r/P.md', pregunta: 'Extrae lo técnico', respuesta: 'Node y git.', fecha: '2026-10-05' })
  assert.match(uno, /^# Guía de estudio — P\.md\n/)
  assert.match(uno, /\/r\/P\.md/)
  assert.match(uno, /## 2026-10-05 — Extrae lo técnico\n\nNode y git\.\n$/)
  const dos = anadirAGuia(uno, { plan: '/r/P.md', pregunta: '¿Y S2?', respuesta: 'Otra.', fecha: '2026-10-06' })
  assert.ok(dos.startsWith(uno))
  assert.equal((dos.match(/^# /gm) || []).length, 1, 'un solo título')
  assert.ok(readFileSync(FALSO, 'utf8').startsWith('#!/usr/bin/env node'))
})
