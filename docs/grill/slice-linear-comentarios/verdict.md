---
title: "ADR: Comentarios humanos en cards de Linear"
tags: [linear, slice, decision]
status: active
created: 2026-09-12
---

# ADR: comentarios en las cards de Linear

## Contexto

El borrador propone dos issues: una puerta única `linear.mjs` y los momentos
de comentario de Build/Slice. El riesgo atacado fue convertir `create
--blocked-by` en otra ruta compuesta de crear, relacionar, reintentar y
verificar, paralela a `publish`.

## Opciones consideradas

### A — Dos issues, una única ruta compuesta

**Pros:** mantiene la dependencia simple para los consumidores, entrega los
comandos juntos y no duplica la semántica de creación. **Contras:** el primer
issue conserva seis contratos y modifica `publish` y `order()`.

### C — Tres issues, separar `create --blocked-by`

**Pros:** aísla la creación+relación como riesgo propio. **Contras:** añade
coordinación y hace que el consumidor de los tres momentos espere dos
dependencias de API.

## Decisión

Se elige **A**. Claude Terminal (`68d8a24b1d6faa87178983502189445b0e430f3e22b519043131e8a32d38cb96`) decidió Q1 el 2026-09-12: `create` será azúcar sobre
`publish`, no una segunda ruta. Un `blockedBy` con forma de clave Linear se
resuelve como issue externo existente antes de escribir; así crea en backlog,
relee, verifica la categoría, crea la relación e informa mediante la misma
ruta que `publish`. Esta es D1 del ledger y D11 ya incorporada a la spec.

Claude Terminal incorporó asimismo D12: `build-kickoff/open.mjs` deja su
consulta GraphQL propia e importa `issue` desde `linear.mjs`, que expone
`title` y `spec`; el criterio deja `api.linear.app` solo en ese módulo y su
test. Es D5 del ledger, decidido por Claude Terminal el 2026-09-12.

D13 resuelve la entrega del comentario de Slice: no es parte de `publish`.
Cuando `publish.ok:true` y la PR de docs ya está mergeada, el paso propio del
skill comenta únicamente los issues sin recibo `comment: { id, at }`, guarda
el resultado junto a la `key` y usa el permalink de `main` al veredicto. La
duplicación por pérdida del recibo se acepta como excepción visible y de
borrado manual. Claude Terminal (`68d8a24b`) tomó esta decisión en Q2 el
2026-09-12.

Por el tope de dos preguntas, las preguntas de `move` y bloqueo conservan la
recomendación vigente del brief:

| Pregunta | Decisión vigente | Quién la tomó |
|---|---|---|
| Q2 del brief | A: `move` rechaza `completed`/`canceled`, con exit 3; la PR de Build cierra. | Claude Terminal `68d8a24b` |
| Q3 del brief | A: comentar al bloquearse y al retomar; sin temporizador. | Claude Terminal `68d8a24b` |
| Q4 del brief (respondida como Q2 del grill) | B: paso posterior, recibos por issue y permalink a `main`. | Claude Terminal `68d8a24b` |

## Consecuencias aceptadas y cambios al borrador

1. El issue `cli` queda en una card, pero ha de probar explícitamente:
   bloqueador externo existente, inexistente que falla antes de cualquier
   escritura, relación creada, reintento/resume y `--dry-run`. El contrato
   discriminante es "una clave Linear es externa; un `ref` del plan es
   interno".
2. El mapeo del error de categoría a **exit 3** debe estar en el `main`:
   hoy su `catch` termina siempre en 1
   (`skills/to-tickets-linear/scripts/linear.mjs:306-322`).
3. D7 aún falla fuera del prompt: `build-kickoff/scripts/open.mjs:70-75`
   consulta GraphQL directamente. `cli` debe ampliar la lectura expuesta por
   `linear.mjs issue` (título y `Spec:` incluidos) y `open.mjs` debe usarla;
   no basta el eval negativo de cadenas `curl`/`graphql`.
4. El criterio negativo de `moments` debe verificar el código de producción
   de `build-kickoff`, no solo el prompt generado. Así detecta una llamada
   GraphQL manual aunque reutilice `URL_DEFAULT` de `linear.mjs`.
5. D4 tiene su copia canónica en
   `docs/grill/slice-linear-comentarios/verdict.md`; solo tras su merge se
   usa su permalink a `main`. Los recibos `comment: { id, at }` vuelven
   reanudable el paso sin hacer idempotente la mutación `comment`.

## Supuestos sin confirmar

- Ninguno. D6 acepta explícitamente el único modo de duplicación conocido:
  pérdida o reversión del recibo en el borrador.

## Quién decidió

- Q1, D11, D12 y D13: Claude Terminal `68d8a24b`.
- Q2–Q3 del brief: recomendaciones vigentes de Claude Terminal `68d8a24b`,
  no interrogadas por el tope.
- Validación final del paquete: Andy, mediante un mensaje con `✅`.

## Entrega antes de validar

La decisión D13 todavía debe trasladarse al borrador y a la spec; la búsqueda
al cerrar este ADR no la encontró. También hay que sincronizar la copia
enlazada `docs/grill/slice-linear-comentarios/verdict.md`, que conserva el
cierre prematuro sin D12/D13. Claude Terminal es el dueño de ambas
actualizaciones documentales. La decisión no queda abierta.
