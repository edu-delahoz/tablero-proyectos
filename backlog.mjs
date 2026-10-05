#!/usr/bin/env node
// Extractor de backlog: `seccion <clave> [archivo]` imprime solo esa sección (con nº de línea) y
// `marcar <clave> <n> [archivo]` cambia [ ]→[x] en su casilla n (1-based). Sin archivo: BACKLOG.md del directorio actual.
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
  const [cmd, clave, ...resto] = process.argv.slice(2)
  const uso = () => { console.error('Uso: backlog.mjs seccion <clave> [archivo] | marcar <clave> <n> [archivo]'); process.exit(2) }
  if (!['seccion', 'marcar'].includes(cmd) || !clave) uso()
  const n = cmd === 'marcar' ? Number(resto.shift()) : null
  if (cmd === 'marcar' && !(n >= 1)) uso()
  const archivo = resto[0] || 'BACKLOG.md'
  const texto = readFileSync(archivo, 'utf8')
  if (cmd === 'seccion') {
    const r = seccion(texto, clave)
    if (!r) { console.error(`No hay sección «${clave}» en ${archivo}`); process.exit(1) }
    console.log(`${archivo}:${r.linea}\n${r.texto}`)
  } else {
    const r = marcar(texto, clave, n)
    if (!r) { console.error(`No hay casilla ${n} en «${clave}» de ${archivo}`); process.exit(1) }
    writeFileSync(archivo, r.texto)
    console.log(`${archivo}:${r.linea} marcada`)
  }
}
