// Endpoints de sincronía del servidor local, en proceso, con un adaptador en memoria. node --test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request } from 'node:http'

const dir = mkdtempSync(join(tmpdir(), 'tablero-srv-'))
const BACKLOG = join(dir, 'BACKLOG_PRUEBA.md')
const INICIAL = '# Prueba\n\n## S1 — Base\n\n- [ ] Uno\n- [x] Dos\n'
writeFileSync(BACKLOG, INICIAL)
writeFileSync(join(dir, 'proyectos.json'), JSON.stringify([{
  id: 'prueba', nombre: 'Prueba', docs: [dir], patronBacklogs: '^BACKLOG.*\\.md$',
  integraciones: [
    { id: 'gh', tipo: 'github-projects', propietario: 'usuario', numero: 1, backlog: 'BACKLOG_PRUEBA.md' },
    { id: 'tr', tipo: 'tipo-inexistente', backlog: 'BACKLOG_PRUEBA.md' },
  ],
}]))
process.env.TABLERO_PROYECTOS = join(dir, 'proyectos.json')
process.env.TABLERO_DATOS = join(dir, 'datos')

const fuera = new Map([['E1', { id: 'E1', titulo: 'Desde afuera', hecha: false, columna: 'Todo', url: 'https://x/E1' }]])
let n = 0
const falso = {
  async leer() { return { url: 'https://x', titulo: 'Falso', columnas: ['Todo', 'Done'], items: [...fuera.values()] } },
  async crear(cfg, cred, t) { const id = `N${++n}`; fuera.set(id, { id, titulo: t.titulo, hecha: t.hecha, url: `https://x/${id}` }); return { id, url: `https://x/${id}` } },
  async actualizar(cfg, cred, id, c) { Object.assign(fuera.get(id), c) },
}

let srv, puerto
before(async () => {
  const { crearManejador } = await import('./generar.mjs')
  let manejador
  srv = createServer((q, r) => manejador(q, r))
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  puerto = srv.address().port
  manejador = crearManejador({ puerto, adaptadores: { 'github-projects': falso } })
})
after(() => srv.close())

function post(ruta, cuerpo, { host = `127.0.0.1:${puerto}`, origin = `http://127.0.0.1:${puerto}`, tipo = 'application/json' } = {}) {
  return new Promise((ok, mal) => {
    const datos = JSON.stringify(cuerpo)
    const q = request({ host: '127.0.0.1', port: puerto, path: ruta, method: 'POST', headers: { host, origin, 'content-type': tipo, 'content-length': Buffer.byteLength(datos) } }, (r) => {
      let t = ''
      r.on('data', (c) => { t += c })
      r.on('end', () => ok({ estado: r.statusCode, json: JSON.parse(t) }))
    })
    q.on('error', mal)
    q.end(datos)
  })
}
const cuerpo = { proyecto: 'prueba', integracion: 'gh' }

test('sincronía: Host, Origin o tipo ajenos → 403 y no se toca nada', async () => {
  for (const ruta of ['/api/sincronia/previa', '/api/sincronia/aplicar']) {
    assert.equal((await post(ruta, cuerpo, { host: `evil.com:${puerto}` })).estado, 403)
    assert.equal((await post(ruta, cuerpo, { origin: 'http://evil.com' })).estado, 403)
    assert.equal((await post(ruta, cuerpo, { tipo: 'text/plain' })).estado, 403)
  }
  assert.equal(readFileSync(BACKLOG, 'utf8'), INICIAL)
  assert.equal(n, 0)
})

test('sincronía: errores claros (integración desconocida, conector inexistente, faltan datos)', async () => {
  assert.equal((await post('/api/sincronia/previa', { proyecto: 'prueba', integracion: 'nada' })).estado, 404)
  const r = await post('/api/sincronia/previa', { proyecto: 'prueba', integracion: 'tr' })
  assert.equal(r.estado, 400)
  assert.match(r.json.error, /aún no está disponible/)
  assert.equal((await post('/api/sincronia/aplicar', cuerpo)).estado, 400)
})

