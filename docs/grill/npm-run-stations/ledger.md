# Grill: npm-run-stations

**Modo:** plan · **Canal:** npm-run-stations (`18d682a4-8530-4868-be14-f3763c8fb558`) · **Inicio:** 2026-09-11
**Brief:** `PLANS/npm-run-stations/brief.md` (fuente: `docs/specs/anadir-un-script-npm-run.md` en `~/personal/claude-toolkit/jarviis`)
**Hilo raíz:** `555dcb41472e392d93c06f2890e2040cbdd761666429cb5ad45e6d0943338a8b`

## Hechos verificados antes de preguntar (leídos en el repo, commit `7d15c79`)

- `skills/wayfinder/scripts/route.mjs` ya exporta `STATIONS`, `findSkill(name, world)` y `buildRoute(input, world)`. El cálculo del estado por estación (skills → `por construir` / `sin enlazar` / `manual` / `existe`) está **inline** dentro del `.map` de `buildRoute` (líneas ~170-180), no es función aparte.
- El estado `sin enlazar` **ya existe** en `findSkill` (brief punto 2 desactualizado): repo `skills/<x>/SKILL.md` presente y `~/.claude/skills/<x>/SKILL.md` ausente → `sin enlazar` + comando `ln -s`. Está testeado en `skills/wayfinder/test/route.test.mjs:90`.
- Lo que `findSkill` **no** distingue: enlace en `~/.claude/skills/<x>` que apunta a otra copia (p. ej. `andy-toolkit`). Hoy eso da `existe`. Caso real hoy: `adversarial-review`, `buzz-kickoff`, `git-conventions`, `learnings` apuntan a `claude-toolkit/andy-toolkit/skills/`; solo `build-kickoff`, `to-tickets-linear`, `wayfinder` apuntan a `jarviis/skills/`.
- `providers.status()` (`providers/index.mjs:129`) es solo disco + env: `existsSync` sobre binarios, presencia de clave OpenRouter, `detectAuthor(env)`. Sin red ni subprocesos → no "tarda".
- Tests existentes inyectan `world` con `mkdtempSync` (skillsDir, pluginsDir, cwd, factoryDir, providers) → el patrón de fixture en HOME temporal ya está resuelto.
- `package.json` scripts: `test`, `ask`. `ask` vive en `providers/bin/ask.mjs`.

## Árbol de diseño (estado)

- [x] Mecanismo: extraer `stationStatus(station, world)` de `buildRoute` — DECIDIDA (Q1, D1)
  - [x] Ubicación: `skills/wayfinder/scripts/stations.mjs` — DECIDIDA (Q2, D2)
  - [x] Tests: fixture temporal con symlinks, sin e2e — DECIDIDA (Q7, D7)
- [x] Enlace a otra copia → estado nuevo `otra copia` en `findSkill` — DECIDIDA (Q3, D3)
- [x] Proveedores: columna por estación + pie con estado bruto — DECIDIDA (Q4, D4)
  - [x] Review sin autor → muestra ambas familias, `available: null` — DECIDIDA (Q4, D4)
- [x] Formato: markdown + `--json` — DECIDIDA (Q5, D5)
- [x] Código de salida: 0 por defecto, `--check` sale 1 — DECIDIDA (Q6, D6)
- [x] Alcance del MVP / fases — CERRADA por el interrogador con D1-D7: una sola PR en tres fases (ver `verdict.md`); no quedaba decisión de producto que preguntar. Frontera vacía el 2026-09-11.

## Decisiones (confirmadas por un humano)

