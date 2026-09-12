# Veredicto: `npm run stations`

**Modo:** plan · **Canal:** npm-run-stations (`18d682a4-8530-4868-be14-f3763c8fb558`) · **Cierre:** 2026-09-11
**Brief:** `PLANS/npm-run-stations/brief.md` · **Ledger:** `PLANS/npm-run-stations/ledger.md`
**Repo:** `~/personal/claude-toolkit/jarviis` (commit base `7d15c79`) · **Decidió:** Andy `df3bc9cf` (D1-D7)

## Objetivo

Un script `npm run stations` que imprima la tabla de las cinco estaciones de `skills/wayfinder/stations.json`
con su estado real en esta máquina (skills enlazadas, proveedores), sin entrada, para comprobar la
instalación de la fábrica de un vistazo y, con `--check`, desde un script.

## Fases (una sola PR, tres commits)

### Fase 1 — Refactor de `route.mjs` sin cambio de comportamiento (D1, D3, D4)

**Objetivo:** que el estado por estación sea una función reutilizable y que `findSkill` distinga un
enlace desviado.

**Entradas:** `skills/wayfinder/scripts/route.mjs`, `skills/wayfinder/test/route.test.mjs`.

**Cambios:**
1. Extraer del `.map` de `buildRoute` una función exportada `stationStatus(station, world)` que devuelve
   `{ n, id, name, in, out, skills, manual, provider, status, command }` (lo mismo que hoy construye
   inline). `buildRoute` pasa a llamarla. Prioridad de agregación:
   `por construir > sin enlazar > otra copia > manual > existe`.
2. `findSkill`: cuando la skill está en `factoryDir/<name>/SKILL.md` **y** el `SKILL.md` personal existe
   pero `realpathSync` de ese archivo no cae dentro de `realpathSync(factoryDir)` → `{ status: "otra copia",
   where: <ruta real>, link: "ln -sfn <fábrica> <personal>" }` (S3).
3. `providerFor` con `opposite: "author"` y sin autor → `{ need, opposite: null, available: null,
   channels: { claude: <bin|null>, codex: <bin|null> }, why: <mensaje actual> }`. `renderMarkdown` del
   wayfinder sigue imprimiendo `**proveedor no disponible**: <why>` cuando `available !== true` (sin
   cambio visible).
4. `renderMarkdown`: para `otra copia` en la primera estación, imprime el comando y la línea de arreglo
   (`ln -sfn …`), sin bloquear.

**Entregable verificable:** `npm test` en verde con los tests actuales sin tocar (verificado el
2026-09-11: ningún test existente pone el mismo nombre en `personal` y `factory` a la vez, así que
`otra copia` no altera ninguno) más tests nuevos: `otra copia` con symlink real a otro directorio;
`stationStatus` directo sobre una estación; Review sin autor devuelve `available: null` con `channels`.

**Riesgos:** `fakeWorld` crea las skills personales como directorios reales, no symlinks; un test futuro
que ponga el mismo nombre en `personal` y `factory` verá `otra copia` sin querer. Mitigación: comentario
en `fakeWorld` y un parámetro `linked: [...]` que cree symlinks a `factoryDir`.

### Fase 2 — `stations.mjs` + script npm (D2, D4, D5, D6)

**Objetivo:** el comando en sí.

**Entradas:** fase 1 mergeada en la misma rama; `package.json`.

**Cambios:**
1. `skills/wayfinder/scripts/stations.mjs`, ESM, importa `{ STATIONS, stationStatus }` de `./route.mjs`
   y `{ status as providersStatus }` de `../../../providers/index.mjs`.
2. `collectStations(world = {})` exportada: mismo `world` inyectable que `buildRoute` (cwd, skillsDir,
   pluginsDir, providers, factoryDir); devuelve `{ stations: STATIONS.map(s => stationStatus(s, w)),
   providers: w.providers, cwd }`. Acepta `--cwd DIR` igual que `route.mjs` (S1 resuelto).
3. `renderStations(result)` exportada (S4): tabla `| # | Estación | Entrada → Salida | Skills | Estado |`
   como la del wayfinder, y debajo una línea de pie `Proveedores: claude <ruta|—> · codex <ruta|—> ·
   openrouter <clave presente|—> · autor <familia|—>`. Review sin autor: `opuesta al autor: claude ✓ ·
   codex ✓` (✗ donde falte). Skills en `sin enlazar`/`otra copia` llevan su `ln` en una lista "Arreglos"
   tras la tabla.
4. `failures(result)` exportada: lista de cadenas; una por skill en `por construir`/`sin enlazar`/
   `otra copia`, por proveedor con `available === false`, y por familia a `null` en `channels` cuando
   `available === null`. `manual` no entra.