test('sincronía: previa → aplicar escribe marcas, trae lo de afuera e instantánea; segunda previa vacía', async () => {
  const p = await post('/api/sincronia/previa', cuerpo)
  assert.equal(p.estado, 200)
  assert.deepEqual(p.json.acciones.map((a) => a.clave), ['crear-fuera:L4', 'crear-fuera:L5', 'traer:E1'])
  const a = await post('/api/sincronia/aplicar', { ...cuerpo, acciones: p.json.acciones.map((x) => x.clave), hashPrevio: p.json.hash })
  assert.equal(a.estado, 200)
  assert.ok(a.json.resultados.every((x) => x.ok))
  assert.equal(readFileSync(BACKLOG, 'utf8'), '# Prueba\n\n## S1 — Base\n\n- [ ] Uno <!-- gh:N1 -->\n- [x] Dos <!-- gh:N2 -->\n\n## Entrante (gh)\n\n- [ ] Desde afuera <!-- gh:E1 -->\n')
  assert.ok(existsSync(join(dir, 'datos', 'sync-prueba-gh.json')))
  const integ = a.json.datos.proyectos[0].integraciones.find((x) => x.id === 'gh')
  assert.equal(integ.estado, 'conectado')
  assert.equal(integ.pendientes, 0)
  assert.ok(!JSON.stringify(a.json.datos).includes('token'))
  assert.deepEqual((await post('/api/sincronia/previa', cuerpo)).json.acciones, [])
})

test('sincronía: si el .md cambió desde la vista previa → 409 y nada se aplica', async () => {
  fuera.get('E1').hecha = true
  const p = await post('/api/sincronia/previa', cuerpo)
  assert.deepEqual(p.json.acciones.map((x) => x.tipo), ['actualizar-local'])
  const editado = readFileSync(BACKLOG, 'utf8').replace('- [ ] Uno', '- [x] Uno')
  writeFileSync(BACKLOG, editado)
  const a = await post('/api/sincronia/aplicar', { ...cuerpo, acciones: p.json.acciones.map((x) => x.clave), hashPrevio: p.json.hash })
  assert.equal(a.estado, 409)
  assert.equal(readFileSync(BACKLOG, 'utf8'), editado)
  assert.equal(fuera.get('N1').hecha, false)
})

function get(ruta, { host = `127.0.0.1:${puerto}` } = {}) {
  return new Promise((ok, mal) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: ruta, method: 'GET', headers: { host } }, (r) => {
      let t = ''
      r.on('data', (c) => { t += c })
      r.on('end', () => ok({ estado: r.statusCode, json: JSON.parse(t) }))
    })
    q.on('error', mal)
    q.end()
  })
}

test('/api/version: huella estable, cambia al editar un backlog y rechaza Host ajeno', async () => {
  const a = await get('/api/version')
  assert.equal(a.estado, 200)
  assert.match(a.json.version, /^[0-9a-f]{16}$/)
  assert.equal((await get('/api/version')).json.version, a.json.version)
  writeFileSync(BACKLOG, readFileSync(BACKLOG, 'utf8') + '\n- [ ] Tres (huella)\n')
  assert.notEqual((await get('/api/version')).json.version, a.json.version)
  assert.equal((await get('/api/version', { host: `evil.com:${puerto}` })).estado, 403)
})

test('/api/datos: devuelve los datos frescos sin tokens y rechaza Host ajeno', async () => {
  const d = await get('/api/datos')
  assert.equal(d.estado, 200)
  assert.equal(d.json.servidor, true)
  const b = d.json.proyectos[0].backlogs.find((x) => x.archivo === 'BACKLOG_PRUEBA.md')
  assert.match(b.contenido, /Tres \(huella\)/)
  assert.ok(!JSON.stringify(d.json).includes('token'))
  assert.equal((await get('/api/datos', { host: `evil.com:${puerto}` })).estado, 403)
})
