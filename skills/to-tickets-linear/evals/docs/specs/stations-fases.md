---
title: "Script npm run stations con estado real de las estaciones"
status: planned
date: 2026-09-11
issue: null
---

# `npm run stations`

Un script que imprime la tabla de estaciones con su estado real (existe / sin enlazar / por
construir) sin necesitar entrada, con `--json` y `--check` (exit 1 si falta algo).

## Decisiones

- `stationStatus(station, world)` se extrae de `buildRoute` en `route.mjs`; una sola regla de estado.
- Script en `scripts/stations.mjs`, `"stations"` en `package.json`.
- Tests con fixture temporal y symlinks reales; sin e2e.

## Plan: una PR, tres commits

### Fase 1 — Refactor de `route.mjs` sin cambio visible
Extraer `stationStatus`; `buildRoute` la usa. Tests existentes en verde sin tocar, más un test
directo de `stationStatus`.

### Fase 2 — `stations.mjs` + script npm
`collectStations`, `renderStations`, `failures`; flags `--json` y `--check`; `package.json`.
Se verifica con `npm run stations` (5 filas) y `npm run stations -- --check; echo $?` → 0.

### Fase 3 — Tests y README
`test/stations.test.mjs` con cuatro casos sobre la fixture; párrafo en el README con los tres
comandos y los estados.
