# Bitácora de metodología

Fixture con la forma de la bitácora real (filas como las escribe `registrar_sesion.sh`).

**Qué significa cada columna:**
- **Calidad**: ✅ CI verde a la primera · 🟡 hubo que corregir · 🔴 se rompió algo después.

---

## Registro

| Fecha | Sesión / tarea | Modo | Modelo | Duración | Costo USD | Contexto máx. | Calidad | Seguridad | Notas / qué haría distinto |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-0? | Rama 4 seed sintética (una sola sesión) | manual | Opus | ? | ? | ~210k 🔴 | ✅ CI verde (PR #12) | sin prod | Debió ir en 3 sub-sesiones. |
| 2026-10-02 | Revisión de metodología | plan | Opus | ~70 min | ~0,9+ | ~70k 🟢 | — | — | Creados CONFIGURACION/PROMPTS/BITACORA. |
| 2026-10-04 02:36 | auditoría de mcps (aaaa1111) | auto | Sonnet 5.5 | ~5 min | $1.69 | ctx final 193k 🔴 | _pendiente_ | _pendiente_ | other |
| 2026-10-04 02:44 | Tablero barra de estado (bbbb2222) | auto | Opus 5.5 | ~31 min | $2.05 | ctx 61k→136k 🟡 | _pendiente_ | _pendiente_ | clear |
| 2026-10-04 03:19 | Plan con tubo a \| b (cccc3333) | auto | Sonnet 5.5 | ~2 min | $0.41 | ctx 42k→73k 🟢 | 🟡 hubo que corregir | sin prod | usar a \| b con cuidado |
| 2026-10-04 03:23 | Otra cosa (dddd4444) | auto | Opus 5.5 | ~3 min | $1.28 | ctx 42k→110k 🟡 | _pendiente_ | _pendiente_ | clear |
| | | | | | | | | | |

---

## Resumen semanal

Una fila por semana ISO.

| Semana | Sesiones | Tokens | % caché | Tokens subagentes | Proyecto que más gastó | Skill más usada | Prompt más caro |
|---|---|---|---|---|---|---|---|
| 2026-W40 | 81 | 586.7M | 97.4% | 11.6M | Desarrollo-tablero (25%) | plugin-authoring (4) | ▎ Lee BACKLOG.md (6%) |

---

## Experimentos en curso

### E1. Orquestador con subagentes vs sesiones manuales
**Pregunta:** ¿cuesta menos un orquestador?

**Resultado:** _pendiente_

---

## Lecciones aprendidas

- **2026-10-02** — Hacer `/clear` a las 150k no basta si una tarea ya pasa de ese tamaño.
- **2026-10-04** — Los cambios de plugins solo se notan en un proceso nuevo de `claude`.
