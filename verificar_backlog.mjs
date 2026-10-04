#!/usr/bin/env node
// Obliga a que el backlog quede al día. Sin dependencias.
//   node verificar_backlog.mjs --hook     → PreToolUse (Bash): bloquea `gh pr create` / `gh pr merge` si las
//                                           secciones del backlog con esa rama tienen casillas abiertas
//                                           o «Resultado» sin rellenar (exit 2 → Claude ve el motivo).
//   node verificar_backlog.mjs [carpeta]  → lista los desajustes del proyecto (PR mergeado con casillas
//                                           abiertas, hito padre ↔ sub-backlog). Exit 1 si hay alguno.
// Escape legítimo: marcar la casilla `[-]` con nota («→ pasa a S5b») si se movió o descartó.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bloqueosDeRama, desajustes, describir } from './coherencia.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CONFIG = process.env.TABLERO_PROYECTOS || join(AQUI, 'proyectos.json')
process.env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].join(':')
const expandir = (r) => r.replace(/^~(?=\/|$)/, homedir())
const sh = (cmd, a, cwd) => { try { return execFileSync(cmd, a, { cwd, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }

export function proyectoDe(cwd, proyectos) {
  return proyectos.find((p) => [p.repo, ...(p.docs || [])].filter(Boolean).some((r) => cwd === r || cwd.startsWith(r + '/')))
}

export function leerBacklogs(p) {
  const patron = new RegExp(p.patronBacklogs || '^BACKLOG.*\\.md$', 'i')
  const lista = []
  for (const dir of p.docs || []) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) if (patron.test(f)) lista.push({ archivo: f, ruta: join(dir, f), contenido: readFileSync(join(dir, f), 'utf8') })
  }
  return lista
}

// «cd x && gh pr create --head rama …» → { modo, rama?, numero? }
export function analizarComando(cmd) {
  const m = String(cmd).match(/\bgh\s+pr\s+(create|merge)\b([^;&|\n]*)/)
  if (!m) return null
  const resto = m[2]
  const head = resto.match(/(?:--head|-H)[\s=]+["']?([^\s"']+)/)
  const numero = m[1] === 'merge' ? (resto.match(/(?:^|\s)#?(\d+)\b/) || [])[1] : null
  return { modo: m[1] === 'create' ? 'crear' : 'merge', rama: head?.[1]?.replace(/^[^:]+:/, '') || null, numero }
}

function cargarProyectos() {
  try { return JSON.parse(readFileSync(CONFIG, 'utf8')).map((p) => ({ ...p, repo: p.repo && expandir(p.repo), docs: (p.docs || []).map(expandir) })) } catch { return [] }
}

function hook() {
  let e = {}
  try { e = JSON.parse(readFileSync(0, 'utf8') || '{}') } catch { return }
  const cmd = e.tool_input?.command
  const a = cmd && analizarComando(cmd)
  if (!a) return
  const cwd = (cmd.match(/^\s*cd\s+["']?([^"'&;]+?)["']?\s*&&/) || [])[1] || e.cwd || process.cwd()
  const p = proyectoDe(cwd, cargarProyectos())
  if (!p) return
  let rama = a.rama
  if (!rama && a.numero) rama = sh('gh', ['pr', 'view', a.numero, '--json', 'headRefName', '-q', '.headRefName'], p.repo)
  if (!rama) rama = sh('git', ['branch', '--show-current'], cwd)
  if (!rama) return
  const bloqueos = bloqueosDeRama(leerBacklogs(p), rama, a.modo)
  if (!bloqueos.length) return
  const lineas = [`⛔ Backlog sin actualizar para la rama \`${rama}\` — no se ${a.modo === 'crear' ? 'abre' : 'mergea'} el PR hasta corregirlo:`]
  for (const b of bloqueos) {
    lineas.push(`- ${b.ruta} · ${b.clave || b.titulo}: ${b.motivo}`)
    for (const d of b.detalle.slice(0, 8)) lineas.push(`    · ${d}`)
  }
  lineas.push('Marca [x] lo hecho; lo que se movió o descartó, [-] con nota («→ pasa a S5b»); rellena «Resultado».',
    'Si es un sub-backlog (BACKLOG_Hn), marca también en el backlog padre los puntos del hito que esta sesión cumplió. Luego reintenta.')
  process.stderr.write(lineas.join('\n') + '\n')
  process.exitCode = 2
}

function revisar(cwd) {
  const p = proyectoDe(cwd, cargarProyectos())
  if (!p) { console.error(`Sin proyecto en proyectos.json para ${cwd}`); process.exitCode = 1; return }
  const prs = JSON.parse(sh('gh', ['pr', 'list', '--state', 'all', '--limit', '60', '--json', 'number,state,headRefName'], p.repo) || '[]')
  const d = desajustes(leerBacklogs(p), prs)
  if (!d.length) { console.log(`${p.nombre}: backlogs coherentes con GitHub y con el backlog padre.`); return }
  for (const x of d) console.log(`⚠️  ${describir(x)}`)
  process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  if (args.includes('--hook')) hook()
  else revisar(expandir(args[0] || process.cwd()))
}
