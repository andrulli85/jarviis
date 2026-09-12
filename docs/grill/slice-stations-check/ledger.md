---
title: "Grill: slice-stations-check"
tags: [grill, decision, stations]
status: active
created: 2026-09-12
---

# Grill: slice-stations-check

**Modo:** dec · **Canal:** slice-stations-check (`4d35cade-bead-46a1-8dcd-0ff92e4e97b2`) · **Inicio:** 2026-09-12
**Brief:** `PLANS/slice-stations-check/brief.md`

## Árbol de diseño (estado)

- [x] Desglose de rebanadas verticales — DECIDIDA (Q1, D1)
  - [x] Alcance documental como criterio de su rebanada — DECIDIDO (Q1, D1)
  - [x] Lector compartido de evidencia como API concreta de salud — DECIDIDO (Q1, D2); bloquea deuda tras salud
- [x] Política D11: conjunto de checkpoints, no un único `to` — DECIDIDA (Q2, D3)
  - [ ] Base determinista para el comando cuando `merge-base --all` devuelve varias — pendiente de Build
- [x] Política D12: todo uso real de `ask()` renueva evidencia — DECIDIDA (Q3, D4)
- [x] Prioridad alta para el issue de salud — DECIDIDA (Q4, D5)
- [x] Paquete del grill — VALIDADO por Andy (2026-09-12)

## Decisiones (confirmadas por un humano)

- D1. Dos issues: salud con documentación de `--probe` y estados, y deuda de review con documentación de esa sección; el README no es un issue independiente. (Q1, 2026-09-12, Claude Terminal `68d8a24b`)
- D2. El issue de salud entrega `providers/evidence.mjs` con `readEvidence(...)`; deuda lo importa y queda bloqueada por salud, porque así una única implementación aplica D9. (Q1, 2026-09-12, Claude Terminal `68d8a24b`)
- D3. La deuda se calcula contra el conjunto de todos los `to` elegibles: `git rev-list HEAD ^to1 ^to2 …`; `lastReviewed` pasa a ser lista. Con varios checkpoints, el comando usa una base común y declara que puede incluir commits ya revisados. (Q2, 2026-09-12, Claude Terminal `68d8a24b`) — **contra la recomendación**; consecuencias aceptadas: el comando puede ser sobreinclusivo tras un merge, pero nunca subinclusivo.
- D4. Todo uso real de `providers.ask()` escribe evidencia de salud al terminar; no se limita a `--probe` ni a `adversarial-review`. (Q3, 2026-09-12, Claude Terminal `68d8a24b`)
- D5. El issue de salud tiene prioridad alta porque corrige el falso verde vigente de `stations --check`. (Q4, 2026-09-12, Claude Terminal `68d8a24b`)

## Supuestos (tuyos, hasta que alguien los confirme o corrija)

- S1. La persistencia de D4 conserva escritura atómica y dependencias inyectables sin introducir estado global en tests. Corrígeme si no.

## Registro de preguntas

### Q1 — Rebanadas y bloqueos reales
**Pregunta:** ¿El borrador queda con tres issues encadenados, o se corrige para que documentación viaje con la funcionalidad que explica y `reviewDebt()` no declare una dependencia de código inexistente sobre `health()`?
**Recomendación:** Dos issues independientes: salud + su documentación operacional, y deuda de review + su documentación. `health()` + `stations.mjs` sí forma una rebanada vertical; un README no se demuestra solo y `reviewDebt()` lee evidencia de review por cuenta propia, de modo que el bloqueo actual es de orden, no necesariamente técnico.
**Respuesta:** "B, contra mi propia recomendación". Dos issues, cada uno con su README como criterio: salud (`health()`, `--probe`, estado, render/exit) y deuda (`reviewDebt()`, sección y JSON), con `docs/plans/fabrica.md` en el último cierre. Claude Terminal propuso además que salud entregue un lector común de evidencia y que deuda lo importe, de modo que el bloqueo 1 → 2 representa esa API compartida. — Claude Terminal `68d8a24b`, 2026-09-12

### Q2 — Dos checkpoints de review en ramas que luego se fusionan
**Pregunta:** Si dos evidencias `ok:true` tienen `to` ancestro de `HEAD`, pero esos `to` son incomparables entre sí (por ejemplo, revisiones separadas de las dos ramas de un merge), ¿qué checkpoint usa `reviewDebt()`?
**Recomendación:** No elegir ninguno: informar evidencia ambigua y requerir una review de `HEAD`. El criterio actual de D11 ordena ancestros comparables con `merge-base --is-ancestor`, pero no crea un orden para dos padres de merge; usar fechas de commits o del archivo inventaría una relación que Git no prueba.
**Respuesta:** "Ninguna de las tres; propongo D". Usar todos los `to` ancestros como exclusiones de `git rev-list`, para retener reviews válidas de padres de merge separados; `lastReviewed` es una lista. Para el único rango que acepta `adversarial-review`, usar el merge-base de los checkpoints e informar su sobreinclusión. — Claude Terminal `68d8a24b`, 2026-09-12

### Q3 — Persistencia de salud desde `ask()`
**Pregunta:** ¿`ask()` escribe evidencia de salud tras cualquier uso real (A) o solo tras `--probe` y `adversarial-review` (B)?
**Recomendación:** A: permite que Claude y OpenRouter renueven la ventana con su uso operativo real.
**Respuesta:** A. — Claude Terminal `68d8a24b`, 2026-09-12

### Q4 — Prioridad de Salud
**Pregunta:** ¿el issue que corrige el falso verde de `stations --check` tiene prioridad alta (A) o normal (B)?
**Recomendación:** A: la señal engañosa ya afecta el control operativo.
**Respuesta:** A. — Claude Terminal `68d8a24b`, 2026-09-12
