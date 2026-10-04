# Plan del MVP — Gestor de inventario (proyecto ficticio)

## Contexto

## 7. Secuencia de hitos (6–8 semanas, 1 dev)

Regla transversal: **cada hito entrega código + sus tests, y cierra con CI en verde**. La columna Verificación se implementa como tests automatizados, no como revisión manual.

| Hito | Contenido | Verificación |
|---|---|---|
| **0** (½ día) | Crear `app/` (git init); mover el esquema de datos; scaffold con TypeScript y estilos; `gen:tipos`; CLAUDE.md con reglas | El servidor de desarrollo levanta; el reinicio de la base funciona desde la nueva ruta |
| **1** (3–5 d) | Clientes de base de datos + middleware; login + callback + logout; `lib/auth` completo; guardas por grupo de rutas; monitoreo; **CI desde ya** y **suite de seguridad inicial**; **despliegue temprano** | Unit de `roles.ts`; la suite pasa (toda operación prohibida falla); E2E: 4 cuentas entran y cada rol llega donde debe. **Congela el patrón de roles** |
| **2 — Diseño y biblioteca** (1 sem) | **2–3 propuestas visuales navegables** → iteración hasta el OK → congelar tokens; **catálogo de componentes** incluyendo tabla de datos, barra de filtros y esqueletos; layout definitivo | La dirección visual queda aprobada; el catálogo muestra cada componente con todos sus estados; sin saltos de layout |
| **3 — Consulta** (1–1,5 sem) | Migración de búsqueda e índices (local → producción con confirmación); listas y fichas: productos → bodegas → proveedores → movimientos | Integración: la búsqueda encuentra por alias; E2E: filtros combinados correctos, chips removibles, URL compartible |
| **4 — Pedidos** (3–4 d) | Cola completa (pestañas, resolver tipado con aplicación directa vía `aplicar_pedido`, feed de resueltos recientes para gestor, insignia) | Suite de permisos ampliada: usuario 1 ve 2, usuario 2 ve 1, gestor 3; integración: `aplicar_pedido` rechaza pedido ajeno / campo no permitido / valor mal tipado; E2E: resolver actualiza el registro + auditoría |
| **5 — Panel** (2–3 d) | Vistas de indicadores + bloques Suspense con sus esqueletos + gráficas | Integración: los números cuadran contra valores fijos de la semilla; E2E: el panel carga para los 3 roles |
| **6 — CRUD** (1,5–2 sem) | Por complejidad creciente: catálogos → proveedor → producto → movimiento → bodega | Unit de todos los esquemas; integración de cada acción con rol correcto **y** rol incorrecto; E2E: el gestor crea/edita con rastro en auditoría |
| **7 — Admin + salida** (3–5 d) | `/admin/usuarios`; barrido de estados/accesibilidad; suite E2E completa; CI verde total; humo en producción con pilotos | El checklist 4 módulos × 3 roles corre como suite E2E en CI; E2E: el admin eleva un rol desde la UI |

## Riesgos y cuidados
