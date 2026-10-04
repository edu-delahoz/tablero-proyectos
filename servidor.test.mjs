// Endpoints de sincronía del servidor local, en proceso, con un adaptador en memoria. node --test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, request } from 'node:http'

const dir = mkdtempSync(join(tmpdir(), 'tablero-srv-'))
const BACKLOG = join(dir, 'BACKLOG_PRUEBA.md')
const INICIAL = '# Prueba\n\n## S1 — Base\n\n- [ ] Uno\n- [x] Dos\n'
writeFileSync(BACKLOG, INICIAL)
// Bitácora: copia del fixture en el temporal (nunca la real) y una transcripción falsa que la asocia.
const BITACORA = join(dir, 'BITACORA.md')
copyFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'BITACORA.md'), BITACORA)
const TR = join(dir, 'transcripciones')
mkdirSync(join(TR, '-prueba'), { recursive: true })
writeFileSync(join(TR, '-prueba', 'bbbb2222-0000.jsonl'), '')
process.env.TABLERO_TRANSCRIPCIONES = TR
writeFileSync(join(dir, 'proyectos.json'), JSON.stringify([{
  id: 'prueba', nombre: 'Prueba', docs: [dir], patronBacklogs: '^BACKLOG.*\\.md$', bitacora: BITACORA, transcripciones: '-prueba',
  integraciones: [
    { id: 'gh', tipo: 'github-projects', propietario: 'usuario', numero: 1, backlog: 'BACKLOG_PRUEBA.md' },
    { id: 'tr', tipo: 'tipo-inexistente', backlog: 'BACKLOG_PRUEBA.md' },
  ],
}]))
process.env.TABLERO_PROYECTOS = join(dir, 'proyectos.json')
process.env.TABLERO_DATOS = join(dir, 'datos')
// Credenciales: siempre un archivo del temporal, nunca ~/.config/tablero.
const CRED = join(dir, 'config', 'credenciales.json')
process.env.TABLERO_CREDENCIALES = CRED

const fuera = new Map([['E1', { id: 'E1', titulo: 'Desde afuera', hecha: false, columna: 'Todo', url: 'https://x/E1' }]])
let n = 0
const falso = {
  async leer() { return { url: 'https://x', titulo: 'Falso', columnas: ['Todo', 'Done'], items: [...fuera.values()] } },
  async crear(cfg, cred, t) { const id = `N${++n}`; fuera.set(id, { id, titulo: t.titulo, hecha: t.hecha, url: `https://x/${id}` }); return { id, url: `https://x/${id}` } },
  async actualizar(cfg, cred, id, c) { Object.assign(fuera.get(id), c) },
  async listar(cfg, cred) { if (cfg.numero === 99) throw new Error('GitHub Projects: Sin conexión con GitHub.'); return { recibido: cfg, cred, proyectos: [{ propietario: 'u', numero: 5, titulo: 'Falso' }] } },
}
const trelloFalso = { async listar(cfg, cred) { return { recibido: cfg, cred, tableros: [] } } }

