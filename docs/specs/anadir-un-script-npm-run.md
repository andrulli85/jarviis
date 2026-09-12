---
title: "Script npm run stations que imprime la tabla de estaciones con su estado real"
status: planned
date: 2026-09-11
issue: null
grill: docs/grill/npm-run-stations/verdict.md
---

# `npm run stations`: comprobar la instalación de la fábrica de un vistazo

Añadir un script `npm run stations` que imprima la tabla de las cinco estaciones con su estado
real (existe / sin enlazar / otra copia / manual / por construir) sin necesitar una entrada, para
comprobar la instalación de la fábrica de un vistazo y, con `--check`, desde un script.

Entrada del wayfinder (idea, 2026-09-11) interrogada en Buzz el mismo día: decisiones D1–D7 y
supuestos S1–S4 en [`docs/grill/npm-run-stations/verdict.md`](../grill/npm-run-stations/verdict.md).
Esta spec es el desglose en rebanadas que Slice convierte en issues; el detalle de cada cambio
está en el veredicto y no se repite aquí.

## Decisiones

| D | Decisión |
|---|---|
| D1 | `stationStatus(station, world)` extraída de `buildRoute`; una sola copia de la regla de estado |
| D2 | Script en `skills/wayfinder/scripts/stations.mjs`; `"stations"` en `package.json` |
| D3 | Estado nuevo `otra copia` en `findSkill` (ruta real fuera de `realpathSync(factoryDir)`, comparado con `path.relative`), con `ln -sfn` de arreglo; no bloquea al wayfinder |
| D4 | Columna de proveedor por estación + pie con `providers.status()`; Review sin autor muestra ambas familias |
| D5 | Markdown por defecto; `--json` opcional |
| D6 | Exit 0 por defecto; `--check` sale 1 si hay fallos; `manual` no es fallo |
| D7 | Tests con fixture temporal y symlinks reales; sin e2e; `main` sin test |
| S1 | Mantiene `--cwd DIR` como `route.mjs` |
| S4 | `renderStations` es función nueva; `stationRow(s)` compartida con `renderMarkdown` |

## Rebanadas

Una PR, tres commits (S2). Cada rebanada se verifica sola con `npm test`.

### 1. Refactor de `route.mjs` sin cambio visible (D1, D3, D4, S3, S4)

- Extraer `stationStatus(station, world)` y `stationRow(s)`; `buildRoute` y `renderMarkdown` las usan.
- `findSkill` distingue `otra copia` (realpath de ambos lados, `path.relative`) y devuelve `link: ln -sfn …`.
- `providerFor` con `opposite: "author"` sin autor devuelve `available: null` con `channels: { claude, codex }`.
- `renderMarkdown` imprime el `ln -sfn` de una skill en `otra copia` sin bloquear.

Criterios: tests existentes en verde sin tocar; tests nuevos para `otra copia` con symlink real,
`stationStatus` directo, Review sin autor. `fakeWorld` gana `linked: [...]` para crear symlinks.

### 2. `stations.mjs` + script npm (D2, D4, D5, D6, S1) — bloqueada por 1

- `collectStations(world)`, `renderStations(result)`, `failures(result)` exportadas.
- `main` con `--json`, `--check`, `--cwd`; exit `--check && failures.length ? 1 : 0`.
- `package.json`: `"stations": "node skills/wayfinder/scripts/stations.mjs"`.

Criterios: `npm run stations` imprime 5 filas; `-- --json | jq '.stations | length'` → 5;
`-- --check; echo $?` → 0 en esta máquina. Documentar que con `--check` fallido npm añade su
bloque `npm error` (esperado, D6).

### 3. Tests y README (D7) — bloqueada por 2

- `skills/wayfinder/test/stations.test.mjs`: todo enlazado; una `sin enlazar` + una `otra copia` + una
  `por construir` (3 `failures`, los `ln` listados); providers sin codex → Review `codex ✗`;
  `renderStations` no contiene "Siguiente paso". `fakeWorld` a `helpers.mjs` si hace falta más de la
  mitad de sus parámetros.
- README "Skills de la fábrica": `npm run stations`, `-- --json`, `-- --check`, los cinco estados y el
  recordatorio de reiniciar la sesión tras enlazar.

Criterios: `npm test` en verde; `git diff --stat` solo toca `route.mjs`, `route.test.mjs`,
`stations.mjs`, `stations.test.mjs`, `package.json`, `README.md` (y `helpers.mjs` si se extrae).

## Fuera de alcance

Migrar las 4 skills que hoy apuntan a `andy-toolkit` a `jarviis/skills/`. El script las mostrará
como `existe` hasta que exista copia en la fábrica; entonces pasarán a `otra copia` con el
`ln -sfn` listo.
