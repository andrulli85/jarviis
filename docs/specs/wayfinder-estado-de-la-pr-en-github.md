---
title: "El wayfinder entra por Review o Ship según el estado real de la PR en GitHub"
status: sliced
date: 2026-09-12
issue: [JAR-13]
grill: null
---

# El wayfinder entra por Review o Ship según el estado real de la PR en GitHub

`/wayfinder <url de PR>` entra hoy por Review, y por Ship solo si el texto dice "merged". Con
`gh` en la máquina, el wayfinder lee el estado real de la PR y entra por la estación que
corresponde; sin `gh`, sin repo GitHub o con error, se comporta como hoy y lo dice en una
pregunta abierta. Repite el mecanismo de JAR-12 (lector inyectable en `world`,
`entryForState`, cabecera con fuente) para la segunda fuente de verdad.

Interrogado con `/grilling` el 2026-09-12 (7 preguntas, dos rondas). Historia:
[JAR-13](https://linear.app/jarviis-app/issue/JAR-13), bloqueada por JAR-12 (Done).

## Decisiones

| Q | Decisión |
|---|---|
| Q1 | Fuente: `gh pr view <ref> --json state,isDraft,headRefName`; mapeo `MERGED` → Ship, `OPEN` (borrador o no) → Review, `CLOSED` sin merge → sin ruta y pregunta. Sin `gh`, como "sin clave" en JAR-12 |
| Q2 | Una PR por número ("PR #4") se resuelve contra el repo del `cwd` (`gh pr view 4`); si el cwd no tiene remoto GitHub, como hoy + pregunta |
| Q3 | Unitarios con `world.prState` inyectado; un test del lector real con un doble de `gh` al frente del `PATH`; nada toca la red |
| Q4 | No se cruza con Linear: la PR manda. Avisar discrepancias sería otra historia |
| Q5 | Misma forma que JAR-12: cabecera con fuente y `state: { source: "github", state, draft, url }` o `null` con causa en `questions` |
| Q6 | Cuando `gh` responde, manda sobre la palabra "merged" del texto; si discrepan, la cabecera lo dice. Sin lectura, la palabra cuenta como hoy |
| Q7 | Dos evals: `pr-state-from-github` (doble de `gh` → Ship) y negativo `no-gh-no-token-hunting` |

## Contrato

### `ghPrState(ref, { cwd, env, execFn })` en `route.mjs`

`ref` es la URL de la PR o su número. Ejecuta `gh pr view <ref> --json state,isDraft,url,headRefName`
en `cwd` con timeout 3 s y devuelve `{ state: "OPEN"|"MERGED"|"CLOSED", draft, url, branch }`.
Lanza con causa legible si `gh` no está en `PATH` (`sin gh`), si `gh` sale con error (`sin repo
GitHub en el cwd`, o el mensaje de `gh` recortado) o si el JSON no trae `state`. `execFn`
inyectable para el test del doble.

### Mapeo

`entryForState` gana la forma GitHub: `{ source: "github", state, draft }` → `MERGED` → `ship`;
`OPEN` → `review`; `CLOSED` → `null` (sin ruta). La forma Linear no cambia.

### `world.prState`

`buildRoute` acepta `world.prState: (ref) => Promise<{state, draft, url, branch} | null>`. Por
defecto: `ghPrState` si `gh` está en `PATH` (`which gh`), `null` si no. Se consulta **solo**
cuando `kind === "pr"` o `"merged"`. Ideas, specs e issues no lo tocan.

Cuando hay lectura, `entry` sale de ella (la palabra "merged" del texto no cuenta); cuando no,
`kind` decide como hoy. Si el texto decía "merged" y `gh` dice `OPEN`, la cabecera añade
"(dijiste mergeada; GitHub la tiene abierta)".

### Salida

- Cabecera: `PR #13 está **mergeada** en GitHub → entra por **Ship / Learn**`; variantes
  `abierta`, `abierta (borrador)`, `cerrada sin mergear` (esta última sin ruta: `next: null` y la
  pregunta "¿reabrir o descartar?"). Sin lectura: nada en la cabecera y la pregunta
  `no pude leer el estado de la PR #13 en GitHub (<causa>); si está mergeada, entra por Ship`.
- `--json`: `state: { source: "github", state, draft, url, branch }` o `null`. `entry`, `path`,
  `branches`, `next` se derivan de la entrada.
- `<key>` de los comandos (`/learnings <key>`): si `branch` trae una clave de Linear
  (`jar-12`), se rellena con ella en mayúsculas; si no, queda el placeholder visible.

## Rebanada (una)

- `route.mjs`: `ghPrState` exportada; `entryForState` con la forma GitHub; `buildRoute` consulta
  `world.prState` en `kind` `pr`/`merged`, deriva `entry`, rellena `<key>` desde la rama; cabecera
  y pregunta con causa; `renderMarkdown` sin cambios de estructura (misma línea de estado que
  JAR-12). `stations.mjs`, `flows.mjs`, `linear.mjs`: sin cambios.
- `route.test.mjs`: `entryForState` con la forma GitHub (las tres + draft); `buildRoute` con
  `prState` inyectado (MERGED → Ship, OPEN → Review, OPEN+draft → Review con "borrador",
  CLOSED → sin ruta y pregunta, lector que lanza → como hoy + causa, lector `null` → como hoy
  + "sin gh"; texto "merged" + OPEN → Review con la discrepancia en la cabecera; `<key>` relleno
  desde la rama); idea, spec e issue nunca invocan el lector; golden de JAR-9/JAR-12 intacto.
- Test del lector: doble de `gh` (script en un directorio temporal, al frente del `PATH`, que
  anota argumentos y responde JSON fijo) para OPEN/MERGED, salida no JSON y exit 1.
- `evals.json` del wayfinder: `pr-state-from-github` (sandbox con el doble de `gh` respondiendo
  MERGED y rama `jar-12-…`; `/wayfinder https://github.com/o/r/pull/13` → cabecera, entra por
  Ship, termina con `/learnings JAR-12`, sin escrituras) y negativo `no-gh-no-token-hunting`
  (`PATH` sin `gh`; misma URL → Review como hoy, pregunta con "sin gh"; el transcript no
  contiene `brew install`, `gh auth`, `api.github.com` ni pide token). Los 10 existentes sin
  tocar.
- `SKILL.md` del wayfinder: paso 1 dice que con `gh` lee el estado de la PR; la regla única
  gana "no instala ni autentica nada: sin `gh`, pregunta".

Criterios: `npm test` en verde; en esta máquina,
`node skills/wayfinder/scripts/route.mjs "https://github.com/andrulli85/jarviis/pull/13"`
imprime la cabecera "mergeada" y termina con `/learnings JAR-12`;
`PATH=/usr/bin:/bin node … "…/pull/13"` imprime Review, la pregunta con "sin gh" y termina con
`/adversarial-review`; evals del wayfinder 12/12.

## Fuera de alcance

- Cruzar el estado de la PR con el del issue en Linear (Q4).
- Leer GitHub sin `gh` (API directa con token).
