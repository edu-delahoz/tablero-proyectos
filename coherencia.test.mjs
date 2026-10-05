// Tests de coherencia backlog ↔ GitHub ↔ backlog padre. Sin dependencias: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { secciones, desajustes, bloqueosDeRama, sesionesSinCasillas } from './coherencia.mjs'
import { analizarComando, proyectoDe } from './verificar_backlog.mjs'

const H4 = `# Backlog H4
## Estado
- [ ] esto no es una sesión
## S3 — Componentes · **Sonnet** · rama \`h4-cat\`
- [x] (S3a) Pestanas
- [ ] TarjetaPendiente
- [~] Tests: falta E2E
- [ ] Commit + PR → \`develop\`
- **Resultado (S3a):** hecho a medias.
## S3b — continuación · **Sonnet** · rama \`h4-cat\`
- [ ] TarjetaPendiente según S3
\`\`\`
- [ ] dentro de un bloque de código no cuenta
\`\`\`
## S4 — Lista · **Sonnet** · rama \`h4-lista\`
- [x] Página
- [-] Filtro extra → pasa a S5b
- [ ] Commit + PR → \`develop\`
- **Resultado:** página y tests.
## S5 — Resolver · **Opus** · rama \`h4-resolver\`
- [x] Acciones
- **Resultado:** _(rellenar)_
### S5x — Subtarea · **Sonnet** · misma rama \`h4-resolver\`
- [x] algo
## S2 — Auditoría · **Fable** · sin rama (solo revisa)
- [ ] revisar
`
const MVP = (h4) => `# MVP
## H3 — Consulta — ✅ CERRADO
- [x] listas
## H4 — Pendientes (3–4 días)
${h4}
## H5 — Dashboard
- [ ] tablero
`
const bl = (h4, mvp) => [{ archivo: 'BACKLOG_H4.md', ruta: 'H4', contenido: h4 }, { archivo: 'BACKLOG_MVP.md', ruta: 'MVP', contenido: mvp }]

test('secciones: rama, clave, [~] cuenta como abierta, [-] no, ignora bloques de código', () => {
  const s = secciones(H4)
  const s3 = s.find((x) => x.clave === 'S3')
  assert.equal(s3.rama, 'h4-cat')
  assert.equal(s3.abiertas.length, 3)
  assert.equal(s.find((x) => x.clave === 'S3b').abiertas.length, 1)
  assert.equal(s.find((x) => x.clave === 'S4').abiertas.length, 1)
  assert.equal(s.find((x) => x.clave === 'S2').rama, null)
  assert.equal(s.find((x) => x.clave === 'S5x').rama, 'h4-resolver')
  assert.equal(s.find((x) => x.clave === 'S5').resultadoVacio, true)
  assert.equal(s3.resultadoVacio, false)
})

test('desajustes: PR mergeado con casillas abiertas (el caso S3/S3b)', () => {
  const prs = [{ number: 22, state: 'MERGED', headRefName: 'h4-cat' }]
  const d = desajustes(bl(H4, MVP('- [ ] x')), prs).filter((x) => x.tipo === 'pr-mergeado')
  assert.deepEqual(d.map((x) => [x.clave, x.pr, x.abiertas.length]), [['S3', 22, 3], ['S3b', 22, 1]])
})

test('desajustes: un PR abierto de la misma rama aplaza el aviso; sin PR no hay aviso', () => {
  const prs = [{ number: 22, state: 'MERGED', headRefName: 'h4-cat' }, { number: 25, state: 'OPEN', headRefName: 'h4-cat' }]
  assert.equal(desajustes(bl(H4, MVP('- [ ] x')), prs).filter((x) => x.tipo === 'pr-mergeado').length, 0)
  assert.equal(desajustes(bl(H4, MVP('- [ ] x')), []).filter((x) => x.tipo === 'pr-mergeado').length, 0)
})

test('desajustes: sub-backlog completo con hito padre abierto, y padre cerrado con hijo abierto', () => {
  const completo = '## S1 — x · **Opus** · rama `a`\n- [x] uno\n- [-] movido\n'
  assert.deepEqual(desajustes(bl(completo, MVP('- [x] a\n- [ ] b')), []).map((x) => x.tipo), ['padre-abierto'])
  assert.deepEqual(desajustes(bl(completo, MVP('- [x] a\n- [x] b')), []), [])
  const cerrado = MVP('- [x] a').replace('## H4 — Pendientes (3–4 días)', '## H4 — Pendientes — ✅ CERRADO')
  assert.deepEqual(desajustes(bl('## S1 — x · rama `a`\n- [ ] falta\n', cerrado), []).map((x) => x.tipo), ['padre-cerrado-hijo-abierto'])
})

