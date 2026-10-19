// Backlogs a través de los worktrees de un repo. La carpeta principal puede quedarse días en una rama vieja
// mientras el trabajo avanza en .claude/worktrees/*: el tablero lee de cada backlog la copia más reciente
// (por fecha de modificación) entre todos los worktrees, y toma como rama activa la del último commit.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, sep } from 'node:path'

const sh = (a, cwd) => { try { return execFileSync('git', a, { cwd, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }

// `git worktree list --porcelain` → [{ ruta, rama, head }] (la carpeta principal primero).
export function worktreesDe(repo) {
  if (!repo || !existsSync(repo)) return []
  return sh(['worktree', 'list', '--porcelain'], repo).split('\n\n').map((b) => {
    const ruta = b.match(/^worktree (.+)$/m)?.[1]
    if (!ruta || /^prunable/m.test(b)) return null
    return { ruta, rama: b.match(/^branch refs\/heads\/(.+)$/m)?.[1] || null, head: b.match(/^HEAD (\w+)$/m)?.[1] || null }
  }).filter((w) => w && existsSync(w.ruta))
}

// La carpeta `dir` en cada worktree que la tenga → [{ dir, rama }]. Si no está dentro de ninguno, solo ella.
export function copiasDe(dir, worktrees) {
  const dueno = worktrees.filter((w) => dir === w.ruta || dir.startsWith(w.ruta + sep)).sort((a, b) => b.ruta.length - a.ruta.length)[0]
  if (!dueno) return [{ dir, rama: null }]
  const rel = relative(dueno.ruta, dir)
  return worktrees.map((w) => ({ dir: join(w.ruta, rel), rama: w.rama })).filter((c) => existsSync(c.dir))
}

// Archivos de `dir` que cumplen `patron`, cada uno en su copia más reciente → [{ archivo, ruta, rama, mtime }].
export function archivosVivos(dir, patron, repo, worktrees = worktreesDe(repo)) {
  const mejor = new Map()
  for (const c of copiasDe(dir, worktrees)) {
    for (const archivo of readdirSync(c.dir)) {
      if (!patron.test(archivo)) continue
      const ruta = join(c.dir, archivo), mtime = statSync(ruta).mtimeMs
      if (!(mejor.get(archivo)?.mtime >= mtime)) mejor.set(archivo, { archivo, ruta, rama: c.rama, mtime })
    }
  }
  return [...mejor.values()].sort((a, b) => a.archivo.localeCompare(b.archivo))
}

// Rama del worktree cuyo HEAD tiene el commit más reciente (si no hay worktrees, la de la carpeta).
export function ramaActiva(repo, worktrees = worktreesDe(repo)) {
  const conRama = worktrees.filter((w) => w.rama && w.head)
  if (conRama.length < 2) return sh(['branch', '--show-current'], repo).trim()
  const fechas = new Map(sh(['log', '--no-walk=unsorted', '--format=%H %ct', ...new Set(conRama.map((w) => w.head))], repo)
    .split('\n').filter(Boolean).map((l) => l.split(' ')).map(([h, t]) => [h, Number(t)]))
  return conRama.reduce((a, b) => ((fechas.get(b.head) || 0) > (fechas.get(a.head) || 0) ? b : a)).rama
}
