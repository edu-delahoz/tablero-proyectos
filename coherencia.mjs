// Coherencia backlog ↔ GitHub ↔ backlog padre. Puro y sin dependencias (lo usan el tablero,
// el hook de inicio y verificar_backlog.mjs, que bloquea `gh pr create/merge`).
//
// Convención de casillas:  [x] hecho · [ ] pendiente · [~] a medias (cuenta como pendiente)
//                          [-] descartado o movido a otra sesión (con nota: «→ S5b»); no bloquea.
// Jerarquía: un PLAN saca un BACKLOG (hitos «## H4 — …») y cada hito puede tener su
// sub-backlog BACKLOG_H4.md (sesiones «## S1 — … · rama `x`»).

const RE_TITULO = /^(#{2,3})\s+(.+?)\s*#*\s*$/
const RE_CASILLA = /^\s*[-*] \[([ xX~-])\]\s?(.*)$/
const RE_CERCA = /^\s*(```|~~~)/
const RE_CERRADO = /✅|\b(CERRADO|COMPLETO|TERMINADO)\b/
const RE_RESULTADO_VACIO = /^\s*[-*]\s+\*\*Resultado[^*]*\*\*:?\s*(_?\((rellenar|pendiente)\)_?|…|\.\.\.)?\s*$/i
// Casillas que por naturaleza se marcan DESPUÉS de abrir el PR.
const RE_CASILLA_DE_PR = /\b(PR|pull request|commit)\b|\bCI\b/i

const sinMd = (t) => String(t).replace(/\*\*|__|`/g, '').trim()

// Secciones ##/### con su texto propio (hasta el siguiente título del mismo nivel o superior).
export function secciones(texto) {
  const lineas = String(texto).split('\n')
  const out = []
  let cerca = false
  lineas.forEach((l, i) => {
    if (RE_CERCA.test(l)) cerca = !cerca
    const m = !cerca && l.match(RE_TITULO)
    if (!m) return
    const titulo = m[2]
    out.push({
      nivel: m[1].length, titulo, linea: i + 1,
      clave: (sinMd(titulo).match(/^([HS]\d+[a-z]?)\b/) || [])[1] || null,
      rama: /sin rama/i.test(titulo) ? null : (titulo.match(/rama\s+`([^`]+)`/i) || [])[1] || null,
      cerrado: RE_CERRADO.test(titulo),
    })
  })
  out.forEach((s, k) => {
    const fin = out.slice(k + 1).find((o) => o.nivel <= s.nivel)
    const cuerpo = lineas.slice(s.linea, fin ? fin.linea - 1 : lineas.length)
    let enCerca = false
    s.casillas = []
    s.resultadoVacio = false
    for (const l of cuerpo) {
      if (RE_CERCA.test(l)) { enCerca = !enCerca; continue }
      if (enCerca) continue
      const c = l.match(RE_CASILLA)
      if (c) s.casillas.push({ marca: c[1].toLowerCase(), texto: sinMd(c[2]).slice(0, 140) })
      if (RE_RESULTADO_VACIO.test(l)) s.resultadoVacio = true
    }
    s.abiertas = s.casillas.filter((c) => c.marca === ' ' || c.marca === '~')
  })
  return out
}

const prsDe = (prs, rama) => (prs || []).filter((p) => p.headRefName === rama)

// 1) Sesión con PR mergeado y casillas abiertas (salvo que haya otro PR abierto de esa rama).
// 2) Sub-backlog BACKLOG_Hn terminado con el hito «Hn» del padre abierto, o padre cerrado con hijo abierto.
export function desajustes(backlogs, prs = []) {
  const out = []
  const docs = backlogs.filter((b) => !/^PLAN/i.test(b.archivo)).map((b) => ({ ...b, secs: secciones(b.contenido) }))
  for (const b of docs) {
    for (const s of b.secs) {
      if (!s.rama || !s.abiertas.length) continue
      const suyos = prsDe(prs, s.rama)
      const mergeado = suyos.find((p) => p.state === 'MERGED')
      if (!mergeado || suyos.some((p) => p.state === 'OPEN')) continue
      out.push({ tipo: 'pr-mergeado', archivo: b.archivo, ruta: b.ruta, clave: s.clave, titulo: sinMd(s.titulo), rama: s.rama, pr: mergeado.number, abiertas: s.abiertas.map((c) => c.texto) })
    }
  }
  for (const hijo of docs) {
    const hito = hijo.archivo.match(/^BACKLOG_(H\d+)\b/i)?.[1]?.toUpperCase()
    if (!hito) continue
    for (const padre of docs) {
      if (padre === hijo) continue
      const s = padre.secs.find((x) => x.clave === hito && x.nivel === 2)
      if (!s) continue
      const casHijo = hijo.secs.flatMap((x) => x.casillas)
      const abiertasHijo = casHijo.filter((c) => c.marca === ' ' || c.marca === '~').length
      const padreHecho = s.cerrado || (s.casillas.length > 0 && !s.abiertas.length)
      const base = { archivo: padre.archivo, ruta: padre.ruta, clave: hito, hijo: hijo.archivo }
      if (casHijo.length && !abiertasHijo && !padreHecho) out.push({ ...base, tipo: 'padre-abierto', abiertas: s.abiertas.map((c) => c.texto) })
      if (s.cerrado && abiertasHijo) out.push({ ...base, tipo: 'padre-cerrado-hijo-abierto', abiertas: [`${abiertasHijo} casilla(s) abiertas en ${hijo.archivo}`] })
      break
    }
  }
  return out
}

// Qué impide abrir (modo 'crear') o mergear (modo 'merge') el PR de una rama.
// 'crear' tolera las casillas de PR/commit/CI (se marcan después) pero exige «Resultado» relleno.
export function bloqueosDeRama(backlogs, rama, modo = 'crear') {
  const out = []
  for (const b of backlogs.filter((x) => !/^PLAN/i.test(x.archivo))) {
    for (const s of secciones(b.contenido)) {
      if (s.rama !== rama) continue
      const abiertas = s.abiertas.filter((c) => modo === 'merge' || !RE_CASILLA_DE_PR.test(c.texto))
      if (abiertas.length) out.push({ archivo: b.archivo, ruta: b.ruta, clave: s.clave, titulo: sinMd(s.titulo), motivo: 'casillas abiertas', detalle: abiertas.map((c) => c.texto) })
      if (s.resultadoVacio) out.push({ archivo: b.archivo, ruta: b.ruta, clave: s.clave, titulo: sinMd(s.titulo), motivo: '«Resultado» sin rellenar', detalle: [] })
    }
  }
  return out
}

// Texto corto para el hook de inicio y la consola.
export function describir(d) {
  const lista = d.abiertas?.length ? ` — abiertas: ${d.abiertas.slice(0, 3).map((t) => `«${t.slice(0, 70)}»`).join(', ')}${d.abiertas.length > 3 ? ` (+${d.abiertas.length - 3})` : ''}` : ''
  if (d.tipo === 'pr-mergeado') return `${d.archivo} ${d.clave || d.titulo}: PR #${d.pr} (rama ${d.rama}) ya está mergeado pero la sección tiene ${d.abiertas.length} casilla(s) sin marcar${lista}`
  if (d.tipo === 'padre-abierto') return `${d.archivo} ${d.clave}: ${d.hijo} está completo pero el hito ${d.clave} del padre sigue abierto${lista}`
  return `${d.archivo} ${d.clave}: el hito está cerrado pero ${d.hijo} tiene trabajo abierto${lista}`
}
