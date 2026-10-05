#!/usr/bin/env node
// Extractor de backlog (sin archivo: BACKLOG.md del directorio actual; el archivo es el argumento que termina en .md):
//   seccion <c1> [c2…] [archivo]  solo esas secciones, con nº de línea
//   estado [archivo]              el bloque «## Estado» / «## Hito actual»
//   arranque <clave> [archivo]    Estado + sección, de un tirón (lo que lee una sesión al empezar)
//   indice [archivo]              línea · nivel · título · abiertas/total
//   marcar <clave> <n> [archivo]  cambia [ ]→[x] en su casilla n (1-based)
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { estructura, aplanar, plano } from './generar.mjs'

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// { linea (1-based), fin (índice excluido), texto, sec } de la sección cuyo título empieza por `clave` (S4b, E1, H16…).
function ubicar(texto, clave) {
  const arbol = estructura(texto), todas = aplanar(arbol).sort((a, b) => a.linea - b.linea)
  const re = new RegExp(`^${escapar(clave)}(?![A-Za-z0-9])`, 'i')
  const sec = todas.find((s) => re.test(plano(s.titulo)))
  if (!sec) return null
  const lineas = texto.split('\n')
  const sig = todas.find((s) => s.linea > sec.linea && s.nivel <= sec.nivel)
  const fin = sig ? sig.linea : lineas.length
  return { sec, lineas, fin, linea: sec.linea + 1, texto: lineas.slice(sec.linea, fin).join('\n').trimEnd() }
}

export function seccion(texto, clave) {
  const u = ubicar(texto, clave)
  return u && { linea: u.linea, texto: u.texto }
}

export function estado(texto) {
  return seccion(texto, 'Estado') || seccion(texto, 'Hito actual')
}

export function arranque(texto, clave) {
  const sec = seccion(texto, clave)
  if (!sec) return null
  const e = estado(texto)
  return { linea: sec.linea, texto: e ? `${e.texto}\n\n${sec.texto}` : sec.texto }
}

export function indice(texto) {
  const abiertas = (s) => {
    const ts = [...s.tareas.flatMap(function plana(t) { return [t, ...t.hijas.flatMap(plana)] }), ...s.hijas.flatMap((h) => abiertas(h).ts)]
    return { ts }
  }
  return aplanar(estructura(texto)).sort((a, b) => a.linea - b.linea).map((s) => {
    const ts = abiertas(s).ts
    return `${s.linea + 1} · ${s.nivel} · ${plano(s.titulo)} · ${ts.filter((t) => !t.hecha).length}/${ts.length}`
  }).join('\n')
}

export function marcar(texto, clave, n) {
  const u = ubicar(texto, clave)
  if (!u) return null
  const tareas = (s) => [...s.tareas.flatMap(function plana(t) { return [t, ...t.hijas.flatMap(plana)] }), ...s.hijas.flatMap(tareas)]
  const t = tareas(u.sec).sort((a, b) => a.linea - b.linea)[n - 1]
  if (!t) return null
  const nuevas = u.lineas.slice()
  nuevas[t.linea] = nuevas[t.linea].replace(/\[[ ~-]\]/, '[x]')
  return { linea: t.linea + 1, texto: nuevas.join('\n') }
}

let esPrincipal = false
try { esPrincipal = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch {}
if (esPrincipal) {
  const [cmd, ...args] = process.argv.slice(2)
  const uso = () => { console.error('Uso: backlog.mjs seccion <clave…> | estado | arranque <clave> | indice | marcar <clave> <n>  [archivo.md]'); process.exit(2) }
  if (!['seccion', 'estado', 'arranque', 'indice', 'marcar'].includes(cmd)) uso()
  const iMd = args.findIndex((a) => /\.md$/i.test(a))
  const archivo = iMd >= 0 ? args.splice(iMd, 1)[0] : 'BACKLOG.md'
  const texto = readFileSync(archivo, 'utf8')
  const falta = (c) => { console.error(`No hay sección «${c}» en ${archivo}`); process.exit(1) }
  if (cmd === 'indice') console.log(indice(texto))
  else if (cmd === 'estado') { const r = estado(texto) || falta('Estado'); console.log(`${archivo}:${r.linea}\n${r.texto}`) }
  else if (cmd === 'arranque') {
    if (!args[0]) uso()
    const r = arranque(texto, args[0]) || falta(args[0])
    console.log(`${archivo}\n${r.texto}`)
  } else if (cmd === 'seccion') {
    if (!args.length) uso()
    const rs = args.map((c) => seccion(texto, c) || falta(c))
    console.log(`${archivo}:${rs.map((r) => r.linea).join(',')}\n${rs.map((r) => r.texto).join('\n\n')}`)
  } else {
    const [clave, ns] = args, n = Number(ns)
    if (!clave || !(n >= 1)) uso()
    const r = marcar(texto, clave, n)
    if (!r) { console.error(`No hay casilla ${n} en «${clave}» de ${archivo}`); process.exit(1) }
    writeFileSync(archivo, r.texto)
    console.log(`${archivo}:${r.linea} marcada`)
  }
}