- D1. La regla de agregación del estado por estación se extrae de `buildRoute` a una función exportada `stationStatus(station, world)` en `skills/wayfinder/scripts/route.mjs`; `buildRoute` y el script nuevo la llaman. Sin segunda copia. (Q1, 2026-09-11, Andy `df3bc9cf`)
- D2. El script vive en `skills/wayfinder/scripts/stations.mjs`, importa `./route.mjs`; `package.json` añade `"stations": "node skills/wayfinder/scripts/stations.mjs"`; su test va en `skills/wayfinder/test/`. (Q2, 2026-09-11, Andy `df3bc9cf`, respondió "✅" a la recomendación)
- D3. `findSkill` gana un estado `otra copia`: la skill está en `skills/<x>/` de la fábrica y `~/.claude/skills/<x>/SKILL.md` existe pero `realpathSync` no cae dentro de la fábrica. Devuelve `where` = ruta real y `link` = `ln -sfn <fábrica> <personal>`. Prioridad de agregación: por construir > sin enlazar > otra copia > manual > existe. En el wayfinder no bloquea el siguiente paso (la skill es invocable); imprime la línea de arreglo. (Q3, 2026-09-11, Andy `df3bc9cf`)
- D4. La tabla lleva la columna de proveedor por estación (sale de `stationStatus`) y una línea de pie con `providers.status()` bruto (`claude`, `codex`, `openrouter`, `author`). Para Review sin autor (`CE_REVIEW_AUTHOR` ausente), `providerFor` devuelve `available: null` + `channels: {claude, codex}` y `stations` pinta "opuesta al autor: claude ✓ · codex ✓"; el wayfinder conserva su mensaje actual. (Q4, 2026-09-11, Andy `df3bc9cf`)
- D5. Markdown por defecto, `--json` opcional con `{ stations, providers, cwd }` reutilizando los objetos de `stationStatus` y `providers.status()`. Invocación con flag: `npm run stations -- --json`, documentada en el README. (Q5, 2026-09-11, Andy `df3bc9cf`)
- D6. Sale 0 por defecto. Con `--check` sale 1 si alguna skill está en `por construir`/`sin enlazar`/`otra copia`, algún proveedor tiene `available: false`, o en Review sin autor falta alguna de las dos familias. `manual` no cuenta como fallo. (Q6, 2026-09-11, Andy `df3bc9cf`, "acepto tu recomendación")
- D7. Tests en `skills/wayfinder/test/` con el fixture `fakeWorld` de `route.test.mjs` ampliado para crear symlinks reales (a la fábrica → `existe`; a otro directorio → `otra copia`; ausente → `sin enlazar`). Se prueban `stationStatus`, `renderStations` y `failures(result)`; el bloque `main` de `stations.mjs` queda sin test, como el de `route.mjs`. Sin test end-to-end. (Q7, 2026-09-11, Andy `df3bc9cf`)

## Supuestos (míos, hasta que alguien los confirme o corrija)

- S1. El script se ejecuta con `cwd` = raíz del repo `jarviis` (así lo hace `npm run`), así que no necesita `--cwd`. Corrígeme si no.
- S2. Todo (D1-D7 + README) va en **una sola PR**, en tres fases de commit; no hace falta partirlo. Corrígeme si prefieres dos PRs (refactor de `route.mjs` aparte del script).
- S3. La comparación de `otra copia` es "la ruta real del `SKILL.md` personal está dentro de `factoryDir`" (prefijo de `realpathSync(factoryDir)`), no "es exactamente el symlink esperado". Así un checkout de `jarviis` en otra ruta también cuenta como fábrica. Corrígeme si no.
- S4. `renderStations` es una función nueva en `stations.mjs`, no un modo de `renderMarkdown`: la tabla es la misma pero sin "Entrada → entra por", sin "Preguntas abiertas" y sin "Siguiente paso".

## Registro de preguntas

### Q1 — Mecanismo: de dónde sale el estado por estación
**Pregunta:** ¿Extraemos de `buildRoute` una función exportada `stationStatus(station, world)` (o similar) que devuelva `{skills, provider, status}` para una estación, y tanto `buildRoute` como el nuevo script la llamen? Alternativas: (b) el script llama a `buildRoute("x")` con una entrada ficticia y descarta `next`/`questions`/`slug`; (c) el script reimplementa el bucle con `findSkill` + `providerFor` (habría que exportar `providerFor`).
**Recomendación:** (a). `findSkill` ya está exportado, pero la regla de agregación (qué gana: por construir > sin enlazar > manual > existe) está dentro de `buildRoute`; si el script la copia, es la copia la que diverge. (b) obliga a inventar una entrada y a que la tabla dependa de `ENTRY_KIND` (entrar por Shape con una "idea" da las 5, pero es accidental).
**Respuesta:** "A" — Andy `df3bc9cf`, 2026-09-11

### Q2 — Ubicación del archivo del script
**Pregunta:** ¿(a) `skills/wayfinder/scripts/stations.mjs` (junto a `route.mjs`, importa `./route.mjs`), (b) `providers/bin/stations.mjs` (junto a `ask.mjs`), o (c) un `bin/` nuevo en la raíz?
**Recomendación:** (a). Import `./route.mjs`, su test cae en `skills/wayfinder/test/` que el glob de `npm test` (`skills/*/test/*.test.mjs`) ya cubre, y `providers/bin/` es el CLI de proveedores, no de estaciones. `package.json`: `"stations": "node skills/wayfinder/scripts/stations.mjs"`.
**Respuesta:** "✅" (acepta la recomendación, a) — Andy `df3bc9cf`, 2026-09-11

### Q3 — Enlace que apunta a otra copia del skill
**Pregunta:** Cuando `skills/<x>/` está en la fábrica y `~/.claude/skills/<x>` existe pero su `realpath` no es la copia de la fábrica (hoy: 4 skills apuntan a `andy-toolkit`), ¿(a) estado nuevo `otra copia` en `findSkill`, con `where` = ruta real y `link` = `ln -sfn` de arreglo, agregando por debajo de `sin enlazar` y por encima de `manual`/`existe`, visible en wayfinder y en stations; (b) sigue siendo `existe` y se añade solo una nota con la ruta real; (c) se ignora, hoy no hay ningún skill duplicado?
**Recomendación:** (a). El script existe para detectar instalación desviada, y "el enlace apunta al toolkit viejo" es exactamente ese caso; como estado y no nota, el código de salida (Q6) puede contarlo. Para el wayfinder la skill sigue siendo invocable, así que el "siguiente paso" ejecuta el comando y añade la línea de arreglo, no bloquea.
**Respuesta:** "A" — Andy `df3bc9cf`, 2026-09-11

