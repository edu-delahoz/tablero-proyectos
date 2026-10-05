// S50: grafo de piezas de la metodología (vista «Metodología viva»).
// Hogar de mentira en fixtures/metodologia/home: nunca se lee el ~/.claude real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogoDe, grafoMetodologia, metodologia } from './metodologia.mjs'

const F = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'metodologia')
const HOME = join(F, 'home')
const REPO = join(F, 'repo')
const INSTALAR = readFileSync(join(REPO, 'instalar.sh'), 'utf8')
const BASE = JSON.parse(readFileSync(join(REPO, 'claude', 'settings.base.json'), 'utf8'))
const PROYECTOS = [
  { id: 'conectado', nombre: 'Conectado', transcripciones: '-conectado', backlogs: 2, notas: join(F, 'docs', 'NOTAS.md'), bitacora: join(F, 'docs', 'BITACORA.md') },
  { id: 'suelto', nombre: 'Suelto', transcripciones: '-suelto', backlogs: 0, notas: join(F, 'docs', 'NO_EXISTE.md') },
]
const grafo = () => grafoMetodologia({ home: HOME, catalogo: catalogoDe(INSTALAR, BASE), proyectos: PROYECTOS })
const pieza = (g, id) => g.piezas.find((p) => p.id === id) ?? assert.fail(`falta la pieza ${id} en ${g.piezas.map((p) => p.id).join(', ')}`)

test('catálogo: mods, enlaces y hooks salen de instalar.sh y settings.base.json', () => {
  const ids = catalogoDe(INSTALAR, BASE).map((p) => p.id)
  for (const m of ['token-weather', 'guardia-produccion', 'guardia-ramas', 'estado-trabajo', 'servidores-locales', 'panel-tablero']) assert.ok(ids.includes(`mod:${m}`), m)
  for (const id of ['reglas', 'statusline', 'agente:buscador', 'skill:relevo', 'carpeta:metodologia', 'carpeta:tablero']) assert.ok(ids.includes(id), id)
  for (const id of ['hook:vigilar_contexto.sh', 'hook:acotar_lectura.mjs', 'hook:registrar_sesion.sh', 'hook:resumen_semanal.sh', 'hook:generar.mjs --hook-inicio', 'hook:generar.mjs --silencioso', 'hook:verificar_backlog.mjs --hook']) assert.ok(ids.includes(id), id)
  for (const id of ['backlog', 'notas', 'bitacora']) assert.ok(ids.includes(id), id)
  assert.equal(new Set(ids).size, ids.length, 'sin duplicados (acotar_lectura está en Pre y Post)')
  const acotar = catalogoDe(INSTALAR, BASE).find((p) => p.id === 'hook:acotar_lectura.mjs')
  assert.deepEqual(acotar.eventos.sort(), ['PostToolUse', 'PreToolUse'])
})

test('mods: activa si está en CLAUDE_CODE_PLUGIN_DIRS, instalada si solo existe la carpeta, falta si no', () => {
  const g = grafo()
  assert.equal(pieza(g, 'mod:panel-tablero').estado, 'activa')
  assert.equal(pieza(g, 'mod:estado-trabajo').estado, 'instalada')
  assert.equal(pieza(g, 'mod:token-weather').estado, 'falta')
})

test('hooks: activa si settings.json lo llama y el archivo existe; instalada si existe sin llamarse; falta si apunta a la nada', () => {
  const g = grafo()
  assert.equal(pieza(g, 'hook:vigilar_contexto.sh').estado, 'activa')
  assert.equal(pieza(g, 'hook:acotar_lectura.mjs').estado, 'instalada')
  const reg = pieza(g, 'hook:registrar_sesion.sh')
  assert.equal(reg.estado, 'falta')
  assert.match(reg.motivo, /no existe/)
  assert.equal(pieza(g, 'hook:generar.mjs --silencioso').estado, 'falta', 'el enlace ~/.claude/tablero no está')
  assert.equal(pieza(g, 'hook:verificar_backlog.mjs --hook').estado, 'falta')
})

test('skills, agentes, reglas y carpetas por su ruta en ~/.claude', () => {
  const g = grafo()
  assert.equal(pieza(g, 'skill:relevo').estado, 'activa')
  assert.equal(pieza(g, 'agente:buscador').estado, 'falta')
  assert.equal(pieza(g, 'reglas').estado, 'activa')
  assert.equal(pieza(g, 'carpeta:metodologia').estado, 'activa')
  assert.equal(pieza(g, 'statusline').estado, 'falta', 'settings la llama pero statusline.sh no existe')
})

test('proyectos: solo el conectado (con sesiones de Claude) usa las piezas globales activas', () => {
  const g = grafo()
  assert.deepEqual(g.proyectos.map((p) => [p.id, p.conectado]), [['conectado', true], ['suelto', false]])
  assert.deepEqual(pieza(g, 'hook:vigilar_contexto.sh').proyectos, ['conectado'])
  assert.deepEqual(pieza(g, 'mod:estado-trabajo').proyectos, [], 'instalada pero no activa: nadie la usa')
  assert.deepEqual(pieza(g, 'backlog').proyectos, ['conectado'])
  assert.deepEqual(pieza(g, 'notas').proyectos, ['conectado'], 'las notas de «suelto» no existen')
  assert.equal(pieza(g, 'backlog').estado, 'activa')
  assert.equal(pieza(g, 'bitacora').estado, 'activa')
})

test('etapas del flujo con estado resumido y aristas en orden', () => {
  const g = grafo()
  assert.deepEqual(g.etapas.map((e) => e.id), ['planear', 'sesion', 'relevo', 'backlog', 'tablero', 'bitacora'])
  assert.deepEqual(g.aristas, [['planear', 'sesion'], ['sesion', 'relevo'], ['relevo', 'backlog'], ['backlog', 'tablero'], ['backlog', 'bitacora']])
  const e = Object.fromEntries(g.etapas.map((x) => [x.id, x]))
  assert.equal(e.relevo.estado, 'ok')
  assert.equal(e.planear.estado, 'falta', 'falta el agente buscador')
  assert.ok(e.sesion.piezas.includes('hook:vigilar_contexto.sh'))
  for (const p of g.piezas) assert.ok(g.etapas.some((x) => x.piezas.includes(p.id)), `${p.id} sin etapa`)
  for (const p of g.piezas) assert.ok(p.descripcion, `${p.id} sin descripción`)
})

test('metodologia() lee el repo y el hogar sin exponer secretos ni rutas del home', () => {
  const g = metodologia({ home: HOME, repo: REPO, proyectos: PROYECTOS })
  const json = JSON.stringify(g)
  assert.ok(g.piezas.length > 15)
  assert.doesNotMatch(json, /SECRETO|GITHUB_TOKEN/)
  assert.ok(!json.includes(HOME), 'las rutas del home salen con ~')
  assert.equal(pieza(g, 'hook:vigilar_contexto.sh').ruta, '~/.claude/hooks/vigilar_contexto.sh')
})

test('sin repo de la metodología: avisa y no revienta', () => {
  const g = metodologia({ home: HOME, repo: join(F, 'no-existe'), proyectos: PROYECTOS })
  assert.match(g.aviso, /instalar\.sh/)
  assert.ok(Array.isArray(g.piezas))
})
