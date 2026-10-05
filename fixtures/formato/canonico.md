# Backlog — Ejemplo canónico

## Estado
- 2026-10-05 · rama `formato-x` · S1 hecha. Siguiente: **S2** (Sonnet).

## H9 — Exportar informes
Historia: Como gestor, quiero exportar el informe mensual en PDF, para enviarlo sin copiar a mano.

### S1 — Exportar a PDF · **Opus** · rama `exportar-pdf` · ~60k · plugins: ninguno
Se espera: El botón «Exportar» baja un PDF con la tabla del mes; se comprueba con `informe.test.mjs` en verde.
- [x] [test] Probar que el PDF trae la tabla — `informe.test.mjs`: 3 filas del fixture, verla fallar
- [x] Generar el PDF — `informe.mjs` `aPdf()`; prueba anterior en verde
- [ ] [fix] Acentos bien en el título — `informe.mjs` fuente con UTF-8; caso «Diseño» en el test

Resultado: PDF con tabla y acentos pendientes; S1b abierta para el pie.
Prompt:
```text
Sesión S1 de BACKLOG.md. Rama `exportar-pdf`. Primero el test. Al terminar, ejecuta /relevo.
```
Después: **S2**

#### S1b — Pie de página · **Sonnet** · rama `exportar-pdf` · ~20k
Se espera: Cada página lleva número y fecha; se comprueba abriendo el PDF del fixture.
- [ ] [doc] Contar en el README cómo exportar — `README.md` sección «Informes»

### S2 — Enviar por correo · **Sonnet** · rama `exportar-pdf` · ~40k
Se espera: El informe llega al correo del gestor; se comprueba con el buzón falso del test.
- [ ] [test] Probar el envío con buzón falso — `correo.test.mjs`: un envío, adjunto PDF; verla fallar
- [ ] [refactor] Separar el armado del envío — `correo.mjs` `armar()` puro y `enviar()` con red
