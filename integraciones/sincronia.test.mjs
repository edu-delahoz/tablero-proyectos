// Tests de las marcas y del planificador a tres bandas. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerMarcas, ponerMarca, tituloDe, tareasLocales, planificarSincronia, aplicarSincronia, MAX_TITULO } from './sincronia.mjs'

const BACKLOG = `# Backlog

## S1 — Base · **Opus**

- [x] Crear el esquema <!-- gh:A -->
- [ ] Probar \`login\` con **dos** roles <!-- gh:B --> <!-- trello:t1 -->
  - [ ] subtarea uno
  - [x] subtarea dos
- [ ] Tarea nueva sin vínculo

\`\`\`md
- [ ] casilla falsa dentro de código
\`\`\`

### S2 — Otra

* [ ] Con asterisco <!-- gh:C -->
`

test('marcas: extraer varias, quitarlas del texto y tolerar espacios', () => {
  assert.deepEqual(extraerMarcas('Probar <!-- gh:B --> <!--trello:t1-->'), { texto: 'Probar', marcas: { gh: 'B', trello: 't1' } })
  assert.deepEqual(extraerMarcas('Sin marca'), { texto: 'Sin marca', marcas: {} })
  assert.deepEqual(extraerMarcas('Un comentario <!-- normal con espacios -->').marcas, {})
})

test('marcas: ponerMarca conserva sangría y otras marcas, y reemplaza la de la misma integración', () => {
  assert.equal(ponerMarca('    - [ ] Hija', 'gh', 'X'), '    - [ ] Hija <!-- gh:X -->')
  assert.equal(ponerMarca('- [x] T <!-- trello:t1 -->  ', 'gh', 'X'), '- [x] T <!-- trello:t1 --> <!-- gh:X -->')
  assert.equal(ponerMarca('- [x] T <!-- gh:VIEJO --> <!-- trello:t1 -->', 'gh', 'NUEVO'), '- [x] T <!-- trello:t1 --> <!-- gh:NUEVO -->')
})

test('tituloDe: texto plano y recortado', () => {
  assert.equal(tituloDe('Probar `login` con **dos** [roles](x.md) <!-- gh:B -->'), 'Probar login con dos roles')
  const largo = tituloDe('palabra '.repeat(100))
  assert.equal(largo.length, MAX_TITULO)
  assert.ok(largo.endsWith('…'))
})

test('tareasLocales: solo primer nivel, con marca, sección y subtareas; ignora código', () => {
  const ts = tareasLocales(BACKLOG, 'gh')
  assert.deepEqual(ts.map((t) => [t.titulo, t.hecha, t.marca, t.seccion]), [
    ['Crear el esquema', true, 'A', 'S1'],
    ['Probar login con dos roles', false, 'B', 'S1'],
    ['Tarea nueva sin vínculo', false, null, 'S1'],
    ['Con asterisco', false, 'C', 'S2'],
  ])
  assert.deepEqual(ts[1].subtareas, [{ texto: 'subtarea uno', hecha: false }, { texto: 'subtarea dos', hecha: true }])
  assert.equal(BACKLOG.split('\n')[ts[3].linea], '* [ ] Con asterisco <!-- gh:C -->')
  assert.equal(tareasLocales(BACKLOG, 'trello')[1].marca, 't1')
})

const loc = (o) => ({ linea: 0, texto: o.titulo, subtareas: [], seccion: 'S1', marca: null, hecha: false, ...o })
const ext = (o) => ({ url: `https://x/${o.id}`, columna: o.hecha ? 'Done' : 'Todo', hecha: false, ...o })
const tipos = (acc) => acc.map((a) => `${a.tipo}:${a.id ?? a.linea}`)

