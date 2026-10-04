// Adaptador Trello con `fetch` simulado (respuestas ficticias en fixtures/integraciones).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leer, crear, actualizar, traducirError } from './trello.mjs'

const R = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'integraciones', 'trello.json'), 'utf8'))
const CFG = { id: 'trello', tipo: 'trello', tablero: 'AbCdEfGh' }
const CRED = { key: 'KEY-secreta', token: 'TOKEN-secreto' }
const res = (cuerpo, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo, text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) })

// fetch falso: responde por «MÉTODO ruta» (sin la query) y registra cada llamada.
function trello(rutas = {}) {
  const llamadas = []
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    const ruta = u.pathname.replace('/1/', '')
    const clave = `${init.method} ${ruta.replace(/^boards\/[^/]+(?=$|\/)/, 'boards/B')}`
    llamadas.push({ clave, url, query: Object.fromEntries(u.searchParams), metodo: init.method, cuerpo: init.body ? JSON.parse(init.body) : null, cabeceras: init.headers })
    const r = rutas[clave] ?? {
      'GET boards/B': R.tablero, 'GET boards/B/lists': R.listas, 'GET boards/B/cards': R.tarjetas, 'GET boards/B/labels': R.etiquetas,
      'POST boards/B/labels': R.etiquetaNueva, 'POST cards': R.tarjetaNueva, 'PUT cards/c1': {},
    }[clave]
    if (r instanceof Error) throw r
    if (r === undefined) throw new Error(`ruta no simulada: ${clave}`)
    return typeof r === 'object' && 'status' in r && 'ok' in r ? r : res(r)
  }
  return { fetch, llamadas, memo: new Map() }
}
const falla = (status) => ({ ...res('no', status) })

test('leer: columnas, hecha por lista «Hecho», URL y fecha; pide solo listas y tarjetas abiertas', async () => {
  const d = trello()
  const r = await leer(CFG, CRED, d)
  assert.equal(r.url, 'https://trello.com/b/AbCdEfGh/tablero-de-ejemplo')
  assert.deepEqual(r.columnas, ['Por hacer', 'En curso', 'Hecho'])
  assert.deepEqual(r.items.map((x) => [x.id, x.titulo, x.hecha, x.columna]), [['c1', 'Crear el esquema', true, 'Hecho'], ['c2', 'Probar el login', false, 'En curso']])
  assert.equal(r.items[1].url, 'https://trello.com/c/bbb222/2-probar-el-login')
  assert.equal(r.items[0].actualizado, '2026-01-10T10:00:00.000Z')
  assert.equal(d.llamadas[1].query.filter, 'open')
  assert.equal(d.llamadas[2].query.filter, 'open')
  assert.deepEqual([d.llamadas[0].query.key, d.llamadas[0].query.token], ['KEY-secreta', 'TOKEN-secreto'])
})

test('leer: lista «hecho» configurable (sin distinguir mayúsculas) y error claro si no existe', async () => {
  const r = await leer({ ...CFG, columnas: { hecho: 'EN CURSO' } }, CRED, trello())
  assert.deepEqual(r.items.map((x) => x.hecha), [false, true])
  await assert.rejects(leer({ ...CFG, columnas: { hecho: 'Cerrado' } }, CRED, trello()), /no tiene la lista «Cerrado»/)
  const sinHecho = trello({ 'GET boards/B/lists': [{ id: 'x', name: 'Ideas' }] })
  await assert.rejects(leer(CFG, CRED, sinHecho), /no tiene la lista «Hecho»/)
})

test('crear: lista pendiente/hecha, descripción y etiqueta existente o nueva', async () => {
  const d = trello()
  const r = await crear(CFG, CRED, { titulo: 'Nueva', hecha: false, seccion: 'S1', descripcion: '- [ ] sub' }, d)
  assert.deepEqual(r, { id: 'c_nueva', url: 'https://trello.com/c/ccc333' })
  const post = d.llamadas.find((l) => l.clave === 'POST cards')
  assert.deepEqual(post.cuerpo, { idList: 'l_porhacer', name: 'Nueva', desc: '- [ ] sub', idLabels: ['lb_s1'] })
  assert.ok(!d.llamadas.some((l) => l.clave === 'POST boards/B/labels'), 'la etiqueta existente no se recrea')

  const d2 = trello()
  await crear(CFG, CRED, { titulo: 'Hecha', hecha: true, seccion: 'S3' }, d2)
  assert.equal(d2.llamadas.find((l) => l.clave === 'POST boards/B/labels').cuerpo.name, 'S3')
  assert.deepEqual(d2.llamadas.find((l) => l.clave === 'POST cards').cuerpo, { idList: 'l_hecho', name: 'Hecha', desc: '', idLabels: ['lb_s3'] })

  const d3 = trello()
  await crear({ ...CFG, columnas: { pendiente: 'En curso' } }, CRED, { titulo: 'x', hecha: false }, d3)
  assert.equal(d3.llamadas.find((l) => l.clave === 'POST cards').cuerpo.idList, 'l_encurso')
  assert.equal(d3.llamadas.find((l) => l.clave === 'POST cards').cuerpo.idLabels, undefined, 'sin sección no hay etiqueta')
})

test('actualizar: PUT con name y/o idList; sin cambios no llama; nunca DELETE ni closed', async () => {
  const d = trello()
  await actualizar(CFG, CRED, 'c1', { titulo: 'Nuevo', hecha: false }, d)
  const put = d.llamadas.find((l) => l.metodo === 'PUT')
  assert.equal(put.clave, 'PUT cards/c1')
  assert.deepEqual(put.cuerpo, { name: 'Nuevo', idList: 'l_porhacer' })
  const d2 = trello()
  await actualizar(CFG, CRED, 'c1', { hecha: true }, d2)
  assert.deepEqual(d2.llamadas.find((l) => l.metodo === 'PUT').cuerpo, { idList: 'l_hecho' })
  const d3 = trello()
  await actualizar(CFG, CRED, 'c1', {}, d3)
  assert.equal(d3.llamadas.length, 0)
  for (const x of [d, d2]) assert.ok(x.llamadas.every((l) => l.metodo !== 'DELETE' && !('closed' in (l.cuerpo || {}))))
})

test('errores en español: 401, 404, timeout, red; ningún mensaje contiene key ni token', async () => {
  const msg = async (rutas) => { try { await leer(CFG, CRED, trello(rutas)) } catch (e) { return e.message } }
  const m401 = await msg({ 'GET boards/B': falla(401) })
  const m404 = await msg({ 'GET boards/B': falla(404) })
  const mTime = await msg({ 'GET boards/B': Object.assign(new Error('x'), { name: 'AbortError' }) })
  const mRed = await msg({ 'GET boards/B': new TypeError('fetch failed: https://api.trello.com/1/boards/x?key=KEY-secreta&token=TOKEN-secreto') })
  assert.match(m401, /Credencial inválida o vencida \(revisa trello\.key y trello\.token\)/)
  assert.match(m404, /No existe el tablero AbCdEfGh/)
  assert.match(mTime, /Trello no respondió en 10 s/)
  assert.equal(mRed, 'Sin conexión con Trello.')
  for (const m of [m401, m404, mTime, mRed]) assert.ok(!/KEY-secreta|TOKEN-secreto|https?:/.test(m), m)
  assert.match(traducirError({ status: 500, cuerpo: 'boom' }), /respondió 500/)
})
