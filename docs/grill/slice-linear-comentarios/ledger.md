# Grill: slice-linear-comentarios

**Modo:** dec · **Canal:** slice-linear-comentarios (`0e64f128-179a-41cc-a6e0-78dbe711eaff`) · **Inicio:** 2026-09-12
**Brief:** `PLANS/slice-linear-comentarios/brief.md`

## Árbol de diseño (estado)

- [x] Granularidad del cambio en `linear.mjs` — DECIDIDA (Q1, D1)
  - [x] `create --blocked-by` reutiliza la ruta compuesta de `publish` — DECIDIDA (D1 / D11 de la spec)
  - [x] Un bloqueador que es clave de Linear se resuelve como issue externo antes de escribir — DECIDIDA (D1 / D11 de la spec)
  - [x] La vía única incluye retirar la consulta GraphQL directa de `build-kickoff/open.mjs` — DECIDIDA (D5 / D12 de la spec)
- [x] Entrega del comentario de Slice por card — DECIDIDA (Q2, D6; D13 por incorporar a la spec)
  - [x] Momento: paso propio solo tras `publish.ok:true` y tras mergear la PR de docs — DECIDIDA (D6)
  - [x] Reintento: recibos `comment: { id, at }` junto a cada `key`; se recorren solo los faltantes — DECIDIDA (D6)
  - [x] Enlace: permalink a `main` de `docs/grill/<slug>/`, no ruta local ni rama efímera — DECIDIDA (D6)
- [x] `move` rechaza categorías `completed`/`canceled` — DECISIÓN VIGENTE POR DEFECTO (Q2 del brief; A de Claude Terminal)
- [x] Avisos de bloqueo sin temporizador — DECISIÓN VIGENTE POR DEFECTO (Q3 del brief; A de Claude Terminal)
- [x] Regla única y prueba de que los prompts no usan GraphQL manual — CUBIERTA por D1/D7/D12; no requiere una decisión nueva

## Decisiones (confirmadas por un humano)

- D1. Se mantienen dos issues (A), **contra la recomendación C**: `create` es azúcar sobre `publish`, no una segunda mutación compuesta. `blockedBy` con forma de clave de Linear refiere a un issue externo, que se resuelve como los issues con `key` de `--resume`; comparte creación en backlog, relectura, verificación, relación e informe con `publish`. Consecuencias aceptadas: seis contratos, una sola ruta compuesta, y un caso nuevo en `order()` y en relaciones. (Q1, 2026-09-12, Claude Terminal `68d8a24b`)
- D5. D12 incorporada al borrador y a la spec: `open.mjs` importará `issue` de `linear.mjs` para `title` y `spec`; `api.linear.app` queda permitido solo en `linear.mjs` y su test. (Hallazgo de Q1, 2026-09-12, Claude Terminal `68d8a24b`)
- D6. El comentario de Slice no vive en `publish`: tras `publish.ok:true` y el merge de la PR de docs, el paso propio recorre solo los issues sin `comment`, llama `linear.mjs comment <clave> -` y escribe `comment: { id, at }` en el borrador. Usa el permalink a `main` del veredicto. Si se pierde el recibo, se acepta el duplicado visible y se borra a mano; no habrá búsqueda por texto. (Q2, 2026-09-12, Claude Terminal `68d8a24b`)
- D7. `move` rechaza `completed` y `canceled` con salida 3; el cierre se conserva para la PR de Build. (Q2 del brief no tratada por el tope; recomendación A vigente de Claude Terminal, 2026-09-12, Claude Terminal `68d8a24b`)
- D8. Al bloqueo y al retomarlo se deja comentario; no habrá temporizador de 24 h. (Q3 del brief no tratada por el tope; recomendación A vigente de Claude Terminal, 2026-09-12, Claude Terminal `68d8a24b`)

### Entradas retiradas

- D2–D4 publicadas en el primer cierre se **retiran**: eran recomendaciones del brief, no respuestas. Claude Terminal aclaró que la réplica a Q1 aún era la ronda 1, por lo que quedaba una pregunta nueva. (2026-09-12, Claude Terminal `68d8a24b`)

## Supuestos (tuyos, hasta que alguien los confirme o corrija)

- Ninguno. La duplicación tras perder un recibo fue aceptada explícitamente en D6.

## Entrega documental pendiente

- Claude Terminal debe incorporar D13 —ya decidida en D6— al borrador y a la spec antes del ✅. La búsqueda en esos dos archivos no la encontró al cerrar el grill. No hay decisión abierta: el contenido y el dueño están definidos.
- Claude Terminal debe sincronizar `docs/grill/slice-linear-comentarios/verdict.md`: aún refleja el cierre prematuro (D11 futura y sin D12/D13), pese a ser el destino enlazado por la spec.

## Registro de preguntas

### Q1 — Granularidad de la puerta a Linear
**Pregunta:** ¿Mantenemos dos issues (A) o separamos `create --blocked-by` de los cuatro comandos simples (C)?
**Recomendación:** C. `publish` ya compone creación y relaciones con relectura y recuperación parcial; extraer ese flujo a `create --blocked-by` junto con los cuatro comandos nuevos hace que el primer issue tenga dos mutaciones compuestas, seis contratos y dos semánticas de reintento. Separarlo permite demostrar primero la puerta común y tratar la creación atómica/relación como el riesgo propio.
**Respuesta:** "A, con una restricción de diseño". `create` envuelve a `publish`; `blockedBy: JAR-14` se resuelve como issue externo existente, de modo que ambos comparten reintento, backlog, relectura, verificación y relación. Acepta el cambio de `order()` y relaciones, y conserva los dos issues. — Claude Terminal `68d8a24b`, 2026-09-12

**Réplica:** La objeción era la segunda ruta compuesta; D1/D11 la elimina, por lo que no queda razón para partir. El hallazgo se incorporó como D12: D7 requiere quitar la consulta GraphQL directa de `build-kickoff/scripts/open.mjs`, no solo prohibir las cadenas `curl`/`graphql` en el prompt.

### Q2 — Entrega fiable de los comentarios de Slice
**Pregunta:** ¿Dónde vive el comentario por card y cuál es su contrato de reintento? A: `publish` lo emite dentro de su ejecución. B: el paso 6 de `to-tickets-linear`, tras un informe `publish.ok:true`, llama `linear.mjs comment` con el permalink del veredicto y registra el `commentId` por issue para reanudar solo los que falten.
**Recomendación:** B. `publish` puede terminar con creaciones parciales (`report.ok:false`) y su `--resume` reconstruye relaciones; si además comenta, un reintento duplica texto o informa sobre un desglose que no llegó completo. El paso posterior solo opera sobre claves verificadas, recibe un enlace ya publicable y persiste recibos de comentarios para hacer el reintento idempotente.
**Respuesta:** "B, con el mecanismo concreto". El paso propio sigue a `publish.ok:true`, almacena `comment: { id, at }` por issue y salta recibos existentes; corre tras mergear la PR de docs y usa permalink a `main`. Si un recibo se pierde, se acepta el duplicado y borrado manual. — Claude Terminal `68d8a24b`, 2026-09-12
