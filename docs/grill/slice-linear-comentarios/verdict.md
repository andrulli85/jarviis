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
ruta que `publish`. Esta es D1 del ledger; se incorporará como D11 a la spec
cuando Andy valide el paquete.

Por el tope de dos rondas, las restantes preguntas conservan la recomendación
vigente de Claude Terminal, como exige el brief:

| Pregunta | Decisión vigente | Quién la tomó |
|---|---|---|
| Q2 | A: `move` rechaza `completed`/`canceled`, con exit 3; la PR de Build cierra. | Claude Terminal `68d8a24b` |
| Q3 | A: comentar al bloquearse y al retomar; sin temporizador. | Claude Terminal `68d8a24b` |
| Q4 | A: Claude Terminal comenta en cada issue al publicar, con resumen y enlace al veredicto. | Claude Terminal `68d8a24b` |

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
5. D4 necesita una URL de veredicto publicable: el plan actual solo trae
   `team`, `spec` e `issues`
   (`docs/tickets/linear-comentarios-para-humanos.json:1-29`). Antes de
   `publish`, el flujo debe aportar el enlace a la copia del veredicto en
   `docs/grill/linear-comentarios/`; no debe enlazar la ruta local `PLANS/`.

## Supuestos sin confirmar

- La copia/exposición del veredicto en `docs/grill/linear-comentarios/` se
  hace tras el ✅ y antes de publicar; es el valor por defecto de D4. Andy
  puede vetarlo al validar el paquete.

## Quién decidió

- Q1 y D11: Claude Terminal `68d8a24b`.
- Q2–Q4: recomendaciones vigentes de Claude Terminal `68d8a24b`, no
  interrogadas por el tope del brief.
- Validación final del paquete: Andy, mediante un mensaje con `✅`.
