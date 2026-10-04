// Sincronía backlog ↔ app externa (GitHub Projects, Trello, Azure DevOps). Sin dependencias.
// El vínculo casilla↔tarjeta es un comentario al final de la línea: «- [ ] Texto <!-- gh:PVTI_x -->».
// Nunca se borra nada en ningún lado: lo que desaparece solo se informa.

const RE_MARCA = /\s*<!--\s*([A-Za-z][\w-]*):([^\s<>]+)\s*-->/g
const RE_TAREA = /^(\s*)([-*]) \[([ xX])\]\s?(.*)$/
const RE_TITULO = /^(#{2,3})\s+(.+?)\s*#*\s*$/
const RE_CERCA = /^\s*(```|~~~)/
const plano = (t) => String(t).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '').trim()
export const MAX_TITULO = 240

// «Texto <!-- trello:abc --> <!-- gh:x -->» → { texto: 'Texto', marcas: { trello: 'abc', gh: 'x' } }
export function extraerMarcas(texto) {
  const marcas = {}
  const limpio = String(texto).replace(RE_MARCA, (_, k, v) => { marcas[k] = v; return '' }).trimEnd()
  return { texto: limpio, marcas }
}

// Pone (o reemplaza) la marca de una integración al final de una línea de casilla, sin tocar sangría ni texto.
export function ponerMarca(linea, integracion, id) {
  const sinEsa = linea.replace(RE_MARCA, (m, k) => k === integracion ? '' : m).trimEnd()
  return `${sinEsa} <!-- ${integracion}:${id} -->`
}

// Título que se usa afuera (y para comparar): texto plano, una línea, recortado.
export function tituloDe(texto) {
  const t = plano(extraerMarcas(texto).texto).replace(/\s+/g, ' ')
  return t.length > MAX_TITULO ? t.slice(0, MAX_TITULO - 1).trimEnd() + '…' : t
}

// Casillas de primer nivel del backlog (fuera de bloques de código), con su línea, sección y subtareas.
export function tareasLocales(contenido, integracion) {
  const tareas = []
  let seccion = null, cerca = false, pila = []
  String(contenido).split('\n').forEach((crudo, i) => {
    const linea = crudo.replace(/\t/g, '    ')
    if (RE_CERCA.test(linea)) { cerca = !cerca; return }
    if (cerca) return
    const t = linea.match(RE_TITULO)
    if (t) { const tit = plano(t[2]); seccion = (tit.match(/^([HS]\d+[a-z]?)\b/) || [])[1] || tit.split(/\s+[—–-]\s+|\s+·\s+/)[0].slice(0, 60); pila = []; return }
    const m = linea.match(RE_TAREA)
    if (!m) return
    const sangria = m[1].length
    while (pila.length && pila.at(-1).sangria >= sangria) pila.pop()
    const { texto, marcas } = extraerMarcas(m[4])
    const hecha = m[3] !== ' '
    if (pila.length) { pila[0].tarea.subtareas.push({ texto: plano(texto), hecha }); pila.push({ sangria }); return }
    const tarea = { linea: i, texto, titulo: tituloDe(texto), hecha, marca: marcas[integracion] || null, seccion, subtareas: [] }
    tareas.push(tarea)
    pila.push({ sangria, tarea })
  })
  return tareas
}

// Comparación a tres bandas por ítem vinculado. Devuelve acciones (ninguna borra):
// crear-fuera · actualizar-fuera · actualizar-local · conflicto · traer · huerfana
const normalizar = (externos) => externos.map((x) => ({ ...x, titulo: tituloDe(x.titulo), hecha: !!x.hecha }))
export function planificarSincronia(locales, externosCrudos, instantanea = {}) {
  const acciones = [], externos = normalizar(externosCrudos)
  const porId = new Map(externos.map((x) => [x.id, x]))
  const vinculados = new Set()
  for (const l of locales) {
    if (!l.marca) {
      acciones.push({ clave: `crear-fuera:L${l.linea}`, tipo: 'crear-fuera', linea: l.linea, titulo: l.titulo, hecha: l.hecha, seccion: l.seccion, texto: l.texto, subtareas: l.subtareas })
      continue
    }
    vinculados.add(l.marca)
    const x = porId.get(l.marca)
    if (!x) { acciones.push({ clave: `huerfana:${l.marca}`, tipo: 'huerfana', id: l.marca, linea: l.linea, titulo: l.titulo }); continue }
    const base = instantanea[l.marca]
    const fuera = {}, dentro = {}, choque = {}
    for (const campo of ['titulo', 'hecha']) {
      if (l[campo] === x[campo]) continue
      // Sin instantanea no se sabe quién cambió: se trata como cambio en ambos lados.
      const cambioDentro = !base || l[campo] !== base[campo]
      const cambioFuera = !base || x[campo] !== base[campo]
      if (cambioDentro && cambioFuera) choque[campo] = { local: l[campo], externo: x[campo] }
      else if (cambioDentro) fuera[campo] = l[campo]
      else dentro[campo] = x[campo]
    }
    const comun = { id: l.marca, linea: l.linea, titulo: l.titulo, url: x.url }
    if (Object.keys(choque).length) {
      acciones.push({ clave: `conflicto:${l.marca}`, tipo: 'conflicto', ...comun, campos: choque,
        local: { titulo: l.titulo, hecha: l.hecha }, externo: { titulo: x.titulo, hecha: x.hecha } })
      continue
    }
    if (Object.keys(fuera).length) acciones.push({ clave: `actualizar-fuera:${l.marca}`, tipo: 'actualizar-fuera', ...comun, cambios: fuera })
    if (Object.keys(dentro).length) acciones.push({ clave: `actualizar-local:${l.marca}`, tipo: 'actualizar-local', ...comun, cambios: dentro })
  }
  for (const x of externos) {
    if (!vinculados.has(x.id)) acciones.push({ clave: `traer:${x.id}`, tipo: 'traer', id: x.id, titulo: x.titulo, hecha: x.hecha, url: x.url, columna: x.columna })
  }
  return acciones
}

// Cuerpo de la tarjeta externa: el texto completo si se recortó y las subtareas como checklist.
export function descripcionDe(a) {
  const partes = []
  if (plano(a.texto || '') !== a.titulo) partes.push(plano(a.texto))
  if (a.subtareas?.length) partes.push(a.subtareas.map((s) => `- [${s.hecha ? 'x' : ' '}] ${s.texto}`).join('\n'))
  if (a.seccion) partes.push(`Sección: ${a.seccion}`)
  return partes.join('\n\n')
}

// Cambia una línea de casilla: estado y/o texto, conservando sangría, viñeta y marcas.
function editarLinea(linea, { hecha, titulo }) {
  const m = linea.match(RE_TAREA)
  if (!m) return linea
  const { texto, marcas } = extraerMarcas(m[4])
  const casilla = hecha === undefined ? m[3] : hecha ? 'x' : ' '
  const nuevo = titulo === undefined ? texto : titulo
  return `${m[1]}${m[2]} [${casilla}] ${nuevo}${Object.entries(marcas).map(([k, v]) => ` <!-- ${k}:${v} -->`).join('')}`
}

// Añade casillas al final de «## Entrante (<integración>)» (la crea al final del archivo si falta).
function anadirEntrantes(lineas, integracion, nuevas) {
  if (!nuevas.length) return lineas
  const titulo = `## Entrante (${integracion})`
  let ini = lineas.findIndex((l) => l.trim() === titulo)
  if (ini < 0) {
    while (lineas.length && !lineas.at(-1).trim()) lineas.pop()
    lineas.push('', titulo, '', ...nuevas, '')
    return lineas
  }
  let fin = lineas.findIndex((l, i) => i > ini && /^#{1,2}\s/.test(l))
  if (fin < 0) fin = lineas.length
  let pos = fin
  while (pos > ini + 1 && !lineas[pos - 1].trim()) pos--
  lineas.splice(pos, 0, ...nuevas)
  return lineas
}

// Aplica las acciones elegidas. Orden: primero afuera (crear/actualizar), luego UNA reescritura del .md,
// luego la instantánea. elegidas = Set de claves; resoluciones = { 'conflicto:<id>': 'local' | 'externo' }.
// Devuelve { contenido, instantanea, resultados } (no escribe archivos: eso lo hace quien llama).
export async function aplicarSincronia({ contenido, integracion, acciones, elegidas, resoluciones = {}, externos, instantanea = {}, adaptador, cfg, cred, ahora = new Date().toISOString() }) {
  const lineas = String(contenido).split('\n')
  const estadoFuera = new Map(normalizar(externos).map((x) => [x.id, { titulo: x.titulo, hecha: x.hecha }]))
  const resultados = [], entrantes = []
  const elegida = (a) => elegidas === true || elegidas.has(a.clave)
  for (let a of acciones) {
    if (!elegida(a) || a.tipo === 'huerfana') continue
    if (a.tipo === 'conflicto') {
      const lado = resoluciones[a.clave]
      if (lado !== 'local' && lado !== 'externo') { resultados.push({ clave: a.clave, ok: false, error: 'Conflicto sin resolver: elige un lado.' }); continue }
      a = lado === 'local'
        ? { ...a, tipo: 'actualizar-fuera', cambios: { ...a.local } }
        : { ...a, tipo: 'actualizar-local', cambios: { ...a.externo } }
    }
    try {
      if (a.tipo === 'crear-fuera') {
        const r = await adaptador.crear(cfg, cred, { titulo: a.titulo, hecha: a.hecha, seccion: a.seccion, descripcion: descripcionDe(a) })
        lineas[a.linea] = ponerMarca(lineas[a.linea], integracion, r.id)
        estadoFuera.set(r.id, { titulo: a.titulo, hecha: a.hecha })
        resultados.push({ clave: a.clave, ok: true, id: r.id, url: r.url })
      } else if (a.tipo === 'actualizar-fuera') {
        await adaptador.actualizar(cfg, cred, a.id, a.cambios)
        estadoFuera.set(a.id, { ...estadoFuera.get(a.id), ...a.cambios })
        resultados.push({ clave: a.clave, ok: true })
      } else if (a.tipo === 'actualizar-local') {
        lineas[a.linea] = editarLinea(lineas[a.linea], a.cambios)
        resultados.push({ clave: a.clave, ok: true })
      } else if (a.tipo === 'traer') {
        entrantes.push(`- [${a.hecha ? 'x' : ' '}] ${a.titulo.replace(/\s*\n\s*/g, ' ')} <!-- ${integracion}:${a.id} -->`)
        resultados.push({ clave: a.clave, ok: true })
      }
    } catch (e) {
      resultados.push({ clave: a.clave, ok: false, error: String(e?.message || e) })
    }
  }
  const nuevo = anadirEntrantes(lineas, integracion, entrantes).join('\n')
  // Instantánea: cada ítem vinculado cuyo estado coincide en ambos lados. Si aún difieren (acción no
  // elegida o fallida), se conserva la anterior para que la próxima vista previa lo vuelva a mostrar.
  const snap = {}
  for (const l of tareasLocales(nuevo, integracion)) {
    if (!l.marca) continue
    const x = estadoFuera.get(l.marca)
    if (x && x.titulo === l.titulo && x.hecha === l.hecha) snap[l.marca] = { titulo: l.titulo, hecha: l.hecha, fecha: instantanea[l.marca]?.titulo === l.titulo && instantanea[l.marca]?.hecha === l.hecha ? instantanea[l.marca].fecha : ahora }
    else if (instantanea[l.marca]) snap[l.marca] = instantanea[l.marca]
  }
  return { contenido: nuevo, instantanea: snap, resultados }
}