5. `main` (mismo guard `invokedDirectly` que `route.mjs`): flags `--json` y `--check`. Sin `--json`
   imprime `renderStations`; con `--json`, `JSON.stringify(result, null, 2)`. Código de salida:
   `--check && failures(result).length ? 1 : 0`.
6. `package.json`: `"stations": "node skills/wayfinder/scripts/stations.mjs"`.

**Entregable verificable:** `npm run stations` imprime las 5 filas en esta máquina; `npm run stations --
--json | jq '.stations | length'` → 5; `npm run stations -- --check; echo $?` → 0 con la instalación
actual (las 8 skills existen, claude y codex presentes).

**Riesgos:** con `--check` y npm, un exit 1 imprime el bloque `npm error` de npm: es el comportamiento
elegido (D6), documentar que es esperado.

### Fase 3 — Tests y README (D7)

**Cambios:**
1. `skills/wayfinder/test/stations.test.mjs`: reutiliza `fakeWorld` (exportarla desde un
   `skills/wayfinder/test/helpers.mjs` o duplicar la mínima); casos: (a) todo enlazado → 5 filas en
   `existe`, `failures` vacío; (b) una skill `sin enlazar`, una `otra copia` (symlink a otro dir), una
   `por construir` → estados correctos, `failures` con 3 entradas, el markdown lista los `ln`;
   (c) providers sin codex → Review con `codex ✗` y `failures` lo incluye; (d) `renderStations` no
   contiene "Siguiente paso".
2. `README.md` sección "Skills de la fábrica" (línea 35): párrafo con `npm run stations`,
   `npm run stations -- --json`, `npm run stations -- --check`, los cinco estados (`existe`, `manual`,
   `sin enlazar`, `otra copia`, `por construir`) y el recordatorio de reiniciar la sesión tras enlazar.

**Entregable verificable:** `npm test` en verde en la rama; `git diff --stat` muestra solo `route.mjs`,
`route.test.mjs`, `stations.mjs`, `stations.test.mjs`, `package.json`, `README.md` (y el helper si se
extrae).

## Decisiones de origen

| D | Decisión | Q |
|---|---|---|
| D1 | `stationStatus(station, world)` extraída de `buildRoute`; una sola copia de la regla | Q1 |
| D2 | `skills/wayfinder/scripts/stations.mjs`; script `stations` en `package.json` | Q2 |
| D3 | Estado `otra copia` en `findSkill`, con ruta real y `ln -sfn`; no bloquea al wayfinder | Q3 |
| D4 | Columna de proveedor por estación + pie con `providers.status()`; Review sin autor muestra ambas familias | Q4 |
| D5 | Markdown por defecto, `--json` opcional (`npm run stations -- --json`) | Q5 |
| D6 | Exit 0 por defecto; `--check` sale 1 si hay fallos; `manual` no es fallo | Q6 |
| D7 | Tests con fixture temporal y symlinks reales; sin e2e; `main` sin test | Q7 |

## Supuestos (resueltos por Andy el 2026-09-11, en la terminal)

- S1. **Corregido**: `stations.mjs` mantiene `--cwd`. `route.mjs` ya lo acepta y `buildRoute` toma
  `world.cwd`; el script se ejecutará también directo desde otro repo para preguntar si la fábrica
  está instalada para *ese* producto (`findSkill` mira `cwd/.claude/skills`). `npm run` fija la raíz,
  pero quitar el flag no ahorra nada y pierde ese caso.
- S2. **Confirmado**: una PR, tres commits (fase = commit).
- S3. **Confirmado con matiz**: `otra copia` = ruta real del `SKILL.md` fuera de
  `realpathSync(factoryDir)`. Comparar `realpathSync` de ambos lados y decidir con `path.relative`
  (no `startsWith`: `/a/jarviis` aceptaría `/a/jarviis-old/...`).
- S4. **Confirmado con añadido**: `renderStations` es función nueva. Extraer `stationRow(s)` y que
  `renderMarkdown` y `renderStations` la compartan, para que el formato de la fila no diverja.

## Pendientes con dueño

- **Build (quien implemente):** decidir si `fakeWorld` se extrae a `helpers.mjs` o se duplica; criterio:
  extraer si `stations.test.mjs` necesita más de la mitad de sus parámetros.
- **Nadie / fuera de alcance:** migrar las 4 skills que hoy apuntan a `andy-toolkit` a `jarviis/skills/`.
  Este script las mostrará como `existe` hasta que exista copia en la fábrica; entonces pasarán a
  `otra copia` con el `ln -sfn` listo.
