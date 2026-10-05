// Metodología viva (S50): grafo de piezas (hooks, mods, skills, agentes, reglas, carpetas, backlog, notas, bitácora)
// con su estado real en ~/.claude y qué proyectos de proyectos.json las usan.
// El catálogo esperado sale de instalar.sh y claude/settings.base.json del repo `metodologia-claude-code`.
// Nunca devuelve el contenido de settings.json (puede tener tokens en env): solo nombres, estados y rutas con «~».
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

export const ETAPAS = [
  { id: 'planear', nombre: 'Planear' },
  { id: 'sesion', nombre: 'Sesión (hooks)' },
  { id: 'relevo', nombre: 'Relevo' },
  { id: 'backlog', nombre: 'Backlog' },
  { id: 'tablero', nombre: 'Tablero' },
  { id: 'bitacora', nombre: 'Bitácora' },
]
export const ARISTAS = [['planear', 'sesion'], ['sesion', 'relevo'], ['relevo', 'backlog'], ['backlog', 'tablero'], ['backlog', 'bitacora']]

// Etapa y «qué hace» de cada pieza conocida; lo nuevo del instalador cae en «sesion» con una descripción genérica.
const INFO = {
  reglas: ['planear', 'Reglas globales (CLAUDE.md): economía de contexto, tests primero, formato del backlog.'],
  'carpeta:metodologia': ['planear', 'Carpeta de la metodología: contrato FORMATO_BACKLOG.md y scripts de la bitácora.'],
  'agente:buscador': ['planear', 'Subagente de búsqueda barato (Haiku) para explorar sin gastar contexto.'],
  statusline: ['sesion', 'Línea de estado de la terminal con contexto y costo.'],
  'hook:vigilar_contexto.sh': ['sesion', 'Avisa a 110k de contexto y pide relevo a 130k.'],
  'hook:acotar_lectura.mjs': ['sesion', 'Recorta lecturas y salidas largas para no llenar el contexto.'],
  'hook:vigilar_prompt.mjs': ['sesion', 'Avisa si el prompt parece de otra sesión.'],
  'hook:eventos_agentes.mjs': ['sesion', 'Anota qué hace cada agente y subagente (sin prompts ni contenido) para la oficina.'],
  'hook:resumen_semanal.sh': ['sesion', 'Genera el resumen semanal al abrir sesión (una vez por semana).'],
  'hook:generar.mjs --hook-inicio': ['sesion', 'Al abrir sesión, cuenta en qué va el proyecto y las notas abiertas.'],
  'mod:token-weather': ['sesion', 'Mod: clima de tokens de la sesión.'],
  'mod:guardia-produccion': ['sesion', 'Mod: frena comandos contra producción.'],
  'mod:guardia-ramas': ['sesion', 'Mod: avisa al trabajar en la rama principal.'],
  'mod:estado-trabajo': ['sesion', 'Mod: estado del trabajo en curso.'],
  'mod:servidores-locales': ['sesion', 'Mod: servidores locales en marcha.'],
  'mod:panel-tablero': ['sesion', 'Mod: panel con la sesión del backlog en la terminal.'],
  'skill:relevo': ['relevo', 'Skill /relevo: deja el trabajo consistente, actualiza el backlog y hace commit.'],
  backlog: ['backlog', 'Backlogs del proyecto (BACKLOG*.md) con sesiones, casillas y prompts.'],
  'hook:verificar_backlog.mjs --hook': ['backlog', 'Antes de cada commit revisa que el backlog siga el formato y tenga la siguiente sesión.'],
  'carpeta:tablero': ['tablero', 'Enlace ~/.claude/tablero que usan hooks y skills.'],
  'hook:generar.mjs --silencioso': ['tablero', 'Al cerrar sesión regenera el tablero.'],
  notas: ['tablero', 'Notas del usuario para Claude (se atienden al empezar).'],
  'hook:registrar_sesion.sh': ['bitacora', 'Al cerrar sesión anota tokens y costo en la bitácora.'],
  bitacora: ['bitacora', 'Bitácora de sesiones con costo y resultado.'],
}

