// Tests del parser del tablero (vista «Mapa»). Sin dependencias: node --test
// Fixtures = backlogs y plan de un proyecto ficticio, con la misma estructura que los reales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { estructura, analizarTitulo, estasAqui, hitosDePlan, vincular, aplanar, plano, grafoRamas, fusionarRamas, anadirNota } from './generar.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const fixture = (f) => readFileSync(join(AQUI, 'fixtures', f), 'utf8')
const estadoDe = (t) => (t.match(/^## Estado[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m) || [, ''])[1].trim()
const porClave = (arbol, clave) => aplanar(arbol).find((s) => s.clave === clave)
const sumar = (arbol) => arbol.reduce((a, s) => ({ hechas: a.hechas + s.hechas, total: a.total + s.total }), { hechas: 0, total: 0 })
const contarGrep = (t) => {
  const sinCercas = t.replace(/^\s*```[\s\S]*?^\s*```/gm, '')
  const hechas = (sinCercas.match(/^\s*[-*] \[x\]/gim) || []).length
  return { hechas, total: hechas + (sinCercas.match(/^\s*[-*] \[ \]/gm) || []).length }
}

const MVP = fixture('BACKLOG_MVP.md')
const H4 = fixture('BACKLOG_H4.md')
const PLAN = fixture('PLAN_MVP_APLICATIVO.md')

test('analizarTitulo: modelo, rama, nota y título limpio', () => {
  const r = analizarTitulo('S1 — Migración de seguridad de pedidos · **Opus** · rama `h4-pedidos-bd`')
  assert.equal(r.titulo, 'S1 — Migración de seguridad de pedidos')
  assert.equal(r.clave, 'S1')
  assert.deepEqual(r.meta, { modelo: 'Opus', rama: 'h4-pedidos-bd' })
  const b = analizarTitulo('S2b — Aplicar cambios de Fable · **Opus** (corta) · misma rama `h4-pedidos-bd`')
  assert.equal(b.clave, 'S2b')
  assert.deepEqual(b.meta, { modelo: 'Opus', rama: 'h4-pedidos-bd', nota: 'corta' })
  assert.deepEqual(analizarTitulo('S2 — Auditoría Fable del SQL · **Fable** · sin rama (solo revisa)').meta,
    { modelo: 'Fable', nota: 'sin rama (solo revisa)' })
})

test('analizarTitulo: duración y cerrado', () => {
  const r = analizarTitulo('H1 — Fundaciones: auth + RBAC + Sentry + CI (3–5 días) — ✅ COMPLETO Y DESPLEGADO')
  assert.equal(r.titulo, 'H1 — Fundaciones: auth + RBAC + Sentry + CI')
  assert.deepEqual(r.meta, { cerrado: true, duracion: '3–5 días' })
  assert.deepEqual(analizarTitulo('H0 — Repo y entorno (½ día)').meta, { duracion: '½ día' })
  assert.deepEqual(analizarTitulo('H2 — Diseño y biblioteca (1 semana) — ✅ CERRADO (1-oct-2026)'),
    { titulo: 'H2 — Diseño y biblioteca', clave: 'H2', meta: { cerrado: true, duracion: '1 semana' } })
  // Paréntesis que no son duración se quedan en el título.
  assert.equal(analizarTitulo('S4 — Consultas y página `/pedidos` (solo lectura) · **Sonnet**').titulo, 'S4 — Consultas y página `/pedidos` (solo lectura)')
  assert.equal(analizarTitulo('Contexto').clave, null)
})

test('BACKLOG_MVP: secciones, conteos y estados', () => {
  const a = estructura(MVP)
  assert.deepEqual(a.map((s) => s.clave), [null, 'H0', 'H1', 'H3', 'H4', 'H5'])
  const fila = (c) => { const s = porClave(a, c); return [s.hechas, s.total, s.estado] }
  assert.deepEqual(fila('H0'), [8, 8, 'hecho'])
  assert.deepEqual(fila('H1'), [3, 3, 'hecho'])
  assert.deepEqual(fila('H3'), [7, 11, 'en-curso'])
  assert.deepEqual(fila('H4'), [1, 7, 'en-curso']) // el ```sql dentro de una tarea no cuenta ni rompe
  assert.deepEqual(fila('H5'), [0, 3, 'pendiente'])
  assert.equal(a[0].estado, 'doc')
  assert.deepEqual(sumar(a), contarGrep(MVP))
})

test('BACKLOG_MVP: subtareas anidadas por sangría', () => {
  const h3 = porClave(estructura(MVP), 'H3')
  assert.equal(h3.tareas.length, 3)
  const movil = h3.tareas[2]
  assert.match(movil.texto, /^\*\*Revisión H3 en el móvil/)
  assert.equal(movil.hecha, false)
  assert.equal(movil.hijas.length, 8)
  assert.deepEqual(movil.hijas.map((t) => t.hecha), [true, true, true, true, true, true, false, false])
})

test('BACKLOG_H4: ### S2b es hija de S2 y suma a su avance', () => {
  const a = estructura(H4)
  assert.deepEqual(a.map((s) => s.clave), [null, 'S1', 'S2', 'S3', 'S4', null])
  const s2 = porClave(a, 'S2')
  assert.deepEqual(s2.hijas.map((h) => [h.clave, h.nivel, h.hechas, h.total]), [['S2b', 3, 4, 4]])
  assert.equal(s2.tareas.length, 2)
  assert.deepEqual([s2.hechas, s2.total, s2.estado], [6, 6, 'hecho'])
  assert.deepEqual([porClave(a, 'S3').total, porClave(a, 'S3').estado], [7, 'pendiente'])
  assert.deepEqual(porClave(a, 'S3').meta, { modelo: 'Sonnet', rama: 'h4-catalogo' })
  assert.deepEqual(sumar(a), contarGrep(H4))
})

test('estasAqui: «Siguiente: S3» en el Estado de H4', () => {
  const a = estructura(H4)
  assert.equal(estasAqui(a, estadoDe(H4)), porClave(a, 'S3').id)
})

test('estasAqui: «H3 CERRADO» salta a la siguiente sección no terminada (H4)', () => {
  const a = estructura(MVP)
  assert.equal(estasAqui(a, estadoDe(MVP)), porClave(a, 'H4').id)
})

test('estasAqui: sin Estado, la primera sección no terminada; sin pendientes, null', () => {
  const a = estructura(MVP)
  assert.equal(estasAqui(a, ''), porClave(a, 'H3').id)
  assert.equal(estasAqui(estructura('## A\n- [x] uno\n## B\ntexto'), ''), null)
})

test('estructura: ignora encabezados y casillas dentro de bloques de código', () => {
  const a = estructura('## A\n- [ ] real\n```md\n## falso\n- [ ] falsa\n```\n- [x] otra')
  assert.equal(a.length, 1)
  assert.deepEqual([a[0].hechas, a[0].total], [1, 2])
})

test('hitosDePlan: filas de la tabla «Secuencia de hitos»', () => {
  const h = hitosDePlan(PLAN)
  assert.deepEqual(h.map((x) => x.clave), ['H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7'])
  assert.deepEqual([h[0].nombre, h[0].duracion], ['', '½ día'])
  assert.deepEqual([h[2].nombre, h[2].duracion], ['Diseño y biblioteca', '1 sem'])
  assert.deepEqual([h[7].nombre, h[7].duracion], ['Admin + salida', '3–5 d'])
  assert.match(h[4].contenido, /^Cola completa/)
  assert.match(h[4].verificacion, /^Suite de permisos ampliada/)
})

test('vincular: BACKLOG_H4 cuelga de «## H4» y el PLAN se empareja con BACKLOG_MVP', () => {
  const bl = [['BACKLOG_H4.md', H4], ['BACKLOG_MVP.md', MVP], ['PLAN_MVP_APLICATIVO.md', PLAN]]
    .map(([archivo, contenido]) => ({ archivo, contenido, esPlan: /^PLAN/.test(archivo), estructura: estructura(contenido) }))
  vincular(bl)
  const [h4, mvp, plan] = bl
  const seccionH4 = porClave(mvp.estructura, 'H4')
  assert.equal(seccionH4.vinculo, 'BACKLOG_H4.md')
  assert.deepEqual(h4.padre, { archivo: 'BACKLOG_MVP.md', clave: 'H4', id: seccionH4.id })
  assert.equal(mvp.padre, undefined)
  assert.equal(plan.pareja, 'BACKLOG_MVP.md')
  assert.equal(plan.hitos.length, 8)
})

test('plano: quita marcas de markdown para comparar con el DOM', () => {
  assert.equal(plano('S4 — Consultas y página `/pedidos` **ya**'), 'S4 — Consultas y página /pedidos ya')
  assert.equal(plano('[enlace](http://x) y __más__'), 'enlace y más')
})

test('estructura: los planes sin casillas exponen sus ítems de lista de primer nivel', () => {
  const a = estructura('# Plan\n## Pasos\n1. **Respaldo**: copiar\n   - detalle anidado\n2. Parser\n## Riesgos\n- uno\n- [ ] casilla no es ítem\n```\n1. en código\n```')
  assert.deepEqual(a[0].items, [{ texto: '**Respaldo**: copiar', numero: '1' }, { texto: 'Parser', numero: '2' }])
  assert.deepEqual(a[1].items, [{ texto: 'uno', numero: null }])
  assert.deepEqual([a[1].hechas, a[1].total], [0, 1])
})

test('grafoRamas: rama que sale y vuelve por merge', () => {
  // m = merge(b, f); f sobre b; b sobre a.  Orden topológico: m, f, b, a
  const c = (oid, ...padres) => ({ oid, padres })
  const g = grafoRamas([c('m', 'b', 'f'), c('f', 'b'), c('b', 'a'), c('a')])
  assert.deepEqual(g.map((f) => f.col), [0, 1, 0, 0])
  assert.deepEqual(g[0], { col: 0, tieneArriba: false, antes: [0], despues: [0, 1], convergen: [], nacen: [1] })
  assert.deepEqual(g[2].convergen, [1]) // f vuelve a b
  assert.deepEqual(g[2].despues, [0])
  assert.deepEqual(g[3], { col: 0, tieneArriba: true, antes: [0], despues: [], convergen: [], nacen: [] })
})

test('grafoRamas: dos puntas independientes ocupan carriles distintos', () => {
  const g = grafoRamas([{ oid: 'x', padres: ['a'] }, { oid: 'y', padres: ['a'] }, { oid: 'a', padres: [] }])
  assert.deepEqual(g.map((f) => [f.col, f.tieneArriba]), [[0, false], [1, false], [0, true]])
  assert.deepEqual(g[2].convergen, [1])
})

test('fusionarRamas: une local y origin por nombre, ignora HEAD', () => {
  const S = '\x1f'
  const r = fusionarRamas([
    ['refs/heads/main', 'a1', '2026-10-01T00:00:00Z', '[behind 40]'].join(S),
    ['refs/remotes/origin/main', 'b2', '2026-10-03T00:00:00Z', ''].join(S),
    ['refs/remotes/origin/develop', 'c3', '2026-10-02T00:00:00Z', ''].join(S),
    ['refs/remotes/origin/HEAD', 'b2', '2026-10-03T00:00:00Z', ''].join(S),
  ].join('\n'))
  assert.deepEqual(r.map((x) => [x.nombre, x.local, x.remota, x.seguimiento, x.oid]), [['main', true, true, 'behind 40', 'a1'], ['develop', false, true, '', 'c3']])
})

test('anadirNota: va al final de «Abiertas», en una sola línea', () => {
  const base = '# Notas\n\n## Abiertas\n\n- [ ] (ejemplo) uno\n  sigue\n\n## Respondidas\n\n- [x] vieja\n'
  assert.equal(anadirNota(base, 'nueva\ncon salto'), '# Notas\n\n## Abiertas\n\n- [ ] (ejemplo) uno\n  sigue\n- [ ] nueva con salto\n\n## Respondidas\n\n- [x] vieja\n')
  assert.equal(anadirNota('# N\n\n## Abiertas\n\n> instrucciones\n\n## Respondidas\n', 'a'), '# N\n\n## Abiertas\n\n> instrucciones\n\n- [ ] a\n\n## Respondidas\n')
  assert.equal(anadirNota('# N\n', 'a'), '# N\n\n## Abiertas\n\n- [ ] a\n')
})

// Coherencia con backlogs reales (opcional): TABLERO_BACKLOGS_REALES = carpeta con BACKLOG_MVP.md y BACKLOG_H4.md.
// Si la variable no está definida o los archivos no existen, estos tests se saltan.
const REALES = process.env.TABLERO_BACKLOGS_REALES ? process.env.TABLERO_BACKLOGS_REALES.replace(/^~(?=\/|$)/, homedir()) : ''
for (const f of ['BACKLOG_MVP.md', 'BACKLOG_H4.md']) {
  test(`real ${f}: la suma por sección cuadra con el conteo global`, { skip: !REALES || !existsSync(join(REALES, f)) }, () => {
    const t = readFileSync(join(REALES, f), 'utf8')
    assert.deepEqual(sumar(estructura(t)), contarGrep(t))
    assert.ok(estasAqui(estructura(t), estadoDe(t)))
  })
}
