# Backlog MVP — IEP (formato legado)

## Estado
- **Sesión en curso (4-oct-2026):** H3 personas — **S3c Fable hecha**; siguiente S4a en la rama `h3-personas-s2`.

## H3 — Módulo de consulta
- [ ] **Personas mal migradas (PR aparte):** corregir duplicados y la N:M de formación.
    - **S3c — re-auditoría corta (Fable, solo lectura, sin plugins/MCP)**, rama `h3-personas-s2`.
      - [x] Sacar `supabase/scripts/__pycache__` del índice y añadirlo a `.gitignore`.
      - Resultado S3c (4-oct-2026, Fable): **APROBADA sin cambios obligatorios**; notas I1–I5.
    - **S4a — fichas con la N:M (Sonnet, Supabase local, sin plugins/MCP)**, rama `h3-personas-s2`. Ordenar por `(orden, nombre_completo)`.
      - [x] `src/lib/consultas/formacion.ts`: embeber `personas:formacion_persona(orden, rol)`.
      - [ ] E2E en `e2e/consulta.spec.ts`: ficha de formación con 2 tutores.
    - Prompt de arranque (S4a): «Sesión S4a de BACKLOG_MVP.md. Lee la sección Estado + la de tu sesión. Rama `h3-personas-s2`.»
