// Linter del formato de backlog (H17, `metodologia-claude-code/metodologia/FORMATO_BACKLOG.md`). Puro.
// Solo mira las sesiones abiertas: lo cerrado se queda como está (formato legado aceptado).
import { sesiones } from './generar.mjs'

// → [{ clave, linea (1-based), motivo, texto? }] por sesión, en orden del archivo.
export function avisosFormato(texto) {
  const avisos = []
  for (const s of sesiones(texto)) {
    if (!s.total || s.hechas === s.total) continue
    const en = { clave: s.clave, linea: s.linea + 1 }
    if (!s.seEspera) avisos.push({ ...en, motivo: 'sin «Se espera»' })
    for (const t of s.tareas) {
      if (!t.hecha && !t.llano) avisos.push({ clave: s.clave, linea: t.linea + 1, motivo: 'casilla sin « — » (llano — técnico)', texto: t.texto })
    }
    if (!s.prompt) avisos.push({ ...en, motivo: 'sin prompt' })
  }
  return avisos
}
