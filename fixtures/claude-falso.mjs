#!/usr/bin/env node
// `claude` de mentira para los tests del estudio (S55): lee el prompt de stdin y emite stream-json como `claude -p --verbose`.
// CLAUDE_FALSO_REGISTRO: si existe, añade una línea JSON { args, cwd, entrada } por llamada.
// Si el prompt contiene «colgar», no termina nunca (para probar el tiempo máximo y «un proceso por plan»).
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
let entrada = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => { entrada += c })
process.stdin.on('end', () => {
  if (process.env.CLAUDE_FALSO_REGISTRO) appendFileSync(process.env.CLAUDE_FALSO_REGISTRO, JSON.stringify({ args, cwd: process.cwd(), entrada }) + '\n')
  const i = args.indexOf('--resume')
  const session_id = i >= 0 ? args[i + 1] : 'sesion-falsa-1'
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n')
  out({ type: 'system', subtype: 'init', session_id, tools: ['Read', 'Grep', 'Glob', 'Bash'] })
  if (entrada.includes('colgar')) { setInterval(() => {}, 1e6); return }
  out({ type: 'stream_event', session_id, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hola, ' } } })
  out({ type: 'stream_event', session_id, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'este plan…' } } })
  out({ type: 'assistant', session_id, message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/x/PLAN.md' } }] } })
  process.stdout.write('esto no es json\n')
  out({ type: 'assistant', session_id, message: { content: [{ type: 'text', text: 'Hola, este plan…' }] } })
  out({ type: 'result', subtype: 'success', session_id, is_error: false, result: 'Hola, este plan…' })
})