test('planificar: los seis casos', () => {
  const locales = [
    loc({ linea: 1, titulo: 'Sin marca' }),
    loc({ linea: 2, titulo: 'Cambió adentro', marca: 'a', hecha: true }),
    loc({ linea: 3, titulo: 'Cambió afuera', marca: 'b' }),
    loc({ linea: 4, titulo: 'Ambos lados (local)', marca: 'c', hecha: true }),
    loc({ linea: 5, titulo: 'Igual', marca: 'd' }),
    loc({ linea: 6, titulo: 'Huérfana', marca: 'zz' }),
  ]
  const externos = [
    ext({ id: 'a', titulo: 'Cambió adentro' }),
    ext({ id: 'b', titulo: 'Cambió afuera', hecha: true }),
    ext({ id: 'c', titulo: 'Ambos lados (externo)' }),
    ext({ id: 'd', titulo: 'Igual' }),
    ext({ id: 'n', titulo: 'Solo afuera' }),
  ]
  const snap = {
    a: { titulo: 'Cambió adentro', hecha: false }, b: { titulo: 'Cambió afuera', hecha: false },
    c: { titulo: 'Ambos lados', hecha: false }, d: { titulo: 'Igual', hecha: false },
  }
  const acc = planificarSincronia(locales, externos, snap)
  assert.deepEqual(tipos(acc), ['crear-fuera:1', 'actualizar-fuera:a', 'actualizar-local:b', 'conflicto:c', 'huerfana:zz', 'traer:n'])
  assert.deepEqual(acc.find((a) => a.tipo === 'actualizar-fuera').cambios, { hecha: true })
  assert.deepEqual(acc.find((a) => a.tipo === 'actualizar-local').cambios, { hecha: true })
  assert.deepEqual(acc.find((a) => a.tipo === 'conflicto').campos, { titulo: { local: 'Ambos lados (local)', externo: 'Ambos lados (externo)' } })
})

test('planificar: título adentro y estado afuera en el mismo ítem → dos acciones, sin conflicto', () => {
  const acc = planificarSincronia([loc({ titulo: 'Nuevo nombre', marca: 'a' })], [ext({ id: 'a', titulo: 'Viejo', hecha: true })], { a: { titulo: 'Viejo', hecha: false } })
  assert.deepEqual(acc.map((a) => [a.tipo, a.cambios]), [['actualizar-fuera', { titulo: 'Nuevo nombre' }], ['actualizar-local', { hecha: true }]])
})

test('planificar: ambos lados llegan al mismo valor → nada; sin instantánea y distinto → conflicto', () => {
  assert.deepEqual(planificarSincronia([loc({ titulo: 'X', marca: 'a', hecha: true })], [ext({ id: 'a', titulo: 'X', hecha: true })], { a: { titulo: 'X', hecha: false } }), [])
  assert.equal(planificarSincronia([loc({ titulo: 'X', marca: 'a' })], [ext({ id: 'a', titulo: 'X', hecha: true })], {})[0].tipo, 'conflicto')
})

// Adaptador en memoria para probar aplicarSincronia.
function falso(items = []) {
  const fuera = new Map(items.map((x) => [x.id, { ...x }]))
  let n = 0
  return {
    fuera,
    llamadas: [],
    async crear(cfg, cred, t) { const id = `N${++n}`; this.llamadas.push(['crear', t]); fuera.set(id, { id, titulo: t.titulo, hecha: t.hecha, url: `https://x/${id}` }); return { id, url: `https://x/${id}` } },
    async actualizar(cfg, cred, id, c) { this.llamadas.push(['actualizar', id, c]); Object.assign(fuera.get(id), c) },
    leer() { return [...fuera.values()] },
  }
}
async function ciclo(contenido, ad, snap, opciones = {}) {
  const externos = ad.leer()
  const acciones = planificarSincronia(tareasLocales(contenido, 'gh'), externos, snap)
  const r = await aplicarSincronia({ contenido, integracion: 'gh', acciones, elegidas: true, externos, instantanea: snap, adaptador: ad, ...opciones })
  return { acciones, ...r }
}

test('aplicar: crea afuera, marca la casilla, trae lo de afuera y es idempotente', async () => {
  const md = '# B\n\n## S1 — A\n\n- [ ] Uno\n  - [x] sub\n- [x] Dos\n'
  const ad = falso([{ id: 'E1', titulo: 'Desde afuera', hecha: true, url: 'https://x/E1' }])
  const r1 = await ciclo(md, ad, {})
  assert.deepEqual(r1.resultados.map((x) => x.ok), [true, true, true])
  assert.equal(r1.contenido, '# B\n\n## S1 — A\n\n- [ ] Uno <!-- gh:N1 -->\n  - [x] sub\n- [x] Dos <!-- gh:N2 -->\n\n## Entrante (gh)\n\n- [x] Desde afuera <!-- gh:E1 -->\n')
  assert.deepEqual(ad.llamadas[0], ['crear', { titulo: 'Uno', hecha: false, seccion: 'S1', descripcion: '- [x] sub\n\nSección: S1' }])
  assert.deepEqual(Object.keys(r1.instantanea).sort(), ['E1', 'N1', 'N2'])
  // Segunda vuelta: nada que hacer.
  const r2 = await ciclo(r1.contenido, ad, r1.instantanea)
  assert.deepEqual(r2.acciones, [])
  assert.equal(r2.contenido, r1.contenido)
  // Otro entrante se añade al final de la misma sección.
  ad.fuera.set('E2', { id: 'E2', titulo: 'Otra', hecha: false })
  const r3 = await ciclo(r2.contenido, ad, r2.instantanea)
  assert.ok(r3.contenido.endsWith('- [x] Desde afuera <!-- gh:E1 -->\n- [ ] Otra <!-- gh:E2 -->\n'))
})

