// Tests del parser del tablero (vista «Mapa»). Sin dependencias: node --test
// Fixtures = backlogs y plan de un proyecto ficticio, con la misma estructura que los reales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { estructura, analizarTitulo, estasAqui, hitosDePlan, vincular, aplanar, plano, grafoRamas, fusionarRamas, anadirNota, asignarPlanes, frenteActivo } from './generar.mjs'

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

test('estasAqui: «Siguiente: S5c» con S5c ya hecha apunta a la siguiente no hecha', () => {
  const t = '## Estado\n- S5c hecha. Siguiente: **S5c**\n## S5 — Cinco\n- [x] a\n### S5b — b\n- [x] b\n### S5c — c\n- [x] c\n## S6 — Seis\n- [ ] d\n'
  const a = estructura(t)
  assert.equal(estasAqui(a, estadoDe(t)), porClave(a, 'S6').id)
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

// ---------- Prompts de «Cómo ejecutarlo» ----------
const PLAN_CLAUDE = fixture('PLAN_CLAUDE.md')
const seccion = (arbol, re) => aplanar(arbol).find((s) => re.test(s.titulo))

test('prompts: citas «Prompt T1:»/«Prompt T2:» con párrafos y modelo de la tabla de sesiones', () => {
  const ps = seccion(estructura(PLAN_CLAUDE), /^Cómo ejecutarlo/).prompts
  assert.deepEqual(ps.slice(0, 2).map((p) => [p.etiqueta, p.clave, p.modelo]), [['Prompt T1', 'T1', 'Sonnet'], ['Prompt T2', 'T2', 'Opus']])
  assert.equal(ps[0].texto, 'Ejecuta la Parte A del plan `~/plan.md`. Primero los tests, luego el código.\n\nMuéstrame la lista de archivos antes de publicar.')
  assert.equal(ps[1].texto, 'Ejecuta la Parte B del plan. Aplica el checklist de robustez.')
})

test('prompts: «Prompt de arranque:» + cerca se toma literal, sin contar casillas ni encabezados', () => {
  const a = estructura(PLAN_CLAUDE)
  const alt = seccion(a, /^Arranque alternativo/)
  assert.equal(alt.prompts.length, 2)
  assert.equal(alt.prompts[0].etiqueta, 'Prompt de arranque')
  assert.equal(alt.prompts[0].clave, null)
  assert.equal(alt.prompts[0].modelo, undefined)
  assert.match(alt.prompts[0].texto, /^Lee el plan[\s\S]*- \[ \] esta casilla es falsa\n## este encabezado es falso$/)
  assert.equal(alt.total, 0)
  assert.equal(aplanar(a).some((s) => /falso/.test(s.titulo)), false)
})

test('prompts: cerca sin rótulo dentro de «Cómo ejecutarlo» cuenta (subsección hereda) y conserva texto largo', () => {
  const alt = seccion(estructura(PLAN_CLAUDE), /^Arranque alternativo/)
  assert.equal(alt.prompts[1].etiqueta, 'Prompt')
  assert.match(alt.prompts[1].texto, /^Texto_largo_sin_espacios.*0123456789$/)
})

test('prompts: una cita sin rótulo fuera de «Cómo ejecutarlo» se ignora; con rótulo «Prompt» cuenta', () => {
  const a = estructura(PLAN_CLAUDE)
  assert.deepEqual(seccion(a, /^Contexto/).prompts, [])
  const fin = seccion(a, /^Notas finales/).prompts
  assert.equal(fin.length, 1)
  assert.match(fin[0].texto, /^Un prompt con rótulo cuenta/)
})

test('prompts: el rótulo no se arrastra a una cita posterior y las citas de backlogs reales no generan prompts', () => {
  const a = estructura('## Cómo ejecutarlo\nPrompt T1:\n> uno\n\n> dos\n')
  assert.deepEqual(a[0].prompts.map((p) => [p.etiqueta, p.texto]), [['Prompt T1', 'uno'], ['Prompt', 'dos']])
  assert.deepEqual(aplanar(estructura(MVP)).flatMap((s) => s.prompts), [])
  assert.deepEqual(estructura('## A\n> solo una cita\n')[0].prompts, [])
})

test('prompts: la celda de sesión puede llevar texto extra («T2 (corta, tras elegir)»)', () => {
  const a = estructura('## Cómo ejecutarlo\n| Sesión | Modelo | Qué |\n|---|---|---|\n| T2 (corta, tras elegir) | **Sonnet** | x |\n\nPrompt T2:\n> hola\n')
  assert.equal(a[0].prompts[0].modelo, 'Sonnet')
})

test('estructura: las marcas de integración salen del texto y quedan en «marcas»; los conteos no cambian', () => {
  const md = '## S1 — A\n\n- [ ] Uno <!-- gh:PVTI_1 --> <!-- trello:abc -->\n  - [x] Hija <!-- ado:7 -->\n- [x] Dos\n'
  const [s] = estructura(md)
  assert.deepEqual(s.tareas.map((t) => [t.texto, t.marcas]), [['Uno', { gh: 'PVTI_1', trello: 'abc' }], ['Dos', undefined]])
  assert.deepEqual(s.tareas[0].hijas[0].marcas, { ado: '7' })
  assert.deepEqual([s.hechas, s.total], [2, 3])
})

test('estructura: «Plan: …/plans/x.md» da `plan` y la etiqueta «S7 — Sonnet. Prompt» da clave y modelo', () => {
  const a = estructura('## H9 — Algo\n\nPlan: `~/.claude/plans/x-y.md`. Rama `r`.\n\n- [ ] tarea\n\n## Cómo ejecutarlo\n\n**S7 — Sonnet.** Prompt:\n> Haz S7.\n')
  assert.equal(a[0].plan, 'x-y.md')
  assert.equal(a[1].plan, undefined)
  const p = a[1].prompts[0]
  assert.deepEqual([p.clave, p.modelo], ['S7', 'Sonnet'])
})

test('asignarPlanes: cada plan va al proyecto con más menciones; la asignación manual manda', () => {
  const m = new Map([
    ['iep', new Map([['a.md', new Map([['x', 1]])], ['b.md', new Map([['x', 5]])], ['c.md', new Map([['x', 2]])]])],
    ['tablero', new Map([['a.md', new Map([['x', 3], ['y', 2]])], ['b.md', new Map([['x', 1]])], ['c.md', new Map([['x', 2]])]])],
  ])
  const r = asignarPlanes(m, new Map([['b.md', 'tablero']]))
  assert.equal(r.get('a.md'), 'tablero') // 5 contra 1
  assert.equal(r.get('b.md'), 'tablero') // manual, aunque iep tenga más
  assert.equal(r.get('c.md'), 'iep') // empate: el primero
})

// ---------- Frente activo ----------
const FRENTE = `# Backlog

## Estado
- H2 CERRADO. Siguiente: **H5**

## H2 — Base ✅ CERRADO
- [x] Uno
- [x] Dos

## H3 — Consulta
- [x] Listas
- [ ] **Revisión en iPhone**, rama \`fix\`:
  - [x] Hoja de filtros
  - [ ] **Personas mal migradas (PR aparte):** ~32 registros.
    - **S1 — parche ETL (Opus)** — sin BD.
      - [x] separar_personas
      - [x] tests
    - **S1b — continuación (Opus)**
      - [x] mapeo
    - **S2 — siguiente (Opus, Supabase local)**: migración formacion_persona + pgTAP.
- [ ] **Fixes post-producción** — plan \`~/.claude/plans/fixes-pebble.md\`:
  - [x] Rama 1

## H5 — Dashboard
- [ ] Tarjetas
`
const backlogFrente = (contenido = FRENTE) => ({ archivo: 'BACKLOG_MVP.md', contenido, estructura: estructura(contenido) })
const PLANES_F = [
  { nombre: 'otro.md', titulo: 'Plan: H3 en BACKLOG_OTRO.md' },
  { nombre: 'federated-swing.md', titulo: 'Plan: cerrar los 5 pendientes de H3 en BACKLOG_MVP.md' },
  { nombre: 'viejo.md', titulo: 'Plan: H3 viejo' },
]

test('estructura: linea en secciones y tareas', () => {
  const a = estructura(FRENTE), h3 = porClave(a, 'H3')
  assert.equal(FRENTE.split('\n')[h3.linea], '## H3 — Consulta')
  assert.match(FRENTE.split('\n')[h3.tareas[1].hijas[1].linea], /^ {2}- \[ \] \*\*Personas mal migradas/)
})

test('frenteActivo: última edición en H3 → Personas mal migradas, S2 siguiente y plan por clave', () => {
  const b = backlogFrente()
  const h = [{ inicial: true, anadidas: [] }, { anadidas: ['      - [x] mapeo', '    - **S1b — continuación (Opus)**'] }]
  const a = frenteActivo(b, h, PLANES_F)
  assert.equal(a.seccion, porClave(b.estructura, 'H3').id)
  assert.equal(a.tarea.titulo, 'Personas mal migradas')
  assert.deepEqual([a.tarea.hechas, a.tarea.total, a.tarea.abiertas], [3, 3, []])
  assert.deepEqual(a.subsesiones.map((s) => [s.clave, s.estado, s.hechas, s.total]), [['S1', 'hecho', 2, 2], ['S1b', 'hecho', 1, 1], ['S2', 'siguiente', 0, 0]])
  assert.match(a.subsesiones[2].texto, /^S2 — siguiente .*pgTAP\.$/)
  assert.equal(a.plan, 'federated-swing.md')
})

test('frenteActivo: hito completo o solo líneas de Estado → null', () => {
  const b = backlogFrente()
  assert.equal(frenteActivo(b, [{ anadidas: ['- [x] Dos'] }], PLANES_F), null)
  assert.equal(frenteActivo(b, [{ anadidas: ['- H2 CERRADO. Siguiente: **H5**'] }], PLANES_F), null)
  assert.equal(frenteActivo(b, [], PLANES_F), null)
})

test('frenteActivo: la entrada más reciente con una línea útil manda; las de Estado se ignoran', () => {
  const b = backlogFrente()
  const h = [{ anadidas: ['- [ ] Tarjetas'] }, { anadidas: ['  - [x] Rama 1'] }, { anadidas: ['- H2 CERRADO. Siguiente: **H5**', 'línea que ya no existe'] }]
  const a = frenteActivo(b, h, PLANES_F)
  assert.equal(a.tarea.titulo, 'Fixes post-producción')
  assert.equal(a.plan, 'fixes-pebble.md', 'la mención dentro de la tarea manda sobre el título')
  assert.deepEqual(a.subsesiones, [])
})

test('frenteActivo: sin tarea abierta usa la primera sección abierta del hito', () => {
  const t = `## H6 — Plan\n\n### S12 — Hecha\n- [x] a\n\n### S13 — Pendiente\n- [ ] b\n`
  const b = backlogFrente(t)
  const a = frenteActivo(b, [{ anadidas: ['- [x] a'] }], [])
  assert.equal(a.seccion, porClave(b.estructura, 'S13').id)
  assert.equal(a.tarea, null)
})

// Forma de BACKLOG_MVP.md tras S3b: sub-sesiones anidadas, S3c abierta y S4 ya con casillas.
const SUBS = `## H3 — Consulta
- [ ] **Revisión en iPhone**, rama \`fix\`:
  - [ ] **Personas mal migradas (PR aparte):** ~32 registros.
    - **S3 — auditoría (Fable, solo lectura)**, rama \`h3\`.
      - [x] Auditar las dos migraciones
    - **S3b — correcciones (Opus)**
      - [x] Hallazgos 1–4
      - [x] pgTAP
    - **S3c — re-auditoría corta (Fable)**
      - [ ] Re-auditar el diff
      - [ ] Sacar __pycache__ del índice
      - [ ] Escribir S4
      - Resultado S3c:
    - Después: **S4 Sonnet** consultas/UI.
    - **S4 — consultas y UI (Sonnet)**
      - [ ] Fichas con la N:M
      - [ ] E2E
`
const PLANES_S = [
  { nombre: 'vamos-hacer-s3-mis-melodic-kernighan.md', titulo: 'H4 · S3 partida en S3a + S3b' },
  { nombre: 'sesi-n-s3-de-backlog-mvp-md-federated-sunrise.md', titulo: 'S3 (Fable) — Auditoría de las migraciones de personas H3' },
  { nombre: 'federated-swing.md', titulo: 'Plan: cerrar los 5 pendientes de H3 en BACKLOG_MVP.md' },
]
const ultimaS3b = [{ anadidas: ['      - [x] pgTAP'] }]

test('frenteActivo: Falta = solo las casillas de la sub-sesión siguiente (S3c), no las de S4', () => {
  const a = frenteActivo(backlogFrente(SUBS), ultimaS3b, PLANES_S)
  assert.equal(a.tarea.titulo, 'Personas mal migradas')
  assert.deepEqual(a.subsesiones.map((s) => [s.clave, s.estado, s.hechas, s.total]), [['S3', 'hecho', 1, 1], ['S3b', 'hecho', 2, 2], ['S3c', 'siguiente', 0, 3], ['S4', 'pendiente', 0, 2]])
  assert.deepEqual(a.tarea.abiertas, ['Re-auditar el diff', 'Sacar pycache del índice', 'Escribir S4'])
  assert.deepEqual([a.tarea.hechas, a.tarea.total], [3, 8])
})

test('frenteActivo: plan por sub-sesión (mención en la siguiente, en la hecha, por nombre con la clave)', () => {
  const b = backlogFrente(SUBS)
  // (c) Sin menciones: el plan cuyo nombre lleva «s3» y el backlog; no el de H4 ni el del hito.
  assert.deepEqual([frenteActivo(b, ultimaS3b, PLANES_S)].map((a) => [a.plan, a.planDe])[0], ['sesi-n-s3-de-backlog-mvp-md-federated-sunrise.md', 'S3'])
  // Con un plan de S3c por nombre, manda sobre el de S3; «s3» no casa con «s3c».
  const conS3c = [{ nombre: 'sesi-n-s3c-de-backlog-mvp-md-swift-ember.md', titulo: 'S3c — re-auditoría' }, ...PLANES_S]
  assert.deepEqual([frenteActivo(b, ultimaS3b, conS3c)].map((a) => [a.plan, a.planDe])[0], ['sesi-n-s3c-de-backlog-mvp-md-swift-ember.md', null])
  // (b) Mención en la sub-sesión hecha más reciente.
  const enS3b = SUBS.replace('      - [x] pgTAP', '      - [x] pgTAP (plan `~/.claude/plans/s3b-plan.md`)')
  const ultima = [{ anadidas: ['      - [x] Hallazgos 1–4'] }]
  assert.deepEqual([frenteActivo(backlogFrente(enS3b), ultima, conS3c)].map((a) => [a.plan, a.planDe])[0], ['s3b-plan.md', 'S3b'])
  // (a) Mención dentro de la siguiente manda sobre todo.
  const enS3c = enS3b.replace('      - Resultado S3c:', '      - Plan: `~/.claude/plans/s3c-plan.md`')
  assert.deepEqual([frenteActivo(backlogFrente(enS3c), ultima, conS3c)].map((a) => [a.plan, a.planDe])[0], ['s3c-plan.md', null])
})

test('transcripcionesDe: carpeta de ~/.claude/projects como la nombra Claude Code', async () => {
  const { transcripcionesDe } = await import('./generar.mjs')
  assert.equal(transcripcionesDe('/Users/edudelahoz/Desktop/Desarrollo/Instituto de estudios politicos'), '-Users-edudelahoz-Desktop-Desarrollo-Instituto-de-estudios-politicos')
  assert.equal(transcripcionesDe('/Users/edudelahoz/Desktop/Desarrollo/metodologia-claude/tablero'), '-Users-edudelahoz-Desktop-Desarrollo-metodologia-claude-tablero')
  assert.equal(transcripcionesDe('/Users/edudelahoz/Desktop/Desarrollo/metodologia-claude-code'), '-Users-edudelahoz-Desktop-Desarrollo-metodologia-claude-code')
  assert.equal(transcripcionesDe('/r/app/.claude/worktrees/h1'), '-r-app--claude-worktrees-h1')
  assert.equal(transcripcionesDe('~/x y'), `${homedir()}/x y`.replace(/[^A-Za-z0-9]/g, '-'))
})

test('estadoConfiguracion: proyecto vacío → todo pendiente; el tablero → repo, git, docs, backlog, sesiones, notas', async () => {
  const { estadoConfiguracion } = await import('./generar.mjs')
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const vacio = estadoConfiguracion({ id: 'x', nombre: 'X' }, { transcripciones: join(tmpdir(), 'no-existe-tablero') })
  assert.deepEqual(vacio.map((x) => x.paso), ['repo', 'git', 'github', 'docs', 'backlog', 'sesiones', 'notas', 'integraciones'])
  assert.ok(vacio.every((x) => x.hecho === false && x.detalle))
  const tr = mkdtempSync(join(tmpdir(), 'tablero-tr-'))
  mkdirSync(join(tr, '-aqui-wt'), { recursive: true })
  writeFileSync(join(tr, '-aqui-wt', 's.jsonl'), '')
  mkdirSync(join(tr, '-aquiotro'))
  writeFileSync(join(tr, '-aquiotro', 's.jsonl'), '')
  const est = Object.fromEntries(estadoConfiguracion(
    { id: 'tablero', repo: AQUI, docs: [AQUI], notas: join(AQUI, 'N.md'), transcripciones: '-aqui' },
    { backlogs: [{ archivo: 'BACKLOG.md' }, { archivo: 'PLAN.md', esPlan: true }], transcripciones: tr },
  ).map((x) => [x.paso, x]))
  for (const paso of ['repo', 'git', 'docs', 'backlog', 'sesiones', 'notas']) assert.equal(est[paso].hecho, true, paso)
  assert.equal(est.sesiones.detalle, '1 sesión(es) de Claude', 'no cuenta «-aquiotro»')
  assert.equal(est.backlog.detalle, 'BACKLOG.md')
  assert.equal(est.github.hecho, false)
  assert.equal(est.integraciones.hecho, false)
})

// ---------- H11: retomar en lenguaje natural y «Qué se busca» ----------
const { retomarDe, hechosRetomar, contextoDePlan, plantillaBacklog: plantillaB } = await import('./generar.mjs')
const { utimesSync } = await import('node:fs')

test('estructura: descripcion = primer párrafo plano bajo el título; historia gana con «Historia:|Objetivo:|Para qué:»', () => {
  const arbol = estructura([
    '## H1 — Login', '',
    'Primer párrafo con **negrita** y `código`',
    'que sigue en otra línea.', '',
    'Segundo párrafo que no entra.',
    'Historia: Como usuario, quiero entrar con Google, para no recordar otra clave.',
    '- [ ] tarea', '',
    '### S1 — Sin texto · **Opus**',
    '- [ ] algo',
    'Texto después de las casillas: no es descripción.',
    '## H2 — Tabla primero',
    '| a | b |', '|---|---|',
    'Párrafo tras la tabla: no cuenta.',
    '## H3 — Objetivo en viñeta',
    '- **Objetivo:** que el `Resumen` diga qué se busca.',
    '## H4 — Para qué',
    'Para qué: cerrar el mes sin Excel.',
  ].join('\n'))
  const h1 = porClave(arbol, 'H1')
  assert.equal(h1.descripcion, 'Primer párrafo con negrita y código que sigue en otra línea.')
  assert.equal(h1.historia, 'Como usuario, quiero entrar con Google, para no recordar otra clave.')
  assert.equal(h1.estado, 'pendiente', 'cerrarSeccion conserva los campos')
  const s1 = porClave(arbol, 'S1')
  assert.equal(s1.descripcion, undefined)
  assert.equal(s1.historia, undefined)
  assert.equal(porClave(arbol, 'H2').descripcion, undefined, 'tablas, listas y casillas no son descripción')
  assert.equal(porClave(arbol, 'H3').historia, 'que el Resumen diga qué se busca.')
  assert.equal(porClave(arbol, 'H4').historia, 'cerrar el mes sin Excel.')
  assert.equal(porClave(arbol, 'H4').descripcion, undefined, 'la línea de historia no se repite como descripción')
  const largo = estructura(`## H9 — Largo\n${'palabra '.repeat(200)}\n`)
  assert.ok(largo[0].descripcion.length <= 600)
})

test('contextoDePlan: primer párrafo bajo «## Context» o «## Contexto»', () => {
  assert.equal(contextoDePlan(estructura('# Plan\n\n## Context\n\nEl usuario quiere **retomar** sin leer commits.\nSegunda línea.\n\nOtro párrafo.\n\n## Pasos\n1. a\n')),
    'El usuario quiere retomar sin leer commits. Segunda línea.')
  assert.equal(contextoDePlan(estructura('# Plan\n\n## Contexto\nBreve.\n')), 'Breve.')
  assert.equal(contextoDePlan(estructura('# Plan\n\n## Pasos\n1. a\n')), null)
})

test('retomarDe: la viñeta «Para retomar (fecha):» más reciente, o null', () => {
  const estado = [
    '- 2026-10-02 · rama `x` · S3 hecha. Siguiente: **S4**.',
    '- Para retomar (2026-10-02): Estabas dejando listo el login.',
    '  Falta probarlo en el móvil.',
    '- **Para retomar (2026-10-04):** Ya funciona el login; sigue el registro.',
    '- 2026-10-01 · S2 hecha.',
  ].join('\n')
  assert.deepEqual(retomarDe(estado), { fecha: '2026-10-04', texto: 'Ya funciona el login; sigue el registro.' })
  assert.deepEqual(retomarDe(estado.split('\n').slice(0, 3).join('\n')), { fecha: '2026-10-02', texto: 'Estabas dejando listo el login. Falta probarlo en el móvil.' })
  assert.equal(retomarDe('- 2026-10-01 · S2 hecha.'), null)
  assert.equal(retomarDe(''), null)
  assert.equal(retomarDe(undefined), null)
})

test('estasAqui: la viñeta «Para retomar» no tapa la línea de estado', () => {
  const arbol = estructura('## Estado\n\n## S1 — Uno\n- [x] a\n## S2 — Dos\n- [ ] b\n## S3 — Tres\n- [ ] c\n')
  const estado = '- Para retomar (2026-10-04): Seguías con S2, falta S3.\n- 2026-10-04 · Siguiente: **S3**.'
  assert.equal(estasAqui(arbol, estado), porClave(arbol, 'S3').id)
})

test('hechosRetomar: rama, siguiente, commits, PR y última sesión de Claude (fixture)', () => {
  const TR = join(AQUI, 'fixtures', 'transcripciones')
  const f = (d, s) => join(TR, d, `${s}-0000-0000-0000-000000000000.jsonl`)
  utimesSync(f('-Users-x-demo', 'aaaa1111'), new Date('2026-09-20T10:00:00Z'), new Date('2026-09-20T10:00:00Z'))
  utimesSync(f('-Users-x-demo-api', 'bbbb2222'), new Date('2026-09-28T18:00:00Z'), new Date('2026-09-28T18:00:00Z'))
  utimesSync(f('-Users-x-demoOtro', 'cccc3333'), new Date('2026-10-03T09:00:00Z'), new Date('2026-10-03T09:00:00Z'))
  const contenido = '# B\n\n## Estado\n- 2026-09-28 · Siguiente: **S2**.\n\n## S1 — Base\n- [x] a\n\n## S2 — Registro\n- [x] b\n- [ ] c\n  - [ ] c1\n- [ ] d\n'
  const est = estructura(contenido)
  const b = { archivo: 'BACKLOG.md', contenido, modificado: '2026-09-25T12:00:00.000Z', estructura: est, aqui: estasAqui(est, '- 2026-09-28 · Siguiente: **S2**.') }
  const git = {
    rama: 'registro',
    commits: [
      { oid: 'b', fecha: '2026-09-27T09:00:00+00:00', titulo: 'Formulario de registro' },
      { oid: 'a', fecha: '2026-09-28T08:00:00+00:00', titulo: 'Validar el correo' },
    ],
    prs: [{ number: 3, state: 'OPEN' }, { number: 2, state: 'MERGED' }, { number: 4, state: 'OPEN' }],
    sinPush: ['a'],
  }
  const h = hechosRetomar({ transcripciones: '-Users-x-demo', git }, b, { transcripciones: TR, ahora: new Date('2026-10-04T18:00:00Z') })
  assert.deepEqual(h.ultimaSesionClaude, { titulo: 'Probar la API de pagos', fecha: '2026-09-28T18:00:00.000Z' }, 'la más reciente del proyecto (subcarpetas sí, «-demoOtro» no); título solo de las primeras líneas')
  assert.equal(h.ultimaActividad, '2026-09-28T18:00:00.000Z')
  assert.equal(h.diasSinActividad, 6)
  assert.equal(h.rama, 'registro')
  assert.deepEqual(h.siguiente, { clave: 'S2', titulo: 'S2 — Registro' })
  assert.equal(h.pendientesSiguiente, 3)
  assert.deepEqual(h.ultimoCommit, { titulo: 'Validar el correo', fecha: '2026-09-28T08:00:00+00:00' })
  assert.equal(h.prsAbiertos, 2)
  assert.equal(h.commitsSinSubir, 1)

  // Con frente activo, lo siguiente es la sub-sesión que sigue y sus casillas abiertas.
  const conFrente = { ...b, activo: { subsesiones: [{ clave: 'S2a', titulo: 'Correo', estado: 'hecho', abiertas: [] }, { clave: 'S2b', titulo: 'Contraseña', estado: 'siguiente', abiertas: ['x', 'y'] }] } }
  const hf = hechosRetomar({ transcripciones: '-Users-x-demo', git }, conFrente, { transcripciones: TR, ahora: new Date('2026-10-04T18:00:00Z') })
  assert.deepEqual(hf.siguiente, { clave: 'S2b', titulo: 'S2b — Contraseña' })
  assert.equal(hf.pendientesSiguiente, 2)

  // Sin git, sin transcripciones y sin backlog: todo null salvo lo que se sabe.
  const vacio = hechosRetomar({}, null, { transcripciones: TR, ahora: new Date('2026-10-04T18:00:00Z') })
  assert.deepEqual(vacio, { ultimaActividad: null, diasSinActividad: null, rama: null, siguiente: null, pendientesSiguiente: 0, ultimoCommit: null, prsAbiertos: 0, commitsSinSubir: 0, ultimaSesionClaude: null })
})

test('plantillaBacklog: formato nuevo — «Para retomar» en Estado, «Historia:» en H1, «Se espera» en S1, sin romper «estás aquí»', () => {
  const t = plantillaB('Demo', '2026-10-04')
  assert.match(t, /^- Para retomar \(2026-10-04\): .+/m)
  assert.ok(retomarDe(t.match(/## Estado\n([\s\S]*?)\n## /)[1]))
  const arbol = estructura(t)
  assert.ok(porClave(arbol, 'H1').historia)
  assert.ok(porClave(arbol, 'S1').seEspera)
  assert.ok(porClave(arbol, 'S1').tareas[0].llano)
  assert.equal(estasAqui(arbol, t.match(/## Estado\n([\s\S]*?)\n## /)[1]), porClave(arbol, 'S1').id)
})

// ---------- S33: sesiones activas y columnas del kanban ----------
const { sesionesActivas, columnasKanban } = await import('./generar.mjs')
const { writeFileSync: escribirS, appendFileSync: anexarS, mkdtempSync: tmpS, mkdirSync: mkdirS } = await import('node:fs')
const { tmpdir: tmpdirS } = await import('node:os')

test('sesionesActivas: por proyecto, solo .jsonl < 24 h de su carpeta y subcarpetas; título, rama, archivos, prompt y foco', () => {
  const TR = join(AQUI, 'fixtures', 'transcripciones')
  const ahora = Date.parse('2026-10-04T18:00:00Z')
  const f = (d, s) => join(TR, d, `${s}-0000-0000-0000-000000000000.jsonl`)
  const poner = (r, ms) => utimesSync(r, new Date(ms), new Date(ms))
  poner(f('-Users-x-kanban', 'eeee5555'), ahora - 60e3) // activa (hace 1 min)
  poner(f('-Users-x-kanban', 'ffff6666'), ahora - 3 * 86400e3) // vieja: fuera
  poner(f('-Users-x-kanban-web', 'abab7777'), ahora - 3600e3) // reciente, no activa
  poner(f('-Users-x-kanbanOtro', 'cdcd8888'), ahora - 30e3) // de otro proyecto
  const r = sesionesActivas([{ id: 'k', transcripciones: '-Users-x-kanban' }, { id: 'nada' }], TR, { ahora })
  assert.deepEqual(Object.keys(r).sort(), ['k', 'nada'])
  assert.deepEqual(r.nada, [])
  assert.deepEqual(r.k.map((s) => s.sid), ['eeee5555-0000-0000-0000-000000000000', 'abab7777-0000-0000-0000-000000000000'], 'más reciente primero; sin la vieja ni la de «kanbanOtro»')
  const [s, w] = r.k
  assert.equal(s.titulo, 'Kanban en vivo')
  assert.equal(s.rama, 'kanban-s2', 'la rama más reciente')
  assert.equal(s.inicio, '2026-10-04T17:00:00.000Z')
  assert.equal(s.ultimo, new Date(ahora - 60e3).toISOString())
  assert.equal(s.activa, true)
  assert.deepEqual(s.archivos, ['/Users/x/kanban/BACKLOG.md', '/Users/x/kanban/a.mjs', '/Users/x/kanban/b.mjs'], 'Edit/Write, más reciente primero, sin repetir; Read no')
  assert.equal(s.ultimoPrompt, 'ahora ajusta el test', 'ni tool_result ni isMeta')
  assert.deepEqual(s.foco, { claves: ['S2'], backlogs: ['BACKLOG.md'] })
  assert.equal(w.activa, false)
  assert.equal(w.titulo, null)
  assert.equal(w.rama, 'web')
})

test('sesionesActivas: cola de 64 KB + cabeza en archivos grandes, prompt ≤ 200, y caché que se invalida por mtime', () => {
  const TR = tmpS(join(tmpdirS(), 'tablero-ses-'))
  mkdirS(join(TR, '-r'))
  const r = join(TR, '-r', 'gggg.jsonl')
  const ln = (o) => JSON.stringify(o) + '\n'
  const relleno = ln({ type: 'assistant', timestamp: '2026-10-04T10:00:00.000Z', message: { content: [{ type: 'text', text: 'x'.repeat(2000) }] } })
  escribirS(r, ln({ type: 'custom-title', customTitle: 'Grande' }) + ln({ type: 'user', timestamp: '2026-10-04T09:00:00.000Z', message: { content: 'Sesión S9 de BACKLOG_X.md' } })
    + ln({ type: 'assistant', timestamp: '2026-10-04T09:01:00.000Z', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/r/viejo.mjs' } }] } })
    + relleno.repeat(80) + ln({ type: 'user', gitBranch: 'g', timestamp: '2026-10-04T11:00:00.000Z', message: { content: 'y'.repeat(500) } }))
  const ahora = Date.now()
  const a = sesionesActivas([{ id: 'r', transcripciones: '-r' }], TR, { ahora }).r[0]
  assert.equal(a.titulo, 'Grande')
  assert.equal(a.inicio, '2026-10-04T09:00:00.000Z')
  assert.deepEqual(a.archivos, [], 'el Edit viejo quedó fuera de la cola')
  assert.equal(a.ultimoPrompt.length, 200)
  assert.deepEqual(a.foco.claves, ['S9'])
  assert.deepEqual(a.foco.backlogs, ['BACKLOG_X.md'])
  anexarS(r, ln({ type: 'assistant', timestamp: '2026-10-04T11:01:00.000Z', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/r/nuevo.mjs' } }] } }))
  utimesSync(r, new Date(ahora + 5000), new Date(ahora + 5000))
  assert.deepEqual(sesionesActivas([{ id: 'r', transcripciones: '-r' }], TR, { ahora }).r[0].archivos, ['/r/nuevo.mjs'])
})

const KANBAN = [
  '# B', '', '## Estado', '- Siguiente: **S2**', '',
  '## H1 — Base · rama `base`', '### S1 — Inicio', '- [x] Hecha con PR abierto', '',
  '## H2 — Registro', 'Rama `registro-h2`.', '',
  '### S2 — Formulario', '- [ ] Campos', '  - [x] nombre', '- [~] Validación a mano', '- [ ] Enviar', '- [-] Movida a S3', '',
  '### S3 — Correo', '- [ ] Mandar correo', '- [x] Plantilla de correo', '',
].join('\n')

test('estructura: «[~]» cuenta como pendiente con marca; «[-]» (movida) no cuenta', () => {
  const s2 = porClave(estructura(KANBAN), 'S2')
  assert.equal(s2.tareas.length, 4)
  assert.equal(s2.tareas[1].marca, '~')
  assert.equal(s2.tareas[1].hecha, false)
  assert.equal(s2.tareas[3].marca, '-')
  assert.deepEqual([s2.hechas, s2.total], [1, 4])
})

test('columnasKanban: por hacer, en curso (sesión activa o [~]), en prueba (PR abierto o rama sin fusionar), hecho y movida', () => {
  const est = estructura(KANBAN)
  const b = { archivo: 'BACKLOG.md', ruta: '/r/BACKLOG.md', contenido: KANBAN, estructura: est }
  const git = { prs: [{ headRefName: 'base', state: 'OPEN' }], sinFusionar: [] }
  const por = (cols) => Object.fromEntries(cols.map((c) => [c.texto, c.estado]))
  const sin = columnasKanban(b, { git }, [])
  assert.deepEqual(por(sin), { 'Hecha con PR abierto': 'en-prueba', Campos: 'por-hacer', 'Validación a mano': 'en-curso', Enviar: 'por-hacer', 'Movida a S3': 'movida', 'Mandar correo': 'por-hacer', 'Plantilla de correo': 'hecho' })
  const campos = sin.find((c) => c.texto === 'Campos')
  assert.deepEqual({ archivo: campos.archivo, clave: campos.clave, hito: campos.hito, linea: campos.linea, hecha: campos.hecha, sub: campos.sub },
    { archivo: 'BACKLOG.md', clave: 'S2', hito: 'H2', linea: 13, hecha: false, sub: { hechas: 1, total: 1 } })
  assert.equal(campos.seccion, porClave(est, 'S2').id)
  // Rama del hito (descripción «Rama `x`») sin fusionar → en prueba.
  assert.equal(por(columnasKanban(b, { git: { ...git, sinFusionar: ['registro-h2'] } }, []))['Plantilla de correo'], 'en-prueba')
  // Sesión activa que nombra S2 y el backlog → sus casillas abiertas en curso; inactiva o de otro backlog → no.
  const ses = { activa: true, archivos: [], foco: { claves: ['S2'], backlogs: ['BACKLOG.md'] } }
  const con = por(columnasKanban(b, { git }, [ses]))
  assert.equal(con.Campos, 'en-curso'); assert.equal(con.Enviar, 'en-curso'); assert.equal(con['Mandar correo'], 'por-hacer')
  assert.equal(por(columnasKanban(b, { git }, [{ ...ses, activa: false }])).Campos, 'por-hacer')
  assert.equal(por(columnasKanban(b, { git }, [{ ...ses, foco: { claves: ['S2'], backlogs: ['OTRO.md'] } }])).Campos, 'por-hacer')
  // Sin clave en el prompt: si toca el backlog, manda el frente activo.
  const frente = { ...b, activo: { seccion: porClave(est, 'S3').id, tarea: null } }
  const f = por(columnasKanban(frente, { git }, [{ activa: true, archivos: ['/r/BACKLOG.md'], foco: { claves: [], backlogs: [] } }]))
  assert.equal(f['Mandar correo'], 'en-curso'); assert.equal(f.Campos, 'por-hacer')
})

// ---------- S53: kanban por sesión (una tarjeta = una sesión) ----------
test('kanbanSesiones: mini backlog «# Mini backlog H7» con «## S1…» → tarjetas con hito H7, llano, prompt, avance y los 4 estados', async () => {
  const { kanbanSesiones } = await import('./generar.mjs')
  const texto = fixture('kanban-mini/BACKLOG_H7.md')
  const b = { archivo: 'BACKLOG_H7.md', ruta: '/r/BACKLOG_H7.md', contenido: texto, estructura: estructura(texto), aqui: null }
  const git = { prs: [{ number: 12, url: 'https://gh/pr/12', headRefName: 'h7-s1', state: 'OPEN', ci: 'falla' }], sinFusionar: [] }
  const ts = kanbanSesiones(b, { git }, [])
  const por = Object.fromEntries(ts.map((t) => [t.clave, t]))
  assert.deepEqual(ts.map((t) => t.clave), ['S1', 'S2', 'S3', 'S4'], 'una tarjeta por sesión, en orden; «Estado» no es tarjeta')
  assert.ok(ts.every((t) => t.hito === 'H7'), 'el hito sale del título «# Mini backlog H7», no de la clave del «##»')
  assert.deepEqual(Object.fromEntries(ts.map((t) => [t.clave, t.estado])), { S1: 'en-prueba', S2: 'en-curso', S3: 'por-hacer', S4: 'hecho' })
  assert.equal(por.S1.llano, 'La tabla de personas queda migrada sin duplicados.', '1.ª frase de «Se espera»')
  assert.ok(por.S2.llano.length <= 110 && por.S2.llano.endsWith('…'), 'frase larga recortada a 110')
  assert.equal(por.S3.llano, 'Limpieza', 'sin «Se espera» → título sin la clave')
  assert.equal(por.S1.prompt, 'Sesión S1 del mini backlog H7. Migra la tabla.')
  assert.deepEqual([por.S1.hechas, por.S1.total, por.S2.hechas, por.S2.total], [2, 2, 0, 2])
  assert.deepEqual({ modelo: por.S1.modelo, rama: por.S1.rama, archivo: por.S1.archivo, resultado: por.S1.resultado }, { modelo: 'Sonnet', rama: 'h7-s1', archivo: 'BACKLOG_H7.md', resultado: 'migrada, 0 duplicados.' })
  assert.deepEqual(por.S1.pr, { numero: 12, url: 'https://gh/pr/12', estado: 'OPEN', ci: 'falla' }, 'PR de su rama con la CI')
  assert.equal(por.S2.tareas.length, 2)
  assert.equal(por.S1.texto, por.S1.llano, 'texto = llano, para la vista de casillas hasta S54')
  // PR fusionado y rama fusionada → hecho; rama sin fusionar → en prueba.
  assert.equal(kanbanSesiones(b, { git: { prs: [{ ...git.prs[0], state: 'MERGED' }], sinFusionar: [] } }, [])[0].estado, 'hecho')
  assert.equal(kanbanSesiones(b, { git: { prs: [], sinFusionar: ['h7-s1'] } }, [])[0].estado, 'en-prueba')
  // Sesión de Claude activa que nombra S3 en este archivo → en curso; en otro archivo → no.
  const ses = { activa: true, archivos: [], foco: { claves: ['S3'], backlogs: ['BACKLOG_H7.md'] } }
  assert.equal(kanbanSesiones(b, { git }, [ses]).find((t) => t.clave === 'S3').estado, 'en-curso')
  assert.equal(kanbanSesiones(b, { git }, [{ ...ses, foco: { claves: ['S3'], backlogs: ['OTRO.md'] } }]).find((t) => t.clave === 'S3').estado, 'por-hacer')
  // «Estás aquí» → en curso.
  const aqui = { ...b, aqui: porClave(b.estructura, 'S3').id }
  assert.equal(kanbanSesiones(aqui, { git }, []).find((t) => t.clave === 'S3').estado, 'en-curso')
  // Hito: «## H<n>» del archivo manda; si no hay ni «##» ni título con H, la sección del padre que enlaza el archivo.
  const conHito = '# B\n\n## H2 — Registro\n\n### S9 — Algo\n- [ ] Uno\n'
  assert.equal(kanbanSesiones({ archivo: 'B.md', contenido: conHito, estructura: estructura(conHito) }, {}, [])[0].hito, 'H2')
  const sinH = '# Mini backlog\n\n## S1 — Algo\n- [ ] Uno\n'
  assert.equal(kanbanSesiones({ archivo: 'BACKLOG_X.md', contenido: sinH, estructura: estructura(sinH), padre: { archivo: 'BACKLOG.md', clave: 'H5' } }, {}, [])[0].hito, 'H5')
})

test('resumenCi: statusCheckRollup de gh → ok · falla · corre · null', async () => {
  const { resumenCi } = await import('./generar.mjs')
  assert.equal(resumenCi([]), null)
  assert.equal(resumenCi(undefined), null)
  assert.equal(resumenCi([{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }, { __typename: 'StatusContext', state: 'SUCCESS' }]), 'ok')
  assert.equal(resumenCi([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS', conclusion: '' }]), 'corre')
  assert.equal(resumenCi([{ state: 'PENDING' }]), 'corre')
  assert.equal(resumenCi([{ status: 'IN_PROGRESS', conclusion: '' }, { status: 'COMPLETED', conclusion: 'FAILURE' }]), 'falla', 'falla manda sobre corre')
  assert.equal(resumenCi([{ state: 'ERROR' }]), 'falla')
  assert.equal(resumenCi([{ status: 'COMPLETED', conclusion: 'SKIPPED' }, { status: 'COMPLETED', conclusion: 'NEUTRAL' }]), 'ok')
})

// ---------- S35: elegir carpeta sin pegar rutas ----------
const { listarCarpetas, sugerirProyectos, propuestaProyecto, proyectoNuevo } = await import('./generar.mjs')
const { utimesSync: tocarC, symlinkSync: enlaceC } = await import('node:fs')

// Un «home» falso en el temporal: proyectos con y sin git/backlog, ocultas, node_modules, un archivo y un enlace que sale.
function homeFalso() {
  const home = tmpS(join(tmpdirS(), 'tablero-home-'))
  const dev = join(home, 'Desarrollo')
  for (const d of ['alfa/.git', 'alfa/docs', 'beta/.tablero', 'Gamma', '.oculta', 'node_modules/x']) mkdirS(join(dev, d), { recursive: true })
  escribirS(join(dev, 'alfa', 'docs', 'BACKLOG.md'), '# B\n')
  escribirS(join(dev, 'beta', '.tablero', 'BACKLOG_BETA.md'), '# B\n')
  escribirS(join(dev, 'leeme.txt'), 'no es carpeta')
  enlaceC(tmpdirS(), join(dev, 'fuera'))
  return { home, dev }
}

test('listarCarpetas: solo subcarpetas visibles de dentro de home, con git/backlog; «~» vale; fuera de home o inexistente → 400', () => {
  const { home, dev } = homeFalso()
  const r = listarCarpetas('~/Desarrollo', home)
  assert.equal(r.ruta, dev)
  assert.equal(r.padre, home)
  assert.deepEqual(r.carpetas.map((c) => c.nombre), ['alfa', 'beta', 'Gamma'], 'sin ocultas, node_modules, archivos ni enlaces; orden sin mayúsculas')
  assert.deepEqual(r.carpetas[0], { nombre: 'alfa', ruta: join(dev, 'alfa'), esGit: true, tieneBacklog: true })
  assert.equal(r.carpetas[1].tieneBacklog, true, 'backlog en .tablero')
  assert.deepEqual([r.carpetas[1].esGit, r.carpetas[2].esGit, r.carpetas[2].tieneBacklog], [false, false, false])
  assert.equal(listarCarpetas('~', home).padre, null, 'en home no se sube más')
  assert.equal(listarCarpetas(undefined, home).ruta, home)
  for (const mala of ['/etc', join(home, '..'), '~/../', join(dev, 'no-existe'), join(dev, 'leeme.txt'), join(dev, 'fuera'), 'relativa/x']) {
    assert.throws(() => listarCarpetas(mala, home), (e) => e.estado === 400 || e.codigo === 400 || /fuera|existe|carpeta|absoluta/i.test(e.message), mala)
  }
  // Tope de 200 con aviso.
  const muchas = join(home, 'muchas')
  for (let i = 0; i < 205; i++) mkdirS(join(muchas, `d${String(i).padStart(3, '0')}`), { recursive: true })
  const m = listarCarpetas(muchas, home)
  assert.equal(m.carpetas.length, 200)
  assert.match(m.aviso, /200/)
})

test('sugerirProyectos: carpetas «cwd» de las sesiones de Claude, sin las ya configuradas, más reciente primero, tope 12', () => {
  const { home, dev } = homeFalso()
  const TR = join(home, '.claude', 'projects')
  const sesion = (cwd, sid, ms) => {
    const d = join(TR, cwd.replace(/[^A-Za-z0-9]/g, '-'))
    mkdirS(d, { recursive: true })
    const r = join(d, `${sid}.jsonl`)
    escribirS(r, [{ type: 'custom-title', customTitle: 't' }, { type: 'mode' }, { type: 'user', cwd, timestamp: new Date(ms).toISOString(), message: { content: 'hola' } }].map((o) => JSON.stringify(o)).join('\n') + '\n')
    tocarC(r, new Date(ms), new Date(ms))
  }
  const ahora = Date.now()
  sesion(join(dev, 'alfa'), 'a1', ahora - 3 * 86400e3)
  sesion(join(dev, 'alfa'), 'a2', ahora - 86400e3)
  sesion(join(dev, 'alfa', 'docs'), 'a3', ahora - 60e3) // subcarpeta: suma en «alfa»
  sesion(join(dev, 'beta'), 'b1', ahora - 7200e3) // ya configurada
  sesion(join(dev, 'Gamma'), 'g1', ahora - 3600e3)
  sesion(join(dev, 'borrada'), 'x1', ahora - 10e3) // ya no existe
  sesion('/opt/fuera', 'o1', ahora - 10e3) // fuera de home
  sesion(home, 'h1', ahora - 10e3) // el propio home no es un proyecto
  const r = sugerirProyectos(TR, [{ id: 'beta', repo: join(dev, 'beta') }], { home })
  assert.deepEqual(r.map((s) => s.ruta), [join(dev, 'alfa'), join(dev, 'Gamma')])
  assert.equal(r[0].nombre, 'alfa')
  assert.equal(r[0].sesiones, 3)
  assert.equal(r[0].esGit, true)
  assert.equal(r[1].esGit, false)
  assert.ok(Date.parse(r[0].ultimaActividad) > Date.parse(r[1].ultimaActividad))
  for (let i = 0; i < 15; i++) { mkdirS(join(dev, `p${i}`)); sesion(join(dev, `p${i}`), `p${i}`, ahora - (i + 1) * 1000) }
  assert.equal(sugerirProyectos(TR, [], { home }).length, 12)
  assert.deepEqual(sugerirProyectos(join(home, 'no-existe'), [], { home }), [])
})

test('propuestaProyecto: id único (sufijo -2), nombre legible, docs de las candidatas y notas dentro de docs, con «~»', () => {
  const { home, dev } = homeFalso()
  const a = propuestaProyecto(join(dev, 'alfa'), [], home)
  assert.deepEqual(a, { id: 'alfa', nombre: 'Alfa', docs: ['~/Desarrollo/alfa/docs'], notas: '~/Desarrollo/alfa/docs/NOTAS_ALFA.md' })
  assert.deepEqual(propuestaProyecto(join(dev, 'beta'), [{ id: 'beta' }, { id: 'beta-2' }], home),
    { id: 'beta-3', nombre: 'Beta', docs: ['~/Desarrollo/beta/.tablero'], notas: '~/Desarrollo/beta/.tablero/NOTAS_BETA_3.md' })
  mkdirS(join(dev, 'Mi Proyecto_Ñandú'))
  const g = propuestaProyecto(join(dev, 'Mi Proyecto_Ñandú'), [], home)
  assert.equal(g.id, 'mi-proyecto-nandu')
  assert.equal(g.nombre, 'Mi Proyecto Ñandú')
  assert.deepEqual(g.docs, ['~/Desarrollo/Mi Proyecto_Ñandú'], 'sin candidatas: el propio repo')
})

test('proyectoNuevo: sin docs y con repo → docs = [repo]; sin id y con repo → id propuesto único', () => {
  const { dev } = homeFalso()
  assert.deepEqual(proyectoNuevo({ id: 'g', nombre: 'G', repo: join(dev, 'Gamma') }, []).docs, [join(dev, 'Gamma')])
  assert.deepEqual(proyectoNuevo({ id: 'g', nombre: 'G', repo: join(dev, 'Gamma'), docs: [join(dev, 'alfa')] }, []).docs, [join(dev, 'alfa')])
  assert.equal(proyectoNuevo({ nombre: 'G', repo: join(dev, 'Gamma') }, [{ id: 'gamma' }]).id, 'gamma-2')
})

// ---- E5: vistas de eficiencia (umbrales, calibración por ventana, costo por tipo) ----
const { semaforoLlamadas, semaforoCtx, calibrar, quedan, costoPorTipo, eficienciaDe } = await import('./eficiencia.mjs')

test('E5: umbrales de llamadas por prompt y de contexto final', () => {
  assert.deepEqual([14, 15, 30, 31].map(semaforoLlamadas), ['verde', 'ambar', 'ambar', 'rojo'])
  assert.deepEqual([99999, 100000, 130000, 130001].map(semaforoCtx), ['verde', 'ambar', 'ambar', 'rojo'])
  assert.equal(semaforoLlamadas(null), null)
})

const lim = (p5, p7, r5 = 1000, r7 = 9000) => ({ five_hour: { used_percentage: p5, resets_at: r5 }, seven_day: { used_percentage: p7, resets_at: r7 } })
const mets = [
  { sid: 'aaaaaaaa-1', limites: { inicio: lim(0, 40, 500, 9000), fin: lim(10, 41, 500, 9000) } },
  { sid: 'bbbbbbbb-2', limites: { inicio: null, fin: lim(5, 45, 1000, 9000) } },
  { sid: 'cccccccc-3', limites: { inicio: lim(5, 45, 1000, 9000), fin: lim(10, 50, 1000, 9000) } },
]
const filas = [
  { sid: 'aaaaaaaa', tarea: 'BACKLOG/S1', costo: 30, minutos: 5 }, { sid: 'bbbbbbbb', tarea: 'BACKLOG/S2', costo: 8, minutos: 4 },
  { sid: 'cccccccc', tarea: 'BACKLOG/S2', costo: 12, minutos: 6 }, { sid: 'dddddddd', tarea: 'BACKLOG/S3b', costo: 4, minutos: 3 }, { sid: 'eeeeeeee', tarea: 'libre', costo: 1, minutos: 1 },
]

test('E5: calibración por ventana — $ por 1 %, ventana vigente y su fecha', () => {
  const c = calibrar(mets, filas)
  // 5 h: la ventana vigente es la de resets_at 1000: $20 (b + c) con 10 % → $2 por 1 %.
  assert.equal(c.cinco.porPct, 2)
  assert.equal(c.cinco.pct, 10)
  assert.equal(c.cinco.resetsAt, 1000)
  assert.equal(c.cinco.fecha, new Date(1000e3).toISOString())
  // 7 d: una sola ventana, $50 con 50 % → $1 por 1 %.
  assert.equal(c.siete.porPct, 1)
  assert.equal(calibrar([], filas).cinco, null)
})

test('E5: «quedan ~N sesiones tipo X» = (100 − %) × $/1 % ÷ mediana', () => {
  assert.equal(quedan({ pct: 10, porPct: 2 }, 6), 30)
  assert.equal(quedan({ pct: 10, porPct: 2 }, 0), null)
  assert.equal(quedan(null, 6), null)
})

test('E5: costo por tipo — suma filas de la misma tarea, mediana, p90 y % de ventana 5 h', () => {
  const t = costoPorTipo(filas, { porPct5h: 2 })
  const sn = t.find((x) => x.tipo === 'Sn')
  assert.equal(sn.n, 2)               // S1 ($30) y S2 ($8 + $12 = $20)
  assert.equal(sn.mediana, 25)
  assert.equal(sn.pct5h, 12.5)
  assert.equal(t.find((x) => x.tipo === 'Snb').n, 1)
  assert.equal(t.find((x) => x.tipo === 'otro').n, 1)
})

test('E5b: plantilla.html — costo por feature con interruptor rama/feature, desglose y «sin rama», sin «otras»', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'plantilla.html'), 'utf8')
  for (const txt of ['Costo por feature', 'Costo por rama', 'data-graf-ramas="${v}"', "[['feature', 'Feature'], ['rama', 'Rama']]", "'sin rama'", 'graf-desglose']) assert.ok(html.includes(txt), txt)
  assert.ok(!html.includes('otras ('), 'sin corte top 10 + «otras»')
})

test('E5b: plantilla.html — el costo por feature muestra el tiempo total de cada feature y de sus ramas', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'plantilla.html'), 'utf8')
  for (const txt of ['r.minutos += f.minutos ?? 0', "por === 'feature' ? (g) => `${usd(g.costo)} · ${dur(g.minutos)}`", 'de trabajo en total']) assert.ok(html.includes(txt), txt)
})

test('E5: plantilla.html muestra las advertencias y la calibración del panel de límites', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'plantilla.html'), 'utf8')
  for (const txt of ['El % incluye uso fuera de Claude Code', '$ por 1 % se recalcula en cada ventana', 'Última ventana usada', 'sesiones tipo', 'Costo por tipo de tarea']) assert.ok(html.includes(txt), txt)
  const e = eficienciaDe(mets, filas)
  assert.equal(e.limites.cinco.porPct, 2)
  assert.ok(e.quedan.some((q) => q.tipo === 'Sn' && q.cinco != null))
})

// ---------- E5c: Auditoría en la pestaña Bitácora ----------
test('E5c: auditoriaPanel — últimos N días con las cinco secciones de auditar y porModelo; sin transcripciones → null', async () => {
  const { auditoriaPanel } = await import('./auditoria.mjs')
  const L = (o) => JSON.stringify(o)
  const texto = [L({ type: 'assistant', timestamp: '2026-10-04T15:00:00.000Z', requestId: 'r1', message: { model: 'claude-opus-5-5', usage: { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000, output_tokens: 200 }, content: [] } })].join('\n')
  const bit = '| Fecha | Tarea | Modelo | Costo |\n|---|---|---|---|\n'
  const a = auditoriaPanel([{ proyecto: 'p', sid: 's1', texto }], bit, { hoy: '2026-10-04', dias: 7 })
  assert.equal(a.dias.length, 7)
  assert.deepEqual(a.dias.map((d) => d.dia), ['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29', '2026-09-28'])
  const d = a.dias[0]
  for (const k of ['gasto', 'grandes', 'bashBacklog', 'catCompletos', 'readSinLimite']) assert.ok(k in d, k)
  assert.equal(d.llamadas, 1)
  assert.equal(a.dias[1].llamadas, 0)
  assert.ok(Array.isArray(a.modelos))
  assert.equal(auditoriaPanel([], bit, { hoy: '2026-10-04' }), null)
})

test('E5c: plantilla.html — tarjeta «Auditoría» con selector de día, composición, malos hábitos y Opus frente a Sonnet', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'plantilla.html'), 'utf8')
  for (const txt of ['Auditoría', 'Opus frente a Sonnet', 'sesgo de selección', 'data-aud-dia']) assert.ok(html.includes(txt), txt)
})

test('las sesiones del tutor de estudio («Plan a estudiar:») no cuentan como trabajo: ni activas ni «última sesión»', async () => {
  const { hechosRetomar } = await import('./generar.mjs')
  const tr = tmpS(join(tmpdirS(), 'tablero-est-'))
  mkdirS(join(tr, '-Users-x-est'), { recursive: true })
  const u = (t) => JSON.stringify({ type: 'user', timestamp: '2026-10-05T10:00:00Z', message: { role: 'user', content: t } }) + '\n'
  const real = join(tr, '-Users-x-est', 'real0000.jsonl'), tutor = join(tr, '-Users-x-est', 'tutor000.jsonl')
  escribirS(real, u('arregla el login') + JSON.stringify({ aiTitle: 'Login' }) + '\n')
  escribirS(tutor, u('Plan a estudiar: /x/BACKLOG.md\nLéelo completo con Read antes de responder.\n\nExtrae lo técnico') + JSON.stringify({ aiTitle: 'Estudio' }) + '\n')
  const ahora = Date.parse('2026-10-05T10:05:00Z')
  utimesSync(real, new Date(ahora - 3600e3), new Date(ahora - 3600e3))
  utimesSync(tutor, new Date(ahora - 60e3), new Date(ahora - 60e3)) // el tutor es el más reciente
  const r = sesionesActivas([{ id: 'e', transcripciones: '-Users-x-est' }], tr, { ahora })
  assert.deepEqual(r.e.map((s) => s.sid), ['real0000'], 'el tutor no sale entre las sesiones activas (ni en el kanban)')
  const h = hechosRetomar({ transcripciones: '-Users-x-est' }, null, { transcripciones: tr, ahora: new Date(ahora) })
  assert.equal(h.ultimaSesionClaude.titulo, 'Login', 'la última sesión de Claude ignora al tutor')
})
