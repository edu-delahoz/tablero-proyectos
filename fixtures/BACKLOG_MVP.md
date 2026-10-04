# Backlog del MVP — Gestor de inventario (proyecto ficticio)

> **Cómo usar este documento (para Claude en cualquier sesión):**
> 1. Lee primero `PLAN_MVP_APLICATIVO.md` (el plan aprobado, en esta misma carpeta). Las secciones del plan (§) referenciadas abajo viven allí.
> 2. Trabaja **un hito a la vez, en orden**. Dentro del hito, marca cada tarea `[x]` al completarla y actualiza la sección "Estado" de abajo al cerrar el hito.
> 3. Un hito solo se cierra con **sus tests escritos y CI en verde**.
> 4. Reglas innegociables: producción solo cambia por migraciones probadas en local y con confirmación explícita de la persona responsable; componentes del catálogo primero; código y UI en español.
> 5. Al terminar una sesión de trabajo, deja este archivo actualizado y anota decisiones nuevas en la bitácora.

## Estado

- **Hito actual:** ✅ **H3 CERRADO (1-oct-2026)** tras la revisión visual (rama `h3-frontend` desde `develop`): listas de productos y bodegas, fichas, búsqueda global y ajustes de la revisión. **40 unit + 20 integración + 10 E2E** en verde; **sin migraciones nuevas**. **PR #5** `h3-frontend → develop` mergeado y **PR #6 `develop → main`** abierto (release de H3, https://github.com/usuario/ejemplo/pull/6). **H0, H1, H2 y H3 COMPLETOS** ✅. Siguiente: **H4 — Cola de pedidos** (empezar por la migración que restringe la edición, ver H4).

## H0 — Repo y entorno (½ día)

- [x] Crear `app/` en la raíz del proyecto con `git init` (rama `main`)
- [x] Mover `datos/esquema/` → `app/esquema/`; dejar una nota en la ruta vieja apuntando a la nueva; actualizar las rutas citadas en la documentación
- [x] Verificar entorno local desde la nueva ruta: levantar la base local, reiniciarla y crear los usuarios de prueba (8 migraciones + semilla + 4 cuentas con roles correctos)
- [x] Scaffold de la aplicación: TypeScript estricto, estilos, linter y formateador
- [x] Generar los tipos de la base de datos con un script `pnpm gen:tipos`
- [x] `.env.example` + `.env.local` (no versionado)
- [x] `CLAUDE.md` del repo con las reglas del proyecto: control de acceso por rol, componentes del catálogo primero, ninguna funcionalidad sin tests, código en español
- [x] **Cierre:** el servidor de desarrollo levanta (HTTP 200); el reinicio de la base funciona desde la nueva ruta; commit inicial; lint/typecheck/format limpios

## H1 — Fundaciones: auth + roles + monitoreo + CI (3–5 días) — ✅ COMPLETO Y DESPLEGADO
- [x] Clientes de base de datos: `cliente-navegador.ts`, `cliente-servidor.ts`, `middleware.ts`
- [x] `src/proxy.ts`: refresco de token y redirección a `/login` sin sesión (NO decide roles)
- [x] `lib/auth/roles.ts` (Rol, Sesion, esGestor, esAdmin) y `lib/auth/sesion.ts` (obtenerSesion con caché, requerirSesion/requerirGestor/requerirAdmin)

