// Tests de la lectura de backlogs a través de los worktrees de un repo. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { worktreesDe, copiasDe, archivosVivos, ramaActiva } from './worktrees.mjs'

const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', env: { ...process.env, ...(a.includes('uno') && { GIT_COMMITTER_DATE: '2020-01-01T00:00:00' }) } })

// Repo con la carpeta principal vieja en «vieja» y un worktree anidado (.claude/worktrees/nuevo) en «nueva».
function repo() {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'wt-')))
  git(raiz, 'init', '-q', '-b', 'main')
  git(raiz, 'config', 'user.email', 't@t'); git(raiz, 'config', 'user.name', 't')
  mkdirSync(join(raiz, 'docs'))
  writeFileSync(join(raiz, 'docs', 'BACKLOG.md'), '# viejo\n')
  git(raiz, 'add', '.'); git(raiz, 'commit', '-qm', 'uno', '--date=2020-01-01T00:00:00') // committer 2020 vía env
  git(raiz, 'checkout', '-qb', 'vieja')
  const wt = join(raiz, '.claude', 'worktrees', 'nuevo')
  git(raiz, 'worktree', 'add', '-q', '-b', 'nueva', wt)
  writeFileSync(join(wt, 'docs', 'BACKLOG.md'), '# nuevo\n')
  git(wt, 'commit', '-qam', 'dos')
  utimesSync(join(raiz, 'docs', 'BACKLOG.md'), new Date('2020-01-01'), new Date('2020-01-01'))
  return { raiz, wt }
}

test('worktreesDe lista la carpeta principal y los worktrees con su rama', () => {
  const { raiz, wt } = repo()
  const w = worktreesDe(raiz)
  assert.deepEqual(w.map((x) => [x.ruta, x.rama]), [[raiz, 'vieja'], [wt, 'nueva']])
})

test('copiasDe da la misma carpeta en cada worktree; fuera del repo, solo ella', () => {
  const { raiz, wt } = repo()
  const w = worktreesDe(raiz)
  assert.deepEqual(copiasDe(join(raiz, 'docs'), w).map((c) => c.dir), [join(raiz, 'docs'), join(wt, 'docs')])
  // Desde dentro del worktree anidado: gana la raíz más larga (no la principal que lo contiene).
  assert.deepEqual(copiasDe(join(wt, 'docs'), w).map((c) => c.dir), [join(raiz, 'docs'), join(wt, 'docs')])
  assert.deepEqual(copiasDe('/otra/parte', w).map((c) => c.dir), ['/otra/parte'])
})

test('archivosVivos elige la copia más reciente de cada backlog', () => {
  const { raiz, wt } = repo()
  const v = archivosVivos(join(raiz, 'docs'), /^BACKLOG.*\.md$/i, raiz)
  assert.equal(v.length, 1)
  assert.equal(v[0].ruta, join(wt, 'docs', 'BACKLOG.md'))
  assert.equal(v[0].rama, 'nueva')
})

test('sin repo git, archivosVivos lee la carpeta tal cual', () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'sin-')))
  writeFileSync(join(d, 'BACKLOG.md'), 'x')
  assert.deepEqual(archivosVivos(d, /^BACKLOG.*\.md$/i, null).map((x) => x.ruta), [join(d, 'BACKLOG.md')])
})

test('ramaActiva es la del worktree con el commit más reciente, no la de la carpeta principal', () => {
  const { raiz } = repo()
  assert.equal(ramaActiva(raiz), 'nueva')
})