### Q4 — Proveedores en la tabla
**Pregunta:** `providers.status()` es barato (disco + env). ¿(a) la columna de proveedor por estación sale igual que en el wayfinder (viene gratis con `stationStatus`), más una línea de pie con el estado bruto (`claude`, `codex`, `openrouter`, `author`); (b) solo skills, sin proveedores; (c) solo la línea de pie global, sin columna por estación? Sub-decisión: Review usa `opposite: "author"` y sin `CE_REVIEW_AUTHOR` `providerFor` responde "no disponible: no sé quién escribió el cambio". Sin entrada nunca hay autor, así que en `stations` eso sería ruido permanente.
**Recomendación:** (a), y para Review sin autor `stations` muestra la disponibilidad de ambas familias ("opuesta al autor: claude ✓ · codex ✓") en vez de "no disponible": la instalación está bien si las dos responden; qué familia toca se sabrá cuando haya PR. Implementación: `providerFor` devuelve `available: null` + `channels: {claude, codex}` cuando no hay autor y el render lo pinta así; el wayfinder mantiene su mensaje porque ahí sí hay cambio que revisar.
**Respuesta:** "A" — Andy `df3bc9cf`, 2026-09-11

### Q5 — Formato de salida
**Pregunta:** ¿(a) markdown por defecto y `--json` opcional, mismo patrón que `route.mjs`, con el JSON = `{ stations: [<salida de stationStatus>…], providers: <status() bruto>, cwd }`; (b) solo markdown; (c) JSON por defecto y markdown con flag?
**Recomendación:** (a). `route.mjs` ya parsea `--json` en su `main`; `stations.mjs` copia la convención y el JSON reutiliza tal cual los objetos que ya devuelve `stationStatus`, sin formato propio. Un agente (p. ej. el wayfinder o un check de instalación) lo consume sin parsear markdown. Con `npm run stations -- --json` el `--` es de npm; documentarlo en el README.
**Respuesta:** "A" — Andy `df3bc9cf`, 2026-09-11

### Q6 — Código de salida
**Pregunta:** ¿(a) siempre 0, el humano lee; (b) 1 siempre que alguna estación no esté `existe`/`manual` o algún proveedor falte; (c) 0 por defecto y flag `--check` que sale 1 con los mismos criterios de (b)?
**Recomendación:** (c). Con (b), `npm run stations` termina con el bloque `npm error` de npm debajo de la tabla cada vez que falte algo, y el uso principal es mirar la tabla. Con `--check` un script de instalación (`npm run stations -- --check`) tiene su señal sin ensuciar el caso humano. Criterio de fallo con `--check`: alguna skill en `por construir`/`sin enlazar`/`otra copia`, o algún proveedor con `available: false`, o (Review sin autor) alguna de las dos familias en `channels` a `null`. `manual` no es fallo: es diseño.
**Respuesta:** "acepto tu recomendación" (c) — Andy `df3bc9cf`, 2026-09-11

### Q7 — Tests
**Pregunta:** ¿(a) fixture en directorio temporal con `mkdtempSync` (el patrón ya existe en `route.test.mjs:73-87`) ampliado con symlinks reales: uno a la fábrica (`existe`), uno a otro directorio (`otra copia`), uno ausente (`sin enlazar`); se prueban `stationStatus`, `renderStations` y una función pura `failures(result)` que alimenta `--check`; el bloque `main` queda sin test, como en `route.mjs`; (b) además un test end-to-end que hace `spawnSync` del script con `HOME` y `CE_*_BIN` apuntando al temporal; (c) solo el render?
**Recomendación:** (a). Cubre las tres cosas nuevas (estado `otra copia`, agregación extraída, criterio de `--check`) con el mismo fixture que ya usa el repo, sin depender de la máquina. (b) añade un test que toca `homedir()`, binarios y `process.exit`: caro para lo que verifica (que `main` parsea flags), y el patrón del repo ya deja `main` fuera. (c) deja `otra copia` sin red de seguridad justo donde cambia `findSkill`.
**Respuesta:** "A" — Andy `df3bc9cf`, 2026-09-11

## Cierre

Frontera vacía tras Q7. Veredicto en `PLANS/npm-run-stations/verdict.md` (2026-09-11).
Cerrado con "✅" por Andy `df3bc9cf` el 2026-09-11 21:14 UTC (evento `b7151555`). S1-S4 quedan sin confirmar explícitamente; se aceptan por el cierre y siguen marcados como supuestos en el veredicto.
