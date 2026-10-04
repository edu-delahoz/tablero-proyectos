# Mini backlog H4 — Cola de pedidos

> **Esta es la verdad para cada sub-sesión de H4.** Al arrancar: lee este archivo
> completo y solo la sección H4 de `BACKLOG_MVP.md` (no hace falta releer el plan
> entero: lo relevante está resumido aquí). Trabaja **solo tu sesión**; al cerrar,
> marca `[x]`, rellena «Resultado» de tu sesión (commit/PR, conteo de tests,
> decisiones) y deja la siguiente lista para arrancar. Si una decisión cambia algo
> de una sesión posterior, escríbela en «Decisiones» de abajo.
>
> Presupuesto: **~100k tokens por sesión**. Si te acercas al límite, cierra lo que
> tengas en verde, anota el resto como pendiente de tu sesión y para.

## Estado

- **Sesión actual:** S2b ✅ terminada (2-oct-2026): cambios 1 y 2 de la auditoría aplicados en `h4-pedidos-bd`; **PR #17** (cambios de la auditoría) listo para mergear a `develop`; el #16 ya está en `develop`. Siguiente: **S3 (Sonnet)**.
- **Rama base:** `develop`. Una rama por sesión, PR a `develop` con CI en verde.
  El PR `develop → main` (release de H4) se abre solo en S6.
- **Migración en producción:** no. Migración de H4: `migraciones/20261002140000_pedidos_cierre_upd.sql` (se sube a producción en S6).


## S1 — Migración de seguridad de pedidos · **Opus** · rama `h4-pedidos-bd`

- [x] Migración aditiva `migraciones/2026100XHHMMSS_pedidos_cierre_upd.sql`:
  - `pedido_upd` solo gestor: `USING (app.es_gestor()) WITH CHECK (app.es_gestor())`. **Nada de trigger BEFORE UPDATE**.
  - Función `descartar_pedido(p_pedido_id, p_nota)` con el mismo patrón que `aplicar_pedido`: rol válido; alcance con la condición de la política; ajeno = inexistente; solo `abierto`; nota obligatoria 1..2000.
- [x] Tests de integración: reescribir los de «re-apunta» (el usuario ya NO puede hacer UPDATE: esperar 0 filas); «consulta no puede UPDATE pedido»; `descartar-pedido.test.ts` (anónimo, ajeno, ya resuelto, nota vacía/larga, OK con auditoría).
- [x] Tests de base de datos: política `pedido_upd` solo gestor y privilegios de la función nueva.
- [x] Reinicio limpio → `pnpm test` + `pnpm test:bd` en verde; `pnpm gen:tipos`.
- [x] Commit + PR `h4-pedidos-bd → develop` (CI verde). **No tocar producción.**

## S2 — Auditoría del SQL · **Opus** · sin rama (solo revisa)

- [x] Revisar SOLO el archivo de la migración de S1: escalada de privilegios, alcance idéntico a la política, `search_path`, lista blanca, casteo, GRANT/REVOKE.
- [x] Veredicto en «Resultado» (APROBADA / con cambios / rechazada) con la lista numerada de cambios. Si hay cambios, los aplica una sesión corta sobre la misma rama (S2b).
- **Resultado (2-oct-2026): APROBADA CON CAMBIOS.** Archivo auditado:

### S2b — Aplicar cambios de la auditoría · **Opus** (corta) · misma rama `h4-pedidos-bd`

- [x] Quitar la sección 2 de la migración (los 4 `ALTER FUNCTION` de los helpers) y ajustar la cabecera. Añadir un `COMMENT ON FUNCTION` breve a los 4 helpers.
- [x] Test de base de datos: quitar los 4 asserts de los helpers; ajustar el `plan(n)`.
- [x] `BACKLOG_MVP.md` §H4: marcar la línea «Seguimiento menor» como hecha salvo el ajuste de los helpers.
- [x] Reinicio limpio → `pnpm test` + `pnpm test:bd` en verde; commit, push, CI del PR #16 en verde. Rellenar «Resultado» de S2b y el Estado.

## S3 — Componentes del catálogo · **Sonnet** · rama `h4-catalogo`

Puede ir en paralelo en el calendario con S2 (no depende de la migración), pero
**no en dos sesiones a la vez** (comparten base local y puerto).

- [ ] `Pestanas` (`componentes/ui/pestanas.tsx`): pestañas como **enlaces con estado en la URL** (`?estado=abierto|resuelto|descartado`), `aria-current`, contador opcional, teclado, móvil 390 px con scroll horizontal sin desbordar la página.
- [ ] `TarjetaPedido` (`componentes/pedidos/tarjeta-pedido.tsx`): campo, motivo, registro enlazado, estado con tono, responsable sugerido, y si está resuelto: valor final, quién, cuándo. Ranura para la acción («Resolver»). Estados normal/carga/vacío/deshabilitado.
- [ ] `CampoValorPedido` (`componentes/pedidos/campo-valor.tsx`): presentacional, elige el control según `tabla.campo`: `cantidad` → numérico; `estado` → select; `proveedor_id` → select de proveedores; `general` → textarea; fuera de la lista blanca → aviso «este dato lo corrige la gestión». Sin lógica de envío.
- [ ] Docs en `src/app/catalogo/(docs)/pedidos/page.tsx` + casos extremos en `/catalogo/estres` (motivo de 600 caracteres, palabra de 80, nombre largo, sin responsable).
- [ ] Tests: unit de la elección de control por campo; E2E de pestañas por teclado y URL.
- [ ] Checklist de robustez con su verificación automática.
- [ ] Commit + PR → `develop`.
- **Resultado:** _(rellenar)_

## S4 — Consultas y página `/pedidos` (solo lectura) · **Sonnet** · rama `h4-pedidos-lista`

Requiere S3 mergeado (y S1 en `develop` para tener los tipos).

- [ ] `src/lib/consultas/pedidos.ts`: lista paginada en el servidor por estado (los permisos los resuelve la base; nada de filtrar por rol en la app), con el nombre del registro enlazado en **una** consulta (sin N+1); filtros por campo y por producto; orden por fecha.
- [ ] `src/app/(app)/pedidos/page.tsx` + `loading.tsx`: `Pestanas` + lista de `TarjetaPedido` + paginación + estado vacío. Misma página para todos los roles. El botón «Resolver» aparece deshabilitado hasta S5.
- [ ] Feed **«Resueltos recientes»** solo para gestor/admin, en `<Suspense>` paralelo a la lista.
- [ ] Insignia de abiertos en la barra lateral, cargada **en paralelo** con la sesión (sin cascada); `0` no muestra insignia.
- [ ] Enlazar el aviso de pedidos de la ficha de producto a `/pedidos?producto=<id>`.

## Cómo ejecutarlo

6 sesiones (+ una S2b corta si la auditoría pide cambios). Siempre `/clear` entre
sesiones, nunca dos a la vez. Orden:
S1 → S2 → S3 → S4 → S5 → S6.

| Sesión | Modelo | Por qué |
|---|---|---|
