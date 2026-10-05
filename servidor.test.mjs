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
process.env.TABLERO_HOME = dir // raíz de /api/carpetas: el temporal, nunca el home real
writeFileSync(join(dir, 'proyectos.json'), JSON.stringify([{
  id: 'prueba', nombre: 'Prueba', docs: [dir], patronBacklogs: '^BACKLOG.*\\.md$', bitacora: BITACORA, transcripciones: '-prueba',
  integraciones: [
    { id: 'gh', tipo: 'github-projects', propietario: 'usuario', numero: 1, backlog: 'BACKLOG_PRUEBA.md' },
    { id: 'tr', tipo: 'tipo-inexistente', backlog: 'BACKLOG_PRUEBA.md' },
  ],
}, {
  // Como EAP10: sin docs ni repo, solo una integración de solo lectura.
  id: 'eap10', nombre: 'EAP10',
  integraciones: [{ id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'EAP10', tipoItem: '*' }],
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
  async listar(cfg, cred) { if (cfg.numero === 98) return new Promise(() => {}); if (cfg.numero === 99) throw new Error('GitHub Projects: Sin conexión con GitHub.'); return { recibido: cfg, cred, proyectos: [{ propietario: 'u', numero: 5, titulo: 'Falso' }] } },
}
const participaciones = []
const escrituras = [] // crear/actualizar de Azure: en solo lectura nunca debe llamarse ninguno
const ITEMS_ADO = [
  { id: '1', titulo: 'Mía', hecha: false, columna: 'Active', url: 'https://x/1', tipo: 'Task', asignado: { nombre: 'Yo', correo: 'yo@x' }, mio: true },
  { id: '2', titulo: 'Sin asignar', hecha: true, columna: 'Closed', url: 'https://x/2', tipo: 'Bug', asignado: null, mio: false },
]
const adoFalso = {
  async leer(cfg) { const sinMd = cfg.modo === 'lectura' || cfg.modo === 'participar'; return { url: 'https://x', titulo: `${cfg.organizacion}/${cfg.proyecto}`, columnas: sinMd ? ['Active', 'Closed'] : [], items: sinMd ? ITEMS_ADO : [] } },
  // Participar (S37): se registran en `participaciones`; el id 999 simula que Azure rechaza el cambio.
  async quienSoy() { participaciones.push(['quienSoy']); return { id: 'u1', nombre: 'Yo', correo: 'yo@x' } },
  async asignar(cfg, cred, id, correo) { participaciones.push(['asignar', id, correo]); if (id === '999') throw new Error('Azure DevOps rechazó el cambio: TF401320.'); return { id, columna: 'Active', hecha: false, asignado: correo ? { nombre: 'Yo', correo } : null } },
  async cambiarEstado(cfg, cred, id, estado, deps, opciones) { participaciones.push(['cambiarEstado', id, estado, opciones?.columnas]); return { id, columna: estado, hecha: estado === 'Closed', asignado: id === '2' ? { nombre: 'Yo', correo: 'yo@x' } : null } }, // id 2: Azure reasigna al cambiar el estado
  async crear(...a) { escrituras.push(['crear', ...a]); return { id: 'Z', url: 'https://x/Z' } },
  async actualizar(...a) { escrituras.push(['actualizar', ...a]) },
  async listar(cfg) { return { recibido: cfg, proyectos: ['EAP10'] } },
}
const trelloFalso = { async listar(cfg, cred) { return { recibido: cfg, cred, tableros: [] } } }

let srv, puerto, salidas = 0
before(async () => {
  const { crearManejador } = await import('./generar.mjs')
  let manejador
  srv = createServer((q, r) => manejador(q, r))
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  puerto = srv.address().port
  manejador = crearManejador({ puerto, adaptadores: { 'github-projects': falso, trello: trelloFalso, 'azure-devops': adoFalso }, codigo: 'c1', alSalir: () => { salidas++ } })
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
  assert.deepEqual(r.json.datos.proyectos[0].integraciones.find((x) => x.id === 'gh2').config, { id: 'gh2', tipo: 'github-projects', backlog: 'BACKLOG_PRUEBA.md', propietario: 'otro', numero: 7 }, 'la vista recibe la config (lista blanca) para editar')
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

test('integraciones: descubrir con un conector que nunca responde → 502 en ≤ 16 s', async () => {
  const t0 = Date.now()
  const r = await post('/api/integraciones/descubrir', { tipo: 'github-projects', consulta: { propietario: 'u', numero: 98 } })
  assert.equal(r.estado, 502)
  assert.match(r.json.error, /no respondió/)
  assert.ok(Date.now() - t0 <= 16000)
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
  assert.equal((await post('/api/integraciones/descubrir', { tipo: 'azure-devops', consulta: { organizacion: 'o' } })).json.estado, 'falta-credencial')
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

test('integraciones: Azure DevOps acepta la URL de la organización y responde el nombre normalizado', async () => {
  const entorno = process.env.AZURE_DEVOPS_PAT
  delete process.env.AZURE_DEVOPS_PAT
  try {
    await post('/api/credenciales', { clave: 'azure-devops', campos: { pat: 'pat-normaliza-12345' } })
    const d = await post('/api/integraciones/descubrir', { tipo: 'azure-devops', consulta: { organizacion: ' https://dev.azure.com/CodeFactory2026-2/ ' } })
    assert.equal(d.estado, 200, d.json.error)
    assert.equal(d.json.organizacion, 'CodeFactory2026-2')
    assert.deepEqual(d.json.recibido, { organizacion: 'CodeFactory2026-2' })
    const mal = await post('/api/integraciones/descubrir', { tipo: 'azure-devops', consulta: { organizacion: 'https://ejemplo.com/x' } })
    assert.equal(mal.estado, 400)
    assert.match(mal.json.error, /No entiendo la organización/)
    const p = await post('/api/integraciones/probar', { proyecto: 'prueba', integracion: { id: 'ado', tipo: 'azure-devops', organizacion: 'https://dev.azure.com/CodeFactory2026-2/EAP10/_boards', backlog: 'BACKLOG_PRUEBA.md' } })
    assert.equal(p.estado, 200, p.json.error)
    assert.equal(p.json.organizacion, 'CodeFactory2026-2')
    assert.equal(p.json.titulo, 'CodeFactory2026-2/EAP10')
    await post('/api/credenciales', { clave: 'azure-devops', campos: { pat: '' } })
  } finally { if (entorno !== undefined) process.env.AZURE_DEVOPS_PAT = entorno }
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

test('solo lectura: proyecto sin docs ni repo genera; ítems con tipo/asignado/mío; sin sincronía ni escrituras', async () => {
  const entorno = process.env.AZURE_DEVOPS_PAT
  process.env.AZURE_DEVOPS_PAT = 'pat-lectura-12345'
  try {
    const antesMd = readFileSync(BACKLOG, 'utf8'), antesConf = readFileSync(CONF, 'utf8')
    const d = await get('/api/datos')
    assert.equal(d.estado, 200)
    const p = d.json.proyectos.find((x) => x.id === 'eap10')
    assert.deepEqual([p.backlogs, p.git], [[], null])
    const i = p.integraciones[0]
    assert.deepEqual([i.estado, i.modo, i.backlog, i.auto, i.pendientes], ['conectado', 'lectura', null, false, 0])
    assert.equal(i.config.modo, 'lectura', 'la vista recibe el modo para que editar no lo devuelva a sincronizar')
    assert.deepEqual(i.items, ITEMS_ADO)
    assert.ok(!JSON.stringify(d.json).includes('pat-lectura'))
    const html = await fetch(`http://127.0.0.1:${puerto}/`)
    assert.equal(html.status, 200)
    assert.match(await html.text(), /EAP10/)
    // Sincronía (previa y aplicar) → 400 «solo lectura»; nada se llama ni se escribe.
    for (const ruta of ['/api/sincronia/previa', '/api/sincronia/aplicar']) {
      const r = await post(ruta, { proyecto: 'eap10', integracion: 'ado', acciones: ['traer:1'], hashPrevio: 'x' })
      assert.equal(r.estado, 400)
      assert.match(r.json.error, /solo lectura/)
    }
    const { sincronizar } = await import('./generar.mjs')
    const cfgP = JSON.parse(readFileSync(CONF, 'utf8')).find((x) => x.id === 'eap10')
    await assert.rejects(sincronizar({ ...cfgP, docs: [dir] }, 'ado', { elegidas: 'auto', adaptadores: { 'azure-devops': adoFalso } }), /solo lectura/)
    // Probar: sin backlog, vinculadas 0.
    const pr = await post('/api/integraciones/probar', { proyecto: 'eap10', integracion: { id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'EAP10' } })
    assert.equal(pr.estado, 200, pr.json.error)
    assert.deepEqual([pr.json.vinculadas, pr.json.modo, pr.json.items], [0, 'lectura', 2])
    // Guardar → editar: sigue en lectura.
    const g = await post('/api/integraciones/guardar', { proyecto: 'eap10', idOriginal: 'ado', integracion: { ...i.config, proyecto: 'EAP10' }, mtime: await mtime() })
    assert.equal(g.estado, 200, g.json.error)
    assert.equal(JSON.parse(readFileSync(CONF, 'utf8')).find((x) => x.id === 'eap10').integraciones[0].modo, 'lectura')
    assert.equal(readFileSync(CONF, 'utf8'), antesConf)
    assert.deepEqual(escrituras, [])
    assert.equal(readFileSync(BACKLOG, 'utf8'), antesMd)
    assert.ok(!existsSync(join(dir, 'datos', 'sync-eap10-ado.json')))
  } finally { if (entorno !== undefined) process.env.AZURE_DEVOPS_PAT = entorno; else delete process.env.AZURE_DEVOPS_PAT }
})

test('primera sincronía (sin instantánea): la previa lo dice con el conteo y «auto» no aplica nada', async () => {
  const otro = join(dir, 'primera')
  mkdirSync(otro, { recursive: true })
  const md = '# P\n\n- [ ] Local\n'
  writeFileSync(join(otro, 'BACKLOG_P.md'), md)
  const creados = []
  const gh = { ...falso, async crear(...a) { creados.push(a); return { id: 'Q', url: 'https://x/Q' } }, async actualizar(...a) { creados.push(a) } }
  const p = { id: 'primera', docs: [otro], integraciones: [{ id: 'g', tipo: 'github-projects', propietario: 'u', numero: 1, backlog: 'BACKLOG_P.md', auto: true }] }
  const { sincronizar } = await import('./generar.mjs')
  const previa = await sincronizar(p, 'g', { adaptadores: { 'github-projects': gh } })
  assert.equal(previa.primera, true)
  assert.deepEqual(previa.conteo, { 'crear-fuera': 1, traer: fuera.size })
  const r = await sincronizar(p, 'g', { elegidas: 'auto', adaptadores: { 'github-projects': gh } })
  assert.deepEqual(r.resultados, [])
  assert.match(r.aviso, /Primera sincronía/)
  assert.deepEqual(creados, [])
  assert.equal(readFileSync(join(otro, 'BACKLOG_P.md'), 'utf8'), md)
  assert.ok(!existsSync(join(dir, 'datos', 'sync-primera-g.json')))
  // Con instantánea ya no es la primera.
  writeFileSync(join(dir, 'datos', 'sync-primera-g.json'), '{}')
  assert.equal((await sincronizar(p, 'g', { adaptadores: { 'github-projects': gh } })).primera, false)
})

test('vista: la plantilla trae modo, filtro Mías/Sin asignar, chips y la primera sincronía sin marcar', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['data-integ-filtro', 'chip-asig', 'chip-tipo', 'id="fi-modo"', 'data-fi="tipoItem-todos"', 'Primera sincronía.', "modo: ['lectura', 'participar'].includes(c.modo) ? c.modo : 'sincronizar'"]) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
  // En solo lectura no hay botón «Sincronizar» ni «auto: no»: el guardia está en la tarjeta.
  assert.match(html, /integ\.estado === 'conectado' && !lectura \? \(editable\(\)/)
  // Los datos que alimentan chips y filtros llegan a la vista (EAP10, solo lectura).
  const d = await (await fetch(`http://127.0.0.1:${puerto}/api/datos`)).json()
  const ado = d.proyectos.find((p) => p.id === 'eap10').integraciones[0]
  assert.equal(ado.modo, 'lectura')
  assert.equal(ado.backlog, null)
})

test('vista: la plantilla trae «Nuevo proyecto», el formulario de crear y «Crear backlog» (pestaña e integraciones)', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['id="nuevo-proyecto"', 'id="panel-crear"', 'id="form-crear"', "'/api/proyectos/crear'", "'/api/backlog/crear'", 'data-crear="backlog"', 'data-crear-campo', 'mtime: DATOS.configMtime']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
  assert.equal(html.split('data-crear="backlog"').length - 1, 4, 'botón en la pestaña Backlogs (vacía y «Otro backlog»), en el paso Modo y backlog y en la guía')
  assert.ok(html.includes('Otro backlog') && html.includes('data-crear-campo="nombre"'), 'backlog secundario con nombre')
})

test('vista: la plantilla trae «Editar proyecto», la guía de configuración y el contador en «Todos»', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ["data-crear=\"editar\"", "'/api/proyectos/editar'", 'id="guia-config"', 'data-guia-ocultar', 'tablero.guia.', 'gh auth login', 'gh repo create', 'gh repo clone', '&& claude', 'P?.editable', 'cambios: {', "ir('integraciones'"]) assert.ok(html.includes(marca), marca)
  assert.ok(html.includes('data-crear="backlog"'), 'el paso backlog reutiliza «Crear backlog»')
})

test('vista: la plantilla trae «Mis tareas» (#p=mias), los bloques y el contador en «Todos»', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['value="mias"', 'Mis tareas', 'function vistaMias', 'id="mis-asignadas"', 'id="mis-siguientes"', 'Asignadas a mí', 'Siguientes pasos en mis backlogs', 'asignadas a mí', "=== 'mias'"]) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('vista: la plantilla trae la tarjeta «Para retomar» y «Qué se busca» en «En curso»', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['function tarjetaRetomar', 'Para retomar', 'Qué se busca', 'data-retomar', 'tablero.retomar.', 'Copiar prompt de la siguiente sesión', 'Detalle técnico', 'Nadie dejó un resumen', 'hito.historia', 'plan.contexto', 'function estadoSinRetomar']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('vista: la plantilla trae la pestaña «Tablero» (kanban), la franja de Claude y «Mover a»', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ["['tablero', 'Tablero']", 'function vistaKanban', "'/api/sesiones'", 'data-kanban-col', 'Claude está trabajando', 'Mover a', 'scroll-snap', 'sin sesión activa', 'data-mover', 'draggable', 'derivada']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('vista: la plantilla trae el selector de carpeta (Elegir…, recientes de Claude, explorar)', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ["'/api/carpetas'", 'function selectorCarpeta', 'Tus proyectos recientes', 'data-carpeta', 'Recientes de Claude', 'Explorar', 'Elige con el botón o pega la ruta', 'data-elegir-carpeta']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('vista: la plantilla trae participar (Asignarme, estado, Terminé, descripción plegable)', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ["'/api/integraciones/asignar'", "'/api/integraciones/estado'", 'Asignarme', 'Quitarme', 'data-asignar', 'data-estado-item', 'data-termine', '✓ Terminé', 'value="participar"', 'Participar: ver el backlog del equipo', 'ver descripción', 'function controlesParticipar', 'function estadoHecho']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('crear proyecto: previa sin escribir, id inválido o duplicado y rutas inexistentes → 400, mtime viejo → 409', async () => {
  const docsNuevo = join(dir, 'docs-nuevo')
  mkdirSync(docsNuevo)
  const antes = readFileSync(CONF, 'utf8')
  const pv = await post('/api/proyectos/crear', { id: 'nuevo', nombre: '  Nuevo   proyecto ', docs: docsNuevo, previa: true })
  assert.equal(pv.estado, 200, pv.json.error)
  assert.deepEqual(pv.json.proyecto, { id: 'nuevo', nombre: 'Nuevo proyecto', docs: [docsNuevo] })
  assert.equal(readFileSync(CONF, 'utf8'), antes)
  for (const [cuerpo, re] of [
    [{ id: 'Con Espacios', nombre: 'x' }, /minúsculas/],
    [{ id: 'prueba', nombre: 'x' }, /Ya hay un proyecto/],
    [{ id: 'otro', nombre: '' }, /Falta el nombre/],
    [{ id: 'otro', nombre: 'x', repo: join(dir, 'no-existe') }, /no es una carpeta/],
    [{ id: 'otro', nombre: 'x', docs: ['relativa/docs'] }, /absoluta/],
    [{ id: 'otro', nombre: 'x', docs: [BACKLOG] }, /no es una carpeta/],
  ]) {
    const r = await post('/api/proyectos/crear', { ...cuerpo, mtime: await mtime() })
    assert.equal(r.estado, 400, JSON.stringify(cuerpo))
    assert.match(r.json.error, re)
  }
  const m = await mtime()
  assert.equal((await post('/api/proyectos/crear', { id: 'nuevo', nombre: 'Nuevo', docs: docsNuevo, mtime: m - 1000 })).estado, 409)
  assert.equal((await post('/api/proyectos/crear', { id: 'nuevo', nombre: 'Nuevo', docs: docsNuevo })).estado, 400, 'sin mtime no escribe')
  assert.equal((await post('/api/proyectos/crear', { id: 'nuevo', nombre: 'Nuevo', docs: docsNuevo, mtime: m }, { origin: 'http://evil.com' })).estado, 403)
  assert.equal(readFileSync(CONF, 'utf8'), antes)
  const r = await post('/api/proyectos/crear', { id: 'nuevo', nombre: 'Nuevo', repo: dir, docs: [docsNuevo], mtime: m })
  assert.equal(r.estado, 200, r.json.error)
  const conf = JSON.parse(readFileSync(CONF, 'utf8'))
  assert.deepEqual(conf.slice(0, -1), JSON.parse(antes), 'los proyectos de antes quedan igual')
  assert.deepEqual(conf.at(-1), { id: 'nuevo', nombre: 'Nuevo', repo: dir, transcripciones: dir.replace(/[^A-Za-z0-9]/g, '-'), docs: [docsNuevo] })
  assert.ok(r.json.datos.proyectos.some((p) => p.id === 'nuevo'))
  assert.equal((await post('/api/proyectos/crear', { id: 'nuevo', nombre: 'Otra vez', mtime: await mtime() })).estado, 400)
})

test('crear backlog: sin docs, nombre con ruta o fuera del patrón → 400; existente → 409 sin tocarlo; previa no escribe', async () => {
  const docsNuevo = join(dir, 'docs-nuevo')
  assert.match((await post('/api/backlog/crear', { proyecto: 'eap10' })).json.error, /no tiene carpeta de documentos/)
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nada' })).estado, 404)
  for (const archivo of ['../BACKLOG.md', 'sub/BACKLOG.md', '/tmp/BACKLOG.md', 'BACKLOG..md', 'NOTAS.md', 'BACKLOG.txt']) {
    assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo', archivo })).estado, 400, archivo)
  }
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo', carpeta: dir })).estado, 400, 'carpeta que no es docs del proyecto')
  const ex = await post('/api/backlog/crear', { proyecto: 'prueba', archivo: 'BACKLOG_PRUEBA.md' })
  assert.equal(ex.estado, 409)
  assert.match(ex.json.error, /nunca sobrescribe/)
  const antesPrueba = readFileSync(BACKLOG, 'utf8')
  assert.equal((await post('/api/backlog/crear', { proyecto: 'prueba', archivo: 'BACKLOG_PRUEBA.md', previa: true })).estado, 409)
  assert.equal(readFileSync(BACKLOG, 'utf8'), antesPrueba)
  const pv = await post('/api/backlog/crear', { proyecto: 'nuevo', previa: true })
  assert.equal(pv.estado, 200, pv.json.error)
  assert.equal(pv.json.archivo, 'BACKLOG.md')
  assert.match(pv.json.contenido, /^# Backlog — Nuevo\n\n## Estado\n- \d{4}-\d{2}-\d{2} · /)
  assert.match(pv.json.contenido, /\n## H1 — .*\nHistoria: .*\n\n### S1 — .*\nSe espera: .*\n- \[ \] .+ — /)
  assert.ok(!existsSync(join(docsNuevo, 'BACKLOG.md')))
  const r = await post('/api/backlog/crear', { proyecto: 'nuevo' })
  assert.equal(r.estado, 200, r.json.error)
  assert.equal(readFileSync(join(docsNuevo, 'BACKLOG.md'), 'utf8'), pv.json.contenido)
  const b = (await get('/api/datos')).json.proyectos.find((p) => p.id === 'nuevo').backlogs
  assert.deepEqual(b.map((x) => [x.archivo, x.total]), [['BACKLOG.md', 1]])
  writeFileSync(join(docsNuevo, 'BACKLOG.md'), 'editado a mano\n')
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo' })).estado, 409)
  assert.equal(readFileSync(join(docsNuevo, 'BACKLOG.md'), 'utf8'), 'editado a mano\n')
  const otro = await post('/api/backlog/crear', { proyecto: 'nuevo', archivo: 'BACKLOG_NUEVO.md' })
  assert.equal(otro.estado, 200, otro.json.error)
  assert.ok(existsSync(join(docsNuevo, 'BACKLOG_NUEVO.md')))
  // Backlog secundario con nombre: archivo derivado, título con el nombre, el principal intacto.
  const sec = await post('/api/backlog/crear', { proyecto: 'nuevo', nombre: '  Sprint 3 — Diseño ', previa: true })
  assert.equal(sec.estado, 200, sec.json.error)
  assert.equal(sec.json.archivo, 'BACKLOG_SPRINT_3_DISENO.md')
  assert.match(sec.json.contenido, /^# Backlog — Nuevo · Sprint 3 — Diseño\n/)
  assert.ok(!existsSync(join(docsNuevo, 'BACKLOG_SPRINT_3_DISENO.md')), 'la previa no escribe')
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo', nombre: 'Sprint 3 — Diseño' })).estado, 200)
  assert.ok(existsSync(join(docsNuevo, 'BACKLOG_SPRINT_3_DISENO.md')))
  assert.equal(readFileSync(join(docsNuevo, 'BACKLOG.md'), 'utf8'), 'editado a mano\n', 'el principal no se toca')
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo', nombre: 'sprint 3 diseño' })).estado, 409, 'mismo nombre → mismo archivo → no sobrescribe')
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo', nombre: '***' })).estado, 400, 'nombre sin letras ni números')
  assert.equal((await post('/api/backlog/crear', { proyecto: 'nuevo', nombre: 'x', archivo: 'BACKLOG_Y.md' })).estado, 400, 'nombre o archivo, no ambos')
})

test('editar proyecto: 404, 400, 409 y previa no escriben; editar deja integraciones y demás proyectos intactos', async () => {
  const antes = readFileSync(CONF, 'utf8')
  const eap = () => JSON.parse(readFileSync(CONF, 'utf8')).find((p) => p.id === 'eap10')
  const integ = eap().integraciones
  const docsEap = join(dir, 'docs-eap10')
  mkdirSync(docsEap)
  assert.equal((await post('/api/proyectos/editar', { id: 'nada', cambios: { nombre: 'x' }, mtime: await mtime() })).estado, 404)
  for (const [cambios, re] of [
    [{ repo: join(dir, 'no-existe') }, /no es una carpeta/],
    [{ docs: ['relativa'] }, /absoluta/],
    [{ notas: join(dir, 'no-existe', 'N.md') }, /carpeta que exista/],
    [{ nombre: '  ' }, /nombre/],
    [{ integraciones: [] }, /no se edita/],
    [{ transcripciones: '../x' }, /transcripciones/],
  ]) {
    const r = await post('/api/proyectos/editar', { id: 'eap10', cambios, mtime: await mtime() })
    assert.equal(r.estado, 400, JSON.stringify(cambios))
    assert.match(r.json.error, re)
  }
  const cambios = { repo: dir, docs: [docsEap], notas: join(docsEap, 'NOTAS.md') }
  const pv = await post('/api/proyectos/editar', { id: 'eap10', cambios, previa: true })
  assert.equal(pv.estado, 200, pv.json.error)
  assert.deepEqual(pv.json.proyecto, { ...eap(), ...cambios, transcripciones: dir.replace(/[^A-Za-z0-9]/g, '-') })
  assert.equal((await post('/api/proyectos/editar', { id: 'eap10', cambios, mtime: (await mtime()) - 1000 })).estado, 409)
  assert.equal((await post('/api/proyectos/editar', { id: 'eap10', cambios })).estado, 400, 'sin mtime no escribe')
  assert.equal(readFileSync(CONF, 'utf8'), antes)
  const r = await post('/api/proyectos/editar', { id: 'eap10', cambios, mtime: await mtime() })
  assert.equal(r.estado, 200, r.json.error)
  assert.deepEqual(eap().integraciones, integ, 'las integraciones quedan intactas')
  assert.deepEqual(eap(), pv.json.proyecto)
  const otros = (t) => JSON.parse(t).filter((p) => p.id !== 'eap10')
  assert.deepEqual(otros(readFileSync(CONF, 'utf8')), otros(antes))
  const p = r.json.datos.proyectos.find((x) => x.id === 'eap10')
  assert.equal(p.editable.repo, dir)
  assert.deepEqual(Object.fromEntries(p.configuracion.map((x) => [x.paso, x.hecho])).docs, true)
  // Quitar un campo: '' lo borra; «nombre» no se puede quitar.
  const q = await post('/api/proyectos/editar', { id: 'eap10', cambios: { notas: '' }, mtime: await mtime() })
  assert.equal(q.estado, 200, q.json.error)
  assert.ok(!('notas' in eap()))
  assert.deepEqual(eap().integraciones, integ)
})

test('importar a .md: previa no escribe; crea BACKLOG_<ID>.md con marcas ado:; «solo mías»; existente → 409; sin docs o sin lectura → 400', async () => {
  process.env.AZURE_DEVOPS_PAT = 'pat-importar-12345'
  const docs = join(dir, 'docs-imp')
  mkdirSync(docs, { recursive: true })
  const integ = { id: 'ado', tipo: 'azure-devops', modo: 'lectura', organizacion: 'Org', proyecto: 'EAP10', tipoItem: '*' }
  const conf = JSON.parse(readFileSync(CONF, 'utf8'))
  conf.push({ id: 'imp', nombre: 'Importa', docs: [docs], integraciones: [integ, { id: 'gh2', tipo: 'github-projects', propietario: 'u', numero: 1, backlog: 'BACKLOG_PRUEBA.md' }] })
  conf.push({ id: 'sd', nombre: 'Sin docs', integraciones: [integ] })
  writeFileSync(CONF, JSON.stringify(conf))
  const destino = join(docs, 'BACKLOG_IMP.md')
  const base = { proyecto: 'imp', integracion: 'ado' }
  const pv = await post('/api/integraciones/importar', { ...base, previa: true })
  assert.equal(pv.estado, 200, pv.json.error)
  assert.equal(pv.json.archivo, 'BACKLOG_IMP.md')
  assert.ok(!existsSync(destino), 'la previa no escribe')
  assert.match(pv.json.contenido, /^- \[ \] Mía <!-- ado:1 -->$/m)
  assert.match(pv.json.contenido, /^- \[x\] Sin asignar <!-- ado:2 -->$/m)
  assert.match(pv.json.contenido, /^## Active$/m)
  assert.match(pv.json.contenido, /^### Bug$/m)
  assert.deepEqual([pv.json.total, pv.json.tipos.sort()], [2, ['Bug', 'Task']])
  // Solo mías: nada más que el ítem 1.
  const mias = await post('/api/integraciones/importar', { ...base, soloMias: true, previa: true })
  assert.equal(mias.json.total, 1)
  assert.ok(!mias.json.contenido.includes('ado:2'))
  // Validaciones: no escriben.
  assert.equal((await post('/api/integraciones/importar', { proyecto: 'sd', integracion: 'ado' })).estado, 400, 'sin docs')
  assert.equal((await post('/api/integraciones/importar', { proyecto: 'imp', integracion: 'gh2' })).estado, 400, 'no es de solo lectura')
  assert.equal((await post('/api/integraciones/importar', { proyecto: 'imp', integracion: 'nada' })).estado, 404)
  assert.equal((await post('/api/integraciones/importar', { ...base, archivo: '../BACKLOG_X.md' })).estado, 400)
  assert.equal((await post('/api/integraciones/importar', { ...base }, { origin: 'http://evil.com' })).estado, 403)
  assert.ok(!existsSync(destino))
  const r = await post('/api/integraciones/importar', base)
  assert.equal(r.estado, 200, r.json.error)
  assert.equal(readFileSync(destino, 'utf8'), pv.json.contenido)
  assert.ok(r.json.datos.proyectos.find((p) => p.id === 'imp').backlogs.some((b) => b.archivo === 'BACKLOG_IMP.md'))
  // Nunca sobrescribe.
  const antes = readFileSync(destino, 'utf8')
  assert.equal((await post('/api/integraciones/importar', base)).estado, 409)
  assert.equal((await post('/api/integraciones/importar', { ...base, previa: true })).estado, 409)
  assert.equal(readFileSync(destino, 'utf8'), antes)
  // Con nombre: otro backlog secundario, sin tocar el ya importado.
  const sec = await post('/api/integraciones/importar', { ...base, nombre: 'Azure mías', soloMias: true })
  assert.equal(sec.estado, 200, sec.json.error)
  assert.equal(sec.json.archivo, 'BACKLOG_AZURE_MIAS.md')
  assert.match(readFileSync(join(docs, 'BACKLOG_AZURE_MIAS.md'), 'utf8'), /^# Backlog — Importa · Azure mías\n/)
  assert.equal(readFileSync(destino, 'utf8'), antes)
  assert.equal(escrituras.length, 0, 'no se escribe nada en Azure')
})

test('vista: «Crear backlog local desde Azure» con vista previa, «solo las mías» y paso a modo sincronizar', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['data-crear="importar"', "'/api/integraciones/importar'", 'data-crear-check="soloMias"', 'Crear backlog local desde Azure', 'abrirForm(']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('vista: Resumen con el avance de la integración y botón «Mis tareas» en la cabecera', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['function avanceIntegracion', 'id="ir-mias"', 'data-ir-mias', 'Cerrados por semana', 'function pintarBotonMias']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('/api/sesiones: sesiones recientes por proyecto, barato, sin tocar la huella; /api/datos trae sesiones y kanban', async () => {
  writeFileSync(BACKLOG, readFileSync(BACKLOG, 'utf8').replace('- [x] Uno', '- [ ] Uno')) // un test anterior la marcó
  const r = join(TR, '-prueba', 'hhhh9999-0000.jsonl')
  writeFileSync(r, JSON.stringify({ type: 'custom-title', customTitle: 'En vivo' }) + '\n' + JSON.stringify({ type: 'user', gitBranch: 'kb', timestamp: new Date().toISOString(), message: { content: 'Sesión S1 de BACKLOG_PRUEBA.md' } }) + '\n')
  await get('/api/datos') // calienta la caché de datos
  const v = (await get('/api/version')).json.version
  const t0 = Date.now()
  const s = await get('/api/sesiones')
  assert.ok(Date.now() - t0 < 300, 'no construye los datos')
  assert.equal(s.estado, 200)
  const mia = s.json.sesiones.prueba.find((x) => x.titulo === 'En vivo')
  assert.equal(mia.activa, true)
  assert.equal(mia.rama, 'kb')
  assert.ok(Array.isArray(s.json.columnas.prueba), 'estado de cada tarjeta para repintar')
  assert.equal(s.json.columnas.prueba.find((c) => c.texto === 'Uno')?.estado, 'en-curso')
  writeFileSync(r, readFileSync(r, 'utf8') + JSON.stringify({ type: 'user', message: { content: 'más' } }) + '\n')
  assert.equal((await get('/api/version')).json.version, v, 'la actividad de Claude no entra en la huella')
  assert.equal((await get('/api/sesiones', { host: `evil.com:${puerto}` })).estado, 403)
  const d = (await get('/api/datos')).json
  assert.ok(d.sesiones?.prueba)
  assert.ok(Array.isArray(d.proyectos[0].kanban))
  assert.equal(d.proyectos[0].kanban.find((c) => c.texto === 'Uno').archivo, 'BACKLOG_PRUEBA.md')
})

test('/api/carpetas: sin ruta → home + sugerencias; con ruta → subcarpetas y propuesta; nunca fuera de home ni archivos; solo con Origin', async () => {
  const repo = join(dir, 'repo-sugerido')
  mkdirSync(join(repo, '.git'), { recursive: true })
  mkdirSync(join(repo, 'docs'), { recursive: true })
  const tr = join(TR, repo.replace(/[^A-Za-z0-9]/g, '-'))
  mkdirSync(tr, { recursive: true })
  writeFileSync(join(tr, 'ssss0000.jsonl'), JSON.stringify({ type: 'user', cwd: repo, timestamp: new Date().toISOString(), message: { content: 'hola' } }) + '\n')
  const h = await post('/api/carpetas', {})
  assert.equal(h.estado, 200, h.json.error)
  assert.equal(h.json.ruta, dir)
  assert.equal(h.json.padre, null)
  assert.ok(h.json.carpetas.some((c) => c.nombre === 'repo-sugerido' && c.esGit))
  assert.ok(!h.json.carpetas.some((c) => c.nombre.endsWith('.md') || c.nombre.endsWith('.json')), 'nunca lista archivos')
  assert.deepEqual(h.json.sugerencias.map((s) => s.ruta), [repo])
  const r = await post('/api/carpetas', { ruta: repo })
  assert.equal(r.estado, 200, r.json.error)
  assert.deepEqual(r.json.carpetas.map((c) => c.nombre), ['docs'])
  assert.equal(r.json.propuesta.id, 'repo-sugerido')
  assert.ok(!('sugerencias' in r.json))
  for (const ruta of ['/etc', join(dir, '..'), join(dir, 'no-existe'), BACKLOG]) assert.equal((await post('/api/carpetas', { ruta })).estado, 400, ruta)
  assert.equal((await post('/api/carpetas', {}, { origin: 'http://evil.com' })).estado, 403)
})

test('participar (S37): asignar y estado solo en «participar» (400 en lectura/sincronizar/otros conectores), nunca crea ni toca .md; parchea externo-<p>.json', async () => {
  process.env.AZURE_DEVOPS_PAT = 'pat-participar-12345'
  const conf = JSON.parse(readFileSync(CONF, 'utf8'))
  conf.push({ id: 'part', nombre: 'Participa', integraciones: [
    { id: 'ado', tipo: 'azure-devops', modo: 'participar', organizacion: 'Org', proyecto: 'EAP10', tipoItem: '*' },
    { id: 'gh3', tipo: 'github-projects', modo: 'participar', propietario: 'u', numero: 1 },
  ] })
  writeFileSync(CONF, JSON.stringify(conf))
  const antesConf = readFileSync(CONF, 'utf8'), antesMd = readFileSync(BACKLOG, 'utf8'), nEscrituras = escrituras.length
  const d = await get('/api/datos')
  assert.equal(d.json.proyectos.find((x) => x.id === 'part').integraciones.find((x) => x.id === 'ado').modo, 'participar')
  // Fuera de «participar» → 400 y no se llama a nada.
  for (const [proyecto, integracion, patron] of [['eap10', 'ado', /participar/], ['prueba', 'gh', /participar/], ['part', 'gh3', /aún no participa/]]) {
    for (const ruta of ['/api/integraciones/asignar', '/api/integraciones/estado']) {
      const r = await post(ruta, { proyecto, integracion, id: '1', aMi: true, estado: 'Closed' })
      assert.equal(r.estado, 400, `${ruta} ${proyecto}/${integracion}`)
      assert.match(r.json.error, patron)
    }
  }
  assert.deepEqual(participaciones, [])
  assert.equal((await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'nada', id: '1', aMi: true })).estado, 404)
  assert.equal((await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'ado', id: 'abc', aMi: true })).estado, 400)
  assert.equal((await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'ado', id: '2' })).estado, 400, 'aMi debe ser sí o no')
  assert.equal((await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'ado', id: '2', aMi: true }, { origin: 'http://evil.com' })).estado, 403)
  assert.deepEqual(participaciones, [])
  // Asignarme: correo por quienSoy (una vez, caché 1 h), ítem parcheado en la respuesta, en datos y en externo-part.json.
  const a = await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'ado', id: '2', aMi: true })
  assert.equal(a.estado, 200, a.json.error)
  assert.deepEqual(a.json.item.asignado, { nombre: 'Yo', correo: 'yo@x' })
  assert.equal(a.json.item.mio, true)
  const enDatos = a.json.datos.proyectos.find((x) => x.id === 'part').integraciones.find((x) => x.id === 'ado').items.find((x) => x.id === '2')
  assert.deepEqual([enDatos.asignado?.correo, enDatos.mio], ['yo@x', true])
  const ext = JSON.parse(readFileSync(join(dir, 'datos', 'externo-part.json'), 'utf8'))
  assert.equal(ext.ado.yo.correo, 'yo@x')
  assert.equal(ext.ado.items.find((x) => x.id === '2').mio, true)
  const q = await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'ado', id: '2', aMi: false })
  assert.equal(q.estado, 200, q.json.error)
  assert.deepEqual([q.json.item.asignado, q.json.item.mio], [null, false])
  assert.deepEqual(participaciones, [['quienSoy'], ['asignar', '2', 'yo@x'], ['asignar', '2', null]])
  // Cambiar estado: solo estados conocidos (las columnas leídas); el adaptador recibe esas columnas.
  assert.equal((await post('/api/integraciones/estado', { proyecto: 'part', integracion: 'ado', id: '1', estado: 'Inventado' })).estado, 400)
  const e = await post('/api/integraciones/estado', { proyecto: 'part', integracion: 'ado', id: '1', estado: 'Closed' })
  assert.equal(e.estado, 200, e.json.error)
  assert.deepEqual([e.json.item.columna, e.json.item.hecha], ['Closed', true])
  assert.deepEqual(participaciones.at(-1), ['cambiarEstado', '1', 'Closed', ['Active', 'Closed']])
  // Azure puede reasignar al cambiar el estado: el ítem queda «mío» en la respuesta y en la caché.
  const re = await post('/api/integraciones/estado', { proyecto: 'part', integracion: 'ado', id: '2', estado: 'Active' })
  assert.equal(re.estado, 200, re.json.error)
  assert.equal(re.json.item.mio, true)
  assert.equal(JSON.parse(readFileSync(join(dir, 'datos', 'externo-part.json'), 'utf8')).ado.items.find((x) => x.id === '2').mio, true)
  // Azure rechaza → 502 con el mensaje y queda en servidor.log.
  const mal = await post('/api/integraciones/asignar', { proyecto: 'part', integracion: 'ado', id: '999', aMi: true })
  assert.equal(mal.estado, 502)
  assert.match(mal.json.error, /rechazó/)
  assert.match(readFileSync(join(dir, 'datos', 'servidor.log'), 'utf8'), /asignar part\/ado #999/)
  // Sincronía sigue cerrada; nada se crea afuera ni se escribe un .md ni proyectos.json.
  assert.equal((await post('/api/sincronia/previa', { proyecto: 'part', integracion: 'ado' })).estado, 400)
  assert.equal(escrituras.length, nEscrituras)
  assert.equal(readFileSync(CONF, 'utf8'), antesConf)
  assert.equal(readFileSync(BACKLOG, 'utf8'), antesMd)
  assert.ok(!existsSync(join(dir, 'datos', 'sync-part-ado.json')))
})

test('vista del formato: llano visible, técnico desplegable, «Se espera» frente a «Resultado», etiquetas y prompt siguiente', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  for (const marca of ['function casillaFormato', 'class="llano"', 'class="tecnico"', 'Se espera', 'Resultado', 'function bloqueEspera', 'class="etq-formato"', 'Épica', 'Historia', 'Tarea', 'data-copiar', 'bloqueEspera(']) assert.ok(html.includes(marca), `falta «${marca}» en la vista`)
})

test('vista del formato: la casilla legada (sin « — ») se muestra como hoy', async () => {
  const html = await (await fetch(`http://127.0.0.1:${puerto}/`)).text()
  assert.ok(/function casillaFormato[\s\S]{0,600}if \(!f\) return inline\(/.test(html), 'casillaFormato debe devolver el texto de siempre si no hay « — »')
  assert.ok(html.includes('class="prompt-siguiente"'), 'el prompt siguiente va en un sitio fijo')
})