test('bloqueosDeRama: crear tolera casillas de PR pero no las de trabajo; merge exige todo', () => {
  const b = bl(H4, MVP(''))
  assert.deepEqual(bloqueosDeRama(b, 'h4-lista', 'crear'), [])
  assert.deepEqual(bloqueosDeRama(b, 'h4-lista', 'merge').map((x) => x.detalle.length), [1])
  assert.deepEqual(bloqueosDeRama(b, 'h4-cat', 'crear').map((x) => [x.clave, x.detalle.length]), [['S3', 2], ['S3b', 1]])
  assert.deepEqual(bloqueosDeRama(b, 'h4-resolver', 'crear').map((x) => x.motivo), ['«Resultado» sin rellenar'])
  assert.deepEqual(bloqueosDeRama(b, 'rama-sin-seccion', 'crear'), [])
})

test('analizarComando: create/merge, --head, número, comandos ajenos', () => {
  assert.deepEqual(analizarComando('cd x && gh pr create --base develop --head h4-a --title "t"'), { modo: 'crear', rama: 'h4-a', numero: null })
  assert.deepEqual(analizarComando('gh pr create -H dueño:h4-b'), { modo: 'crear', rama: 'h4-b', numero: null })
  assert.deepEqual(analizarComando('gh pr merge 23 --squash'), { modo: 'merge', rama: null, numero: '23' })
  assert.equal(analizarComando('gh pr list'), null)
  assert.equal(analizarComando('git status'), null)
})

test('proyectoDe: por repo o carpeta de docs, sin confundir prefijos', () => {
  const ps = [{ id: 'a', repo: '/r/app', docs: ['/r/docs'] }]
  assert.equal(proyectoDe('/r/app/src', ps)?.id, 'a')
  assert.equal(proyectoDe('/r/docs', ps)?.id, 'a')
  assert.equal(proyectoDe('/r/app2', ps), undefined)
})

test('sesionesSinCasillas: sesión anunciada sin casillas (el caso S3 → S3b)', () => {
  const t = `## H3
- Estado: S3 hecha; sigue **S3c Fable** en la rama x.
    - **S3b — correcciones (Opus)**
      - [x] hallazgos
    - **S3c — re-auditoría (Fable)**
      - Resultado S3c:
    - Después: **S4 Sonnet** consultas/UI; **S3b** ya hecha.
## Otros
- [x] **S5** no es anuncio (es casilla): Después: **S9**
\`\`\`
Después: **S7** dentro de código no cuenta
\`\`\`
## S6 — Sesión con título · rama \`r\`
- [ ] algo`
  assert.deepEqual(sesionesSinCasillas(t).sort(), ['S3c', 'S4'])
  assert.deepEqual(sesionesSinCasillas(t + '\nDespués: **S6** y **S3b**'), ['S3c', 'S4'])
  const d = desajustes([{ archivo: 'BACKLOG.md', ruta: '/x', contenido: t }]).filter((x) => x.tipo === 'sesion-sin-casillas')
  assert.deepEqual(d.map((x) => x.clave).sort(), ['S3c', 'S4'])
})

test('bloqueosDeRama: en un backlog con el formato nuevo, no se abre PR de una sesión sin «Se espera» (S45)', () => {
  const nuevo = `# Backlog
## H9 — Informes
### S1 — Exportar · **Opus** · rama \`pdf\`
Se espera: baja el PDF; se comprueba con el test.
- [x] Generar — \`informe.mjs\`
#### S1b — Pie · **Sonnet** · rama \`pdf\`
- [x] Pie — \`informe.mjs\`
### S-CI2 — Higiene · **Sonnet** · rama \`ci\`
- [x] Fijar SHA — \`ci.yml\`
`
  const b = [{ archivo: 'BACKLOG.md', ruta: 'B', contenido: nuevo }]
  assert.deepEqual(bloqueosDeRama(b, 'pdf', 'crear').map((x) => [x.clave, x.motivo]), [['S1b', '«Se espera» sin escribir']])
  assert.deepEqual(bloqueosDeRama(b, 'ci', 'crear').map((x) => [x.clave, x.motivo]), [['S-CI2', '«Se espera» sin escribir']])
  assert.deepEqual(bloqueosDeRama(b, 'ci', 'merge'), [])
  // Un backlog legado (sin ninguna línea «Se espera:») no se bloquea por esto.
  assert.deepEqual(bloqueosDeRama(bl(H4, MVP('')), 'h4-lista', 'crear'), [])
})