const SCRIPT = /[\w.-]+\.(?:sh|mjs|js)\b/
// Id de un hook: script + primer flag (`generar.mjs --hook-inicio`), así dos usos del mismo script no se pisan.
function hookDe(cmd) {
  const m = cmd.match(SCRIPT)
  if (!m) return null
  const flag = cmd.slice(m.index + m[0].length).match(/^["']?\s+(--[\w-]+)/)?.[1]
  return { script: m[0], id: `hook:${m[0]}${flag ? ` ${flag}` : ''}`, flag }
}
const comandosHooks = (settings) => Object.entries(settings?.hooks || {}).flatMap(([evento, grupos]) =>
  (Array.isArray(grupos) ? grupos : []).flatMap((g) => (g?.hooks || []).map((h) => ({ evento, cmd: String(h?.command || '') }))))

// Catálogo esperado: [{ id, tipo, nombre, ruta? (relativa a ~/.claude), eventos? }].
export function catalogoDe(instalarTxt, settingsBase) {
  const piezas = new Map()
  const poner = (p) => { if (!piezas.has(p.id)) piezas.set(p.id, p); return piezas.get(p.id) }
  const mods = instalarTxt.match(/^PLUGINS_REPO=\(([^)]*)\)/m)?.[1].trim().split(/\s+/) ?? []
  for (const m of mods) poner({ id: `mod:${m}`, tipo: 'mod', nombre: m, ruta: `mods/${m}` })
  // ln -sfn "$REPO/<origen>" "$CLAUDE_DIR/<destino>"
  for (const [, destino] of instalarTxt.matchAll(/ln -sfn "\$REPO\/[^"]+" "\$CLAUDE_DIR\/([^"]+)"/g)) {
    const nombre = basename(destino)
    if (destino === 'CLAUDE.md') poner({ id: 'reglas', tipo: 'reglas', nombre, ruta: destino })
    else if (destino === 'statusline.sh') poner({ id: 'statusline', tipo: 'statusline', nombre, ruta: destino })
    else if (destino.startsWith('agents/')) poner({ id: `agente:${nombre.replace(/\.md$/, '')}`, tipo: 'agente', nombre, ruta: destino })
    else if (destino.startsWith('skills/')) poner({ id: `skill:${nombre}`, tipo: 'skill', nombre, ruta: destino })
    else if (destino.startsWith('hooks/')) poner({ id: `hook:${nombre}`, tipo: 'hook', nombre, ruta: destino, eventos: [] })
    else poner({ id: `carpeta:${nombre}`, tipo: 'carpeta', nombre, ruta: destino })
  }
  if (/"\$CLAUDE_DIR\/tablero"/.test(instalarTxt)) poner({ id: 'carpeta:tablero', tipo: 'carpeta', nombre: 'tablero', ruta: 'tablero' })
  for (const { evento, cmd } of comandosHooks(settingsBase)) {
    const h = hookDe(cmd)
    if (!h) continue
    const p = poner({ id: h.id, tipo: 'hook', nombre: h.flag ? `${h.script} ${h.flag}` : h.script, eventos: [] })
    p.eventos ??= []
    if (!p.eventos.includes(evento)) p.eventos.push(evento)
  }
  for (const [id, nombre] of [['backlog', 'Backlog'], ['notas', 'Notas'], ['bitacora', 'Bitácora']]) poner({ id, tipo: 'proyecto', nombre })
  return [...piezas.values()]
}

const existeEn = (r) => !!r && !!statSync(r, { throwIfNoEntry: false })
const expandirCon = (home) => (r) => r.replace(/^~(?=\/|$)/, home).replace(/^\$\{?HOME\}?(?=\/|$)/, home)

// Ruta del script dentro del comando (`node "$HOME/x/generar.mjs" --y` → `<home>/x/generar.mjs`).
function rutaEnComando(cmd, script, expandir) {
  const t = cmd.match(new RegExp(`[^\\s"']*${script.replace(/\./g, '\\.')}`))?.[0]
  return t ? expandir(t) : null
}

// Grafo con estado real. `proyectos`: [{ id, nombre, transcripciones?, backlogs (número), notas?, bitacora? }].
export function grafoMetodologia({ home, catalogo, proyectos = [], settings, transcripciones = join(home, '.claude', 'projects'), existe = existeEn }) {
  const claude = join(home, '.claude')
  const expandir = expandirCon(home)
  const conTilde = (r) => (r && r.startsWith(home + '/') ? `~${r.slice(home.length)}` : r)
  if (settings === undefined) { try { settings = JSON.parse(readFileSync(join(claude, 'settings.json'), 'utf8')) } catch { settings = {} } }
  const cmds = comandosHooks(settings)
  const pluginDirs = String(settings?.env?.CLAUDE_CODE_PLUGIN_DIRS || '').split(':').filter(Boolean).map(expandir)

  // Conectado = tiene sesiones de Claude: su carpeta en ~/.claude/projects o una subcarpeta (`<t>-sub`).
  let carpetas = []
  try { carpetas = readdirSync(transcripciones) } catch {}
  const conSesiones = (t) => !!t && (existe(join(transcripciones, t)) || carpetas.some((d) => d.startsWith(`${t}-`)))
  const conectados = proyectos.map((p) => ({ id: p.id, nombre: p.nombre ?? p.id, conectado: conSesiones(p.transcripciones) }))
  const idsConectados = conectados.filter((p) => p.conectado).map((p) => p.id)
  const usanProyecto = {
    backlog: proyectos.filter((p) => (p.backlogs || 0) > 0).map((p) => p.id),
    notas: proyectos.filter((p) => p.notas && existe(expandir(p.notas))).map((p) => p.id),
    bitacora: proyectos.filter((p) => p.bitacora && existe(expandir(p.bitacora))).map((p) => p.id),
  }

  const estadoDe = (p) => {
    const ruta = p.ruta ? join(claude, p.ruta) : null
    if (p.tipo === 'proyecto') {
      const usan = usanProyecto[p.id] || []
      return usan.length ? { estado: 'activa', proyectos: usan } : { estado: 'falta', motivo: 'ningún proyecto lo tiene', proyectos: [] }
    }
    if (p.tipo === 'mod') {
      const enDirs = pluginDirs.find((d) => basename(d) === p.nombre)
      if (enDirs) return existe(enDirs) ? { estado: 'activa', ruta: enDirs } : { estado: 'falta', motivo: 'CLAUDE_CODE_PLUGIN_DIRS apunta a una carpeta que no existe', ruta: enDirs }
      return existe(ruta) ? { estado: 'instalada', motivo: 'no está en CLAUDE_CODE_PLUGIN_DIRS', ruta } : { estado: 'falta', motivo: 'no instalado', ruta }
    }
    if (p.tipo === 'hook' || p.tipo === 'statusline') {
      const script = p.tipo === 'statusline' ? 'statusline.sh' : p.nombre.split(' ')[0]
      const flag = p.tipo === 'hook' ? p.nombre.split(' ')[1] : null
      const llamada = p.tipo === 'statusline'
        ? (String(settings?.statusLine?.command || '').includes(script) ? String(settings.statusLine.command) : null)
        : cmds.map((c) => c.cmd).find((c) => hookDe(c)?.id === p.id)
      if (llamada) {
        const r = rutaEnComando(llamada, script, expandir)
        // Sin ruta absoluta (p. ej. `node script.mjs`) no se puede comprobar: se da por activa.
        if (!r || !r.startsWith('/')) return { estado: 'activa', ruta: r }
        return existe(r) ? { estado: 'activa', ruta: r } : { estado: 'falta', motivo: `settings.json lo llama pero ${conTilde(r)} no existe`, ruta: r }
      }
      if (ruta && existe(ruta)) return { estado: 'instalada', motivo: 'existe pero settings.json no lo llama', ruta }
      return { estado: 'falta', motivo: flag ? `settings.json no llama a ${script} ${flag}` : 'no instalado', ruta }
    }
    return existe(ruta) ? { estado: 'activa', ruta } : { estado: 'falta', motivo: 'no instalado', ruta }
  }

  // Hooks que solo viven en el settings.json del usuario (no en settings.base.json) también son piezas.
  const conocidos = new Set(catalogo.map((p) => p.id))
  const sueltos = []
  for (const { evento, cmd } of cmds) {
    const h = hookDe(cmd)
    if (!h) continue
    let p = sueltos.find((x) => x.id === h.id)
    if (!p && !conocidos.has(h.id)) sueltos.push(p = { id: h.id, tipo: 'hook', nombre: h.flag ? `${h.script} ${h.flag}` : h.script, eventos: [] })
    if (p && !p.eventos.includes(evento)) p.eventos.push(evento)
  }
  const piezas = [...catalogo, ...sueltos].map((p) => {
    const [etapa, descripcion] = INFO[p.id] || ['sesion', `${p.tipo} ${p.nombre}`]
    const e = estadoDe(p)
    return {
      id: p.id, tipo: p.tipo, nombre: p.nombre, etapa, descripcion,
      ...(p.eventos ? { eventos: p.eventos } : {}),
      estado: e.estado, ...(e.motivo ? { motivo: e.motivo } : {}),
      ruta: conTilde(e.ruta) ?? null,
      proyectos: e.proyectos ?? (e.estado === 'activa' ? idsConectados : []),
    }
  })
  const etapas = ETAPAS.map((x) => {
    const de = piezas.filter((p) => p.etapa === x.id)
    const estado = de.some((p) => p.estado === 'falta') ? 'falta' : de.every((p) => p.estado === 'activa') ? 'ok' : 'parcial'
    return { ...x, estado, piezas: de.map((p) => p.id) }
  })
  return { etapas, aristas: ARISTAS, piezas, proyectos: conectados }
}

// Lee instalar.sh y settings.base.json del repo; sin repo devuelve el grafo vacío con un aviso.
export function metodologia({ home, repo, proyectos, transcripciones }) {
  let instalar, base
  try {
    instalar = readFileSync(join(repo, 'instalar.sh'), 'utf8')
    base = JSON.parse(readFileSync(join(repo, 'claude', 'settings.base.json'), 'utf8'))
  } catch {
    return { ...grafoMetodologia({ home, catalogo: [], proyectos, transcripciones }), aviso: 'No encontré instalar.sh del repo metodologia-claude-code (define TABLERO_METODOLOGIA_REPO).' }
  }
  return grafoMetodologia({ home, catalogo: catalogoDe(instalar, base), proyectos, transcripciones })
}
