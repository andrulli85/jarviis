---
title: "ADR: desglose de stations --check"
tags: [adr, slice, stations, linear]
status: active
created: 2026-09-12
---

# ADR: desglose de `stations --check`

**Modo:** `dec`  
**Canal:** slice-stations-check (`4d35cade-bead-46a1-8dcd-0ff92e4e97b2`)  
**Brief:** `PLANS/slice-stations-check/brief.md`  
**Ledger:** `PLANS/slice-stations-check/ledger.md`  
**Rondas:** 2 de 2; la segunda incorporó una réplica porque D3 contradijo la recomendación inicial.
**Validación:** Andy `df3bc9cf` mediante `✅` el 2026-09-12 (evento `fa39c5c7f548ea8aadc5bf9d5a9abadf3fcd7451f45177b263418a805a66d86c`).

## Contexto

El borrador proponía tres issues encadenados: salud de proveedores, deuda de review y documentación. Había que comprobar que las rebanadas fueran demostrables solas, que el bloqueo fuera técnico y que D11 no perdiera revisiones válidas tras un merge.

## Opciones consideradas

### Q1 — Granularidad y bloqueo

- **A:** tres issues 1 → 2 → 3. Conserva un ticket documental aislado, pero contradice la regla de Slice: documentación de una entrega no es una rebanada demostrable por sí misma.
- **B:** dos issues, llevando la documentación como criterio de aceptación. Mantiene dos demostraciones autónomas.
- **C:** un único issue. Reduce coordinación, pero une salud y deuda de review, que son comportamientos comprobables por separado.

### Q2 — Checkpoints de review en una historia no lineal

- **A:** descartar checkpoints incomparables y pedir una review completa.
- **B/C:** elegir un único `to` por fecha del commit o de la evidencia. Ambas opciones inventan un orden que la historia Git no garantiza.
- **D:** tratar todos los `to` elegibles como un conjunto de commits ya cubiertos. Conserva las revisiones de ambas ramas; el único rango de reparación puede ser sobreinclusivo.

## Decisión

1. Se publicarán **dos** issues, no tres:
   - **Salud** (alta): `providers.health()`, `--probe`, `health.json`, persistencia desde `ask()`, render, exit y README de `--probe`/estados.
   - **Deuda de review** (normal): `reviewDebt()`, sección “Review pendiente”, `--json review`, README de la sección y la fila de `docs/plans/fabrica.md` al cerrarla.
2. Salud entrega `providers/evidence.mjs`, con `readEvidence({ evidenceDir })` y los registros válidos más `ignored`. Deuda lo importa: el bloqueo Salud → Deuda es una API compartida concreta, no solo orden de trabajo.
3. D11 se reemplaza por cálculo de conjunto: para cada evidencia `ok:true` cuyo `to` sea ancestro de `HEAD`, `pending` se obtiene con `git rev-list HEAD ^<to1> ^<to2> …`. `lastReviewed` pasa de objeto a lista de checkpoints.
4. Para mantener el único rango que entiende `/adversarial-review`, un solo checkpoint produce `<to>..HEAD`; varios usan una base común de los checkpoints y la salida advierte que puede releer commits ya revisados. El cálculo de `pending` sigue siendo exacto.
5. Todo uso real de `providers.ask()` escribe evidencia de salud al terminar (D12); el issue de Salud conserva prioridad alta.

## Consecuencias aceptadas

- Se elimina el issue documental y se trasladan sus criterios a los dos issues funcionales.
- No se duplica el parseo D9; la coherencia de timestamp, `mtime`, corrupción, fechas futuras e `ignored` tiene una sola implementación.
- Tras un merge de ramas revisadas por separado, el comando sugerido puede ser más amplio que `pending`; nunca debe omitir deuda real.
- El contrato y los tests del issue de deuda deben actualizar `lastReviewed` a lista y cubrir dos `to` incomparables.
- La evidencia de salud se renueva también mediante usos productivos de Claude y OpenRouter, no solo por sondeos explícitos.

## Supuestos sin confirmar

- D13 permanece a validar por Build: estado atómico, ruta y reloj inyectables.

## Pendientes con dueño

- **Build:** si `git merge-base --all` devuelve varias bases, elegir una de forma determinista para el comando y documentar que todas son sobreinclusivas; no afecta `pending`.
- **Claude Terminal:** actualizar `docs/tickets/stations-check-proveedores-y-review.json` con los dos issues, el bloqueo técnico y el contrato de conjunto; no publicar en Linear hasta el `✅` de Andy.
- **Andy:** validar este ADR con un mensaje que contenga `✅` antes de publicar el borrador.
