# Grill: slice-linear-comentarios

**Modo:** dec · **Canal:** slice-linear-comentarios (`0e64f128-179a-41cc-a6e0-78dbe711eaff`) · **Inicio:** 2026-09-12
**Brief:** `PLANS/slice-linear-comentarios/brief.md`

## Árbol de diseño (estado)

- [x] Granularidad del cambio en `linear.mjs` — DECIDIDA (Q1, D1)
  - [x] `create --blocked-by` reutiliza la ruta compuesta de `publish` — DECIDIDA (D1; D11 por incorporar a la spec tras el ✅)
  - [x] Un bloqueador que es clave de Linear se resuelve como issue externo antes de escribir — DECIDIDA (D1; D11 por incorporar a la spec tras el ✅)
  - [x] La vía única incluye retirar la consulta GraphQL directa de `build-kickoff/open.mjs` — vigente por D7 de la spec
- [x] `move` rechaza categorías `completed`/`canceled` — DECISIÓN VIGENTE POR DEFECTO (Q2; A de Claude Terminal)
- [x] Avisos de bloqueo sin temporizador — DECISIÓN VIGENTE POR DEFECTO (Q3; A de Claude Terminal)
- [x] Autor y destino de los comentarios de Slice — DECISIÓN VIGENTE POR DEFECTO (Q4; A de Claude Terminal)
- [x] Regla única y prueba de que los prompts no usan GraphQL manual — DECIDIDA por D1/D7; cobertura ampliada en el veredicto

## Decisiones (confirmadas por un humano)

- D1. Se mantienen dos issues (A), **contra la recomendación C**: `create` es azúcar sobre `publish`, no una segunda mutación compuesta. `blockedBy` con forma de clave de Linear refiere a un issue externo, que se resuelve como los issues con `key` de `--resume`; comparte creación en backlog, relectura, verificación, relación e informe con `publish`. Consecuencias aceptadas: seis contratos, una sola ruta compuesta, y un caso nuevo en `order()` y en relaciones. (Q1, 2026-09-12, Claude Terminal `68d8a24b`)
- D2. `move` rechaza `completed` y `canceled` con salida 3; el cierre se conserva para la PR de Build. (Q2 no tratada por el tope; recomendación A vigente de Claude Terminal, 2026-09-12, Claude Terminal `68d8a24b`)
- D3. Al bloqueo y al retomarlo se deja comentario; no habrá temporizador de 24 h. (Q3 no tratada por el tope; recomendación A vigente de Claude Terminal, 2026-09-12, Claude Terminal `68d8a24b`)
- D4. Claude Terminal comenta una vez en cada issue al publicar, con resumen validado del desglose y enlace al veredicto. (Q4 no tratada por el tope; recomendación A vigente de Claude Terminal, 2026-09-12, Claude Terminal `68d8a24b`)

## Supuestos (tuyos, hasta que alguien los confirme o corrija)

- S1. El `verdict.md` local se copiará o expondrá en `docs/grill/linear-comentarios/` antes de publicar, para que el comentario de D4 tenga un enlace que el lector de Linear pueda abrir. La decisión de D4 exige el enlace; esta es la vía por defecto del flujo existente y Andy la valida con el paquete. (Q4, 2026-09-12)

## Registro de preguntas

### Q1 — Granularidad de la puerta a Linear
**Pregunta:** ¿Mantenemos dos issues (A) o separamos `create --blocked-by` de los cuatro comandos simples (C)?
**Recomendación:** C. `publish` ya compone creación y relaciones con relectura y recuperación parcial; extraer ese flujo a `create --blocked-by` junto con los cuatro comandos nuevos hace que el primer issue tenga dos mutaciones compuestas, seis contratos y dos semánticas de reintento. Separarlo permite demostrar primero la puerta común y tratar la creación atómica/relación como el riesgo propio.
**Respuesta:** "A, con una restricción de diseño". `create` envuelve a `publish`; `blockedBy: JAR-14` se resuelve como issue externo existente, de modo que ambos comparten reintento, backlog, relectura, verificación y relación. Acepta el cambio de `order()` y relaciones, y conserva los dos issues. — Claude Terminal `68d8a24b`, 2026-09-12

**Réplica:** La objeción era la segunda ruta compuesta; D1/D11 la elimina, por lo que no queda razón para partir. Se añade al cambio del borrador que D7 requiere quitar la consulta GraphQL directa de `build-kickoff/scripts/open.mjs`, no solo prohibir las cadenas `curl`/`graphql` en el prompt.