let srv, puerto, salidas = 0
before(async () => {
  const { crearManejador } = await import('./generar.mjs')
  let manejador
  srv = createServer((q, r) => manejador(q, r))
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  puerto = srv.address().port
  manejador = crearManejador({ puerto, adaptadores: { 'github-projects': falso, trello: trelloFalso }, codigo: 'c1', alSalir: () => { salidas++ } })
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

test('bitácora: /api/datos la trae parseada y asociada por sid', async () => {
  const b = (await get('/api/datos')).json.proyectos[0].bitacora
  assert.equal(b.ruta, BITACORA)
  assert.equal(b.registro.find((f) => f.sid === 'bbbb2222').proyecto, 'prueba')
  assert.equal(b.registro.find((f) => f.sid === 'aaaa1111').proyecto, null)
  assert.deepEqual(b.lecciones.length, 2)
})

test('bitácora: POST reescribe solo la fila pedida; 409 si cambió; 400 si no valida; 403 si la ruta no es la bitácora', async () => {
  const antes = readFileSync(BITACORA, 'utf8')
  const { hash } = (await get('/api/datos')).json.proyectos[0].bitacora
  const ok = { ruta: BITACORA, sid: 'bbbb2222', calidad: '✅', seguridad: 'sin prod', notas: 'bien', hash }
  for (const opts of [{ host: `evil.com:${puerto}` }, { origin: 'http://evil.com' }, { tipo: 'text/plain' }]) assert.equal((await post('/api/bitacora', ok, opts)).estado, 403)
  assert.equal((await post('/api/bitacora', { ...ok, ruta: BACKLOG })).estado, 403)
  assert.equal((await post('/api/bitacora', { ...ok, ruta: '/etc/hosts' })).estado, 403)
  assert.equal((await post('/api/bitacora', { ...ok, calidad: 'regular' })).estado, 400)
  assert.equal((await post('/api/bitacora', { ...ok, notas: 'a\nb' })).estado, 400)
  assert.equal((await post('/api/bitacora', { ...ok, hash: undefined })).estado, 400)
  assert.equal((await post('/api/bitacora', { ...ok, sid: 'eeee5555' })).estado, 404)
  assert.equal(readFileSync(BITACORA, 'utf8'), antes)

  const r = await post('/api/bitacora', ok)
  assert.equal(r.estado, 200)
  const despues = readFileSync(BITACORA, 'utf8')
  const distintas = antes.split('\n').filter((l, i) => l !== despues.split('\n')[i])
  assert.deepEqual(distintas, ['| 2026-10-04 02:44 | Tablero barra de estado (bbbb2222) | auto | Opus 5.5 | ~31 min | $2.05 | ctx 61k→136k 🟡 | _pendiente_ | _pendiente_ | clear |'])
  assert.match(despues, /\(bbbb2222\) .*\| ✅ \| sin prod \| bien \|$/m)
  const fila = r.json.datos.proyectos[0].bitacora.registro.find((f) => f.sid === 'bbbb2222')
  assert.equal(fila.pendiente, false)

  // El hash viejo ya no vale: 409 y el archivo queda como está.
  const c = await post('/api/bitacora', { ...ok, sid: 'dddd4444' })
  assert.equal(c.estado, 409)
  assert.equal(readFileSync(BITACORA, 'utf8'), despues)
})

test('/api/favoritos: guarda por título en datos/favoritos.json, alterna, valida y exige Origin', async () => {
  const archivo = join(dir, 'datos', 'favoritos.json')
  assert.deepEqual((await get('/api/datos')).json.favoritos, [])
  for (const opts of [{ host: `evil.com:${puerto}` }, { origin: 'http://evil.com' }, { tipo: 'text/plain' }]) assert.equal((await post('/api/favoritos', { titulo: 'S1 — Base', favorito: true }, opts)).estado, 403)
  assert.equal(existsSync(archivo), false)
  for (const malo of [{}, { titulo: '', favorito: true }, { titulo: 'S1', favorito: 'sí' }, { titulo: 'x'.repeat(201), favorito: true }]) assert.equal((await post('/api/favoritos', malo)).estado, 400)

  const a = await post('/api/favoritos', { titulo: ' S1 —  Base ', favorito: true })
  assert.equal(a.estado, 200)
  assert.deepEqual(a.json.datos.favoritos, ['S1 — Base'])
  assert.deepEqual(JSON.parse(readFileSync(archivo, 'utf8')), { favoritos: ['S1 — Base'] })
  await post('/api/favoritos', { titulo: 'S1 — Base', favorito: true }) // idempotente
  const b = await post('/api/favoritos', { titulo: 'S2 — Otra', favorito: true })
  assert.deepEqual(b.json.datos.favoritos, ['S1 — Base', 'S2 — Otra'])
  const c = await post('/api/favoritos', { titulo: 'S1 — Base', favorito: false })
  assert.deepEqual(c.json.datos.favoritos, ['S2 — Otra'])
  await post('/api/favoritos', { titulo: 'S2 — Otra', favorito: false })
})

test('robustez: enviar sobre una respuesta destruida o ya enviada no lanza', async () => {
  const { crearManejador } = await import('./generar.mjs')
  const m = crearManejador({ puerto, adaptadores: {} })
  const req = { headers: { host: `127.0.0.1:${puerto}` }, url: '/api/ping', method: 'GET' }
  const llamadas = []
  const res = (extra) => ({ writeHead: () => llamadas.push('writeHead'), end: () => llamadas.push('end'), ...extra })
  await m(req, res({ destroyed: true }))
  await m(req, res({ headersSent: true }))
  assert.deepEqual(llamadas, [])
  await m(req, res({}))
  assert.deepEqual(llamadas, ['writeHead', 'end'])
})

test('robustez: un manejador que lanza (o rechaza) se registra y no tumba el proceso', async () => {
  const { protegerManejador, protegerProceso } = await import('./generar.mjs')
  const log = []
  protegerManejador(async () => { throw new Error('boom') }, (m) => log.push(m))({}, {})
  protegerManejador(() => { throw new Error('sync') }, (m) => log.push(m))({}, {})
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(log.length, 2)
  assert.ok(log.some((l) => /boom/.test(l)) && log.some((l) => /sync/.test(l)))
  const eventos = new Map()
  protegerProceso({ on: (e, f) => eventos.set(e, f) }, (m) => log.push(m))
  eventos.get('uncaughtException')(new Error('x'))
  eventos.get('unhandledRejection')(new Error('y'))
  assert.equal(log.length, 4)
})

test('/api/version trae la huella del código; POST /api/salir (local, con Origin) avisa al servidor', async () => {
  assert.equal((await get('/api/version')).json.codigo, 'c1')
  assert.equal((await post('/api/salir', {}, { origin: 'http://evil.com' })).estado, 403)
  assert.equal(salidas, 0)
  assert.deepEqual(await post('/api/salir', {}), { estado: 200, json: { ok: true } })
  assert.equal(salidas, 1)
})

test('asegurarServidor: arranca si no hay, deja el vigente y recicla si la huella cambió (SIGTERM si no sale)', async () => {
  const { asegurarServidor, pidDelLog } = await import('./generar.mjs')
  const prueba = (estado, remoto, { sale = true } = {}) => {
    const hechos = []
    let vivo = estado
    return asegurarServidor({
      codigo: 'nuevo', log: (m) => hechos.push(m),
      vivo: async () => vivo, codigoRemoto: async () => remoto,
      salir: async () => { hechos.push('salir'); if (sale) vivo = false },
      matar: () => { hechos.push('matar'); vivo = false },
      arrancar: async () => { hechos.push('arrancar'); vivo = true },
    }).then((r) => [r, hechos.filter((m) => !/^reinicio/.test(m)), hechos.some((m) => /^reinicio por código nuevo/.test(m))])
  }
  assert.deepEqual(await prueba(false, null), ['arrancado', ['arrancar'], false])
  assert.deepEqual(await prueba(true, 'nuevo'), ['vigente', [], false])
  assert.deepEqual(await prueba(true, 'viejo'), ['reciclado', ['salir', 'arrancar'], true])
  assert.deepEqual(await prueba(true, null, { sale: false }), ['reciclado', ['salir', 'matar', 'arrancar'], true])
  const log = '2026 arranque (pid 11, puerto 47321)\n2026 arranque (pid 22, puerto 9)\n2026 arranque (pid 33, puerto 47321)\n'
  assert.equal(pidDelLog(log, 47321), 33)
  assert.equal(pidDelLog(log, 1), null)
})

// ---------- Integraciones desde la vista (S16) ----------
const CONF = join(dir, 'proyectos.json')
const mtime = async () => (await get('/api/datos')).json.configMtime

test('integraciones: guardar añade solo campos de la lista blanca, edita en su sitio y quitar deja el resto', async () => {
  const antes = JSON.parse(readFileSync(CONF, 'utf8'))
  const nueva = { id: 'gh2', tipo: 'github-projects', propietario: 'otro', numero: '7', backlog: 'BACKLOG_PRUEBA.md', token: 'no-se-guarda' }
  const r = await post('/api/integraciones/guardar', { proyecto: 'prueba', integracion: nueva, mtime: await mtime() })
  assert.equal(r.estado, 200, r.json.error)
  let p = JSON.parse(readFileSync(CONF, 'utf8'))[0]
  assert.deepEqual(p.integraciones.map((x) => x.id), ['gh', 'tr', 'gh2'])
  assert.deepEqual(p.integraciones[2], { id: 'gh2', tipo: 'github-projects', backlog: 'BACKLOG_PRUEBA.md', propietario: 'otro', numero: 7 })
  assert.deepEqual({ ...p, integraciones: undefined }, { ...antes[0], integraciones: undefined })
  assert.ok(r.json.datos.proyectos[0].integraciones.some((x) => x.id === 'gh2'), 'la vista recibe la integración nueva sin reiniciar')
  // Editar renombrando: en su sitio y avisa.
  const e = await post('/api/integraciones/guardar', { proyecto: 'prueba', idOriginal: 'gh2', integracion: { ...nueva, id: 'gh3', numero: 8 }, mtime: await mtime() })
  assert.equal(e.json.renombrada, true)
  p = JSON.parse(readFileSync(CONF, 'utf8'))[0]
  assert.deepEqual(p.integraciones.map((x) => [x.id, x.numero]), [['gh', 1], ['tr', undefined], ['gh3', 8]])
  const q = await post('/api/integraciones/quitar', { proyecto: 'prueba', id: 'gh3', mtime: await mtime() })
  assert.equal(q.estado, 200)
  assert.deepEqual(JSON.parse(readFileSync(CONF, 'utf8')), antes)
})

test('integraciones: 409 si proyectos.json cambió, 400 con errores si no valida, 403 sin Origin', async () => {
  const m = await mtime()
  const cfg = { id: 'gh9', tipo: 'github-projects', propietario: 'u', numero: 1, backlog: 'BACKLOG_PRUEBA.md' }
  assert.equal((await post('/api/integraciones/guardar', { proyecto: 'prueba', integracion: cfg, mtime: m - 1000 })).estado, 409)
  assert.equal((await post('/api/integraciones/quitar', { proyecto: 'prueba', id: 'gh', mtime: m - 1000 })).estado, 409)
  const mala = await post('/api/integraciones/guardar', { proyecto: 'prueba', integracion: { ...cfg, id: 'gh', backlog: 'NADA.md' }, mtime: m })
  assert.equal(mala.estado, 400)
  assert.ok(mala.json.errores.some((x) => /Ya hay otra/.test(x)) && mala.json.errores.some((x) => /NADA.md/.test(x)))
  assert.equal((await post('/api/integraciones/guardar', { proyecto: 'prueba', integracion: cfg, mtime: m }, { origin: 'http://evil.com' })).estado, 403)
  assert.equal((await post('/api/integraciones/guardar', { proyecto: 'nada', integracion: cfg, mtime: m })).estado, 404)
  assert.ok(!JSON.parse(readFileSync(CONF, 'utf8'))[0].integraciones.some((x) => x.id === 'gh9'))
})

test('integraciones: probar lee con la config propuesta sin guardar', async () => {
  const antes = readFileSync(CONF, 'utf8')
  const r = await post('/api/integraciones/probar', { proyecto: 'prueba', integracion: { id: 'nueva', tipo: 'github-projects', propietario: 'u', numero: 5, backlog: 'BACKLOG_PRUEBA.md' } })
  assert.equal(r.estado, 200, r.json.error)
  assert.deepEqual([r.json.titulo, r.json.columnas, typeof r.json.items], ['Falso', ['Todo', 'Done'], 'number'])
  assert.equal(readFileSync(CONF, 'utf8'), antes)
  assert.equal((await post('/api/integraciones/probar', { proyecto: 'prueba', integracion: { id: 'x', tipo: 'github-projects', backlog: 'BACKLOG_PRUEBA.md' } })).estado, 400)
})

test('integraciones: descubrir pasa solo los campos de la consulta, traduce errores y no toca proyectos.json', async () => {
  const antes = readFileSync(CONF, 'utf8')
  const r = await post('/api/integraciones/descubrir', { tipo: 'github-projects', consulta: { propietario: 'u', numero: 5, basura: 'x', token: 'no' } })
  assert.equal(r.estado, 200, r.json.error)
  assert.deepEqual(r.json.recibido, { propietario: 'u', numero: 5 })
  assert.equal(r.json.proyectos[0].titulo, 'Falso')
  assert.deepEqual((await post('/api/integraciones/descubrir', { tipo: 'github-projects' })).json.recibido, {})
  const mal = await post('/api/integraciones/descubrir', { tipo: 'github-projects', consulta: { propietario: 'u', numero: 99 } })
  assert.deepEqual([mal.estado, mal.json.error], [502, 'GitHub Projects: Sin conexión con GitHub.'])
  assert.equal((await post('/api/integraciones/descubrir', { tipo: 'nada' })).estado, 400)
  assert.equal((await post('/api/integraciones/descubrir', { tipo: 'azure-devops', consulta: { organizacion: 'o' } })).estado, 400, 'sin adaptador con listar')
  assert.equal((await post('/api/integraciones/descubrir', { tipo: 'github-projects' }, { origin: 'http://evil.com' })).estado, 403)
  // Trello sin credencial: 400 con el paso a seguir; con ella, el conector la recibe y el JSON no la devuelve al guardarla.
  const entorno = [process.env.TRELLO_KEY, process.env.TRELLO_TOKEN]
  delete process.env.TRELLO_KEY; delete process.env.TRELLO_TOKEN
  try {
    const sin = await post('/api/integraciones/descubrir', { tipo: 'trello' })
    assert.deepEqual([sin.estado, sin.json.estado], [400, 'falta-credencial'])
    assert.ok(sin.json.paso)
    await post('/api/credenciales', { clave: 'trello', campos: { key: 'k-descubrir-1', token: 't-descubrir-2' } })
    const con = await post('/api/integraciones/descubrir', { tipo: 'trello', consulta: {} })
    assert.equal(con.estado, 200, con.json.error)
    assert.deepEqual(con.json.cred, { key: 'k-descubrir-1', token: 't-descubrir-2' })
    await post('/api/credenciales', { clave: 'trello', campos: { key: '', token: '' } })
  } finally { if (entorno[0] !== undefined) process.env.TRELLO_KEY = entorno[0]; if (entorno[1] !== undefined) process.env.TRELLO_TOKEN = entorno[1] }
  assert.equal(readFileSync(CONF, 'utf8'), antes)
})

test('credenciales: se guardan en 0600, la respuesta y /api/datos solo traen el resumen, nunca el valor', async () => {
  const SECRETO = 'tok-SUPERSECRETO-abcdef123456', CLAVE = 'key-OTROSECRETO-998877'
  const r = await post('/api/credenciales', { clave: 'trello', campos: { key: CLAVE, token: SECRETO } })
  assert.equal(r.estado, 200, r.json.error)
  assert.deepEqual(r.json.credenciales.trello, { tipo: 'trello', guardada: true, fuente: 'archivo', fin: '…3456' })
  assert.equal(statSync(CRED).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(CRED, 'utf8')), { trello: { key: CLAVE, token: SECRETO } })
  const html = await new Promise((ok) => request({ host: '127.0.0.1', port: puerto, path: '/', headers: { host: `127.0.0.1:${puerto}` } }, (x) => { let t = ''; x.on('data', (c) => { t += c }); x.on('end', () => ok(t)) }).end())
  for (const texto of [JSON.stringify(r.json), JSON.stringify((await get('/api/datos')).json), html]) {
    assert.ok(!texto.includes('SUPERSECRETO') && !texto.includes('OTROSECRETO'), 'un secreto salió del servidor')
  }
  assert.equal((await post('/api/credenciales', { clave: 'trello', campos: { pat: 'x' } })).estado, 400)
  assert.equal((await post('/api/credenciales', { clave: 'github-projects', campos: { token: 'x' } })).estado, 400)
  assert.equal((await post('/api/credenciales', { clave: 'trello', campos: { token: 'con espacio' } })).estado, 400)
  assert.equal((await post('/api/credenciales', { clave: 'trello', campos: { token: 'x' } }, { origin: 'http://evil.com' })).estado, 403)
  assert.equal(JSON.parse(readFileSync(CRED, 'utf8')).trello.token, SECRETO)
})