test('aplicar: marcar adentro mueve afuera; mover afuera marca adentro; ambos con la misma vuelta idempotente', async () => {
  const ad = falso([{ id: 'A', titulo: 'Uno', hecha: false }, { id: 'B', titulo: 'Dos', hecha: false }])
  const snap = { A: { titulo: 'Uno', hecha: false }, B: { titulo: 'Dos', hecha: false } }
  const md = '## S1\n\n- [x] Uno <!-- gh:A -->\n    - [ ] Dos <!-- gh:B -->\n'.replace('    - [ ] Dos', '- [ ] Dos')
  ad.fuera.get('B').hecha = true
  ad.fuera.get('B').titulo = 'Dos renombrada'
  const r = await ciclo(md, ad, snap)
  assert.deepEqual(r.acciones.map((a) => a.tipo), ['actualizar-fuera', 'actualizar-local'])
  assert.deepEqual(ad.llamadas, [['actualizar', 'A', { hecha: true }]])
  assert.equal(r.contenido, '## S1\n\n- [x] Uno <!-- gh:A -->\n- [x] Dos renombrada <!-- gh:B -->\n')
  assert.deepEqual((await ciclo(r.contenido, ad, r.instantanea)).acciones, [])
})

test('aplicar: conflicto resuelto a cada lado; sin resolver queda pendiente y no toca nada', async () => {
  const md = '## S1\n\n- [x] Local <!-- gh:A -->\n'
  const base = () => falso([{ id: 'A', titulo: 'Externo', hecha: false }])
  const snap = { A: { titulo: 'Original', hecha: false } }
  for (const [lado, contenido, fuera] of [
    ['local', md, { titulo: 'Local', hecha: true }],
    ['externo', '## S1\n\n- [ ] Externo <!-- gh:A -->\n', { titulo: 'Externo', hecha: false }],
  ]) {
    const ad = base()
    const r = await ciclo(md, ad, snap, { resoluciones: { 'conflicto:A': lado } })
    assert.equal(r.contenido, contenido, lado)
    assert.deepEqual({ titulo: ad.fuera.get('A').titulo, hecha: ad.fuera.get('A').hecha }, fuera)
    assert.deepEqual((await ciclo(r.contenido, ad, r.instantanea)).acciones, [], `idempotente (${lado})`)
  }
  const ad = base()
  const r = await ciclo(md, ad, snap)
  assert.equal(r.resultados[0].ok, false)
  assert.equal(r.contenido, md)
  assert.deepEqual(r.instantanea, snap)
  assert.equal((await ciclo(r.contenido, ad, r.instantanea)).acciones[0].tipo, 'conflicto')
})

test('aplicar: huérfana solo se informa; acción no elegida se repite; error del adaptador no marca la casilla', async () => {
  const md = '## S1\n\n- [ ] Perdida <!-- gh:X -->\n- [ ] Nueva\n'
  const ad = falso()
  ad.crear = async () => { throw new Error('credencial inválida o vencida') }
  const externos = []
  const acciones = planificarSincronia(tareasLocales(md, 'gh'), externos, {})
  assert.deepEqual(acciones.map((a) => a.tipo), ['huerfana', 'crear-fuera'])
  const r = await aplicarSincronia({ contenido: md, integracion: 'gh', acciones, elegidas: true, externos, adaptador: ad })
  assert.equal(r.contenido, md)
  assert.deepEqual(r.resultados, [{ clave: 'crear-fuera:L3', ok: false, error: 'credencial inválida o vencida' }])
  const r2 = await aplicarSincronia({ contenido: md, integracion: 'gh', acciones, elegidas: new Set(), externos, adaptador: falso() })
  assert.equal(r2.contenido, md)
  assert.deepEqual(r2.resultados, [])
})