## H3 — Módulo de consulta (1–1,5 semanas)
- [ ] **Cierre:** ✅ CI verde en el **PR #5** `h3-frontend → develop` (https://github.com/usuario/ejemplo/pull/5: calidad/integración/e2e en verde). Falta: revisión visual → merge de #5 → PR `develop → main`
- [x] Ajustes tras la revisión visual (1-oct-2026): desplegables que no se salen de la pantalla, un solo scroll en diálogos, cerrar la hoja tocando fuera, «Volver» contextual — `EnlaceVolver`, `lib/historial.ts`; 40 unit + 20 integración + 9 E2E
- [ ] **Revisión H3 en el móvil (2-oct-2026)**, rama `fix-revision-h3` desde `develop`:
  - [x] Hoja de filtros diminuta en el navegador móvil: el cuerpo del `Dialogo` pasa de `flex-1` a `flex-auto`. E2E del alto + proyecto de pruebas `webkit-movil`.
  - [x] Listas largas en fichas: `ListaVinculos limite={LIMITE_FICHA}` (5 + «Ver los N»). Columna de categorías en `/productos`.
  - [x] Título corto del producto: migración `20261002120000_producto_titulo_corto`. Ficha con sección «Cita» + «Copiar».
  - [x] Descripciones separadas de las notas: migración `20261002120100_producto_separar_notas`. En la hoja de cálculo: 90/100; quedan 10 sin clasificar.
  - [x] Tests de base de datos (`pnpm test:bd`, paso de CI).
  - [x] **Aplicadas a producción (2-oct-2026):** auditoría aprobada con cambios menores → confirmación → simulación de despliegue → despliegue OK. 12 migraciones alineadas. PR #7 `fix-revision-h3 → develop`.
  - [ ] **Desfase de esquema detectado (previo):** en producción existe una columna que el esquema base no tiene → local/CI sin esa columna. Arreglo: migración aditiva `ADD COLUMN IF NOT EXISTS` (no-op en producción) + `gen:tipos`.
  - [ ] **Proveedores mal migrados (PR aparte):** ~30 registros. Compuestos «X y Y» (3); código pegado al nombre (6); prefijos «Proveedor: X» (7); valores «A»/«N» que vienen de «N/A» (40 productos cada uno); roles como nombre. Decisión: corregir lo inequívoco + tabla N:M para varios proveedores por producto. El resto → pendientes para la persona gestora.

## H4 — Cola de pedidos (3–4 días)
Este hito está dividido en el backlog H4; revisar allí y marcar x después de cada sub-sesión.
- [ ] `/pedidos`: pestañas Abiertos/Resueltos/Descartados; tarjetas con campo/motivo/registro enlazado
- [ ] Diálogo "Resolver" tipado por `campo` + opción "descartar" con nota; aplicación directa vía `aplicar_pedido` (llena valor_final, resuelto_por y fecha; auditoría)
- [ ] Feed "Resueltos recientes" para gestor (revisión posterior); insignia de abiertos en la barra lateral
- [ ] Tests: suite de permisos ampliada (usuario 1 ve 2, usuario 2 ve 1, gestor 3); integración: `aplicar_pedido` rechaza pedido ajeno/campo no permitido/valor mal tipado; E2E: resolver actualiza el registro + auditoría
- [ ] ⚠️ **HACER ANTES DE CONSTRUIR LA UI DE RESOLVER:** cerrar la edición de pedidos a solo gestor — hoy un usuario puede editar cualquier columna de SUS pedidos y, combinado con `aplicar_pedido`, obtener escrituras ilimitadas sobre sus propios registros. Migración aditiva:
  ```sql
  DROP POLICY IF EXISTS pedido_upd ON public.pedido;
  CREATE POLICY pedido_upd ON public.pedido
      FOR UPDATE USING (app.es_gestor()) WITH CHECK (app.es_gestor());
  -- - [ ] casilla falsa dentro de un bloque de código: no cuenta
  ```
  + función estrecha `descartar_pedido(id, nota)` para que el usuario pueda descartar. Tests: invertir el test «usuario re-apunta SU pedido» (hoy espera 1 fila editada → debe ser 0).
- [x] Seguimiento menor (misma migración de H4) — ✅ hecho en H4 S1/S2b; el ajuste del `search_path` de los helpers quedó **descartado en la auditoría (rendimiento, sin ganancia)**. Texto original: fijar `SET search_path = ''` en los helpers `app.rol()/es_gestor()`.
- [ ] **Cierre:** CI verde

## H5 — Panel de indicadores (2–3 días)

- [ ] `/` con tarjetas (totales + pedidos abiertos) y gráficas — cada bloque en Suspense con su esqueleto
- [ ] Tests: integración con valores esperados fijos de la semilla; E2E carga para los 3 roles
- [ ] **Cierre:** CI verde
