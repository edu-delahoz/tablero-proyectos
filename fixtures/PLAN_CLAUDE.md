# Plan: tablero de ejemplo con prompts

## Contexto

Texto de contexto con una cita que no es una orden:

> Esta cita es solo una nota y no debe aparecer como prompt.

1. Primer paso del contexto
2. Segundo paso del contexto

## Cómo ejecutarlo

**2 sesiones** en la carpeta del proyecto.

| Sesión | Modelo | Qué hace |
|---|---|---|
| T1 | **Sonnet** | Parte A: preparar datos |
| T2 | **Opus** | Parte B: lógica delicada |

Prompt T1:
> Ejecuta la Parte A del plan `~/plan.md`.
> Primero los tests, luego el código.
>
> Muéstrame la lista de archivos antes de publicar.

Prompt T2:
> Ejecuta la Parte B del plan. Aplica el checklist de robustez.

### Arranque alternativo

Prompt de arranque:
```
Lee el plan y empieza por la Parte A.
- [ ] esta casilla es falsa
## este encabezado es falso
```

Una cerca sin rótulo dentro de «Cómo ejecutarlo» también cuenta:

~~~
Texto_largo_sin_espacios_para_probar_el_ajuste_de_linea_en_pantallas_angostas_0123456789
~~~

## Notas finales

Prompt de ejemplo fuera de lugar:
> Un prompt con rótulo cuenta aunque la sección no sea «Cómo ejecutarlo».

> Una cita sin rótulo fuera de «Cómo ejecutarlo» se ignora.
