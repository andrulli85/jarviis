---
title: "El wayfinder entra por la estación que dicta el estado del issue en Linear"
status: sliced
date: 2026-09-12
issue: [JAR-12]
grill: null
---

# El wayfinder entra por la estación que dicta el estado del issue en Linear

`/wayfinder JAR-8` hoy manda a Build aunque JAR-8 está Done: es el único punto donde la ruta
miente. Con `LINEAR_API_KEY` (o `~/.config/linear/key`) presente, el wayfinder lee el estado
del issue y su PR adjunta, y entra por la estación que corresponde. Sin clave, sin red o con
error, se comporta como hoy y lo dice en una pregunta abierta. Es la primera vez que el
wayfinder toca red; esta spec acota cuánta.

Interrogado con `/grilling` el 2026-09-12 (8 preguntas, dos rondas). Historia:
[JAR-12](https://linear.app/jarviis-app/issue/JAR-12), bloqueada por JAR-9. Seguimiento fuera
de alcance: [JAR-13](https://linear.app/jarviis-app/issue/JAR-13) (estado real de la PR en
GitHub).

## Decisiones

| Q | Decisión |
|---|---|
| Q1 | Mapeo por **categoría** (`state.type`) + PR adjunta, nunca por nombre de estado |
| Q2 | Se consulta solo con clave de issue y clave de API; timeout 3 s; sin clave/red/error → como hoy + pregunta abierta; sin flag `--offline` |
| Q3 | El cliente vive en `skills/to-tickets-linear/scripts/linear.mjs` (`issueState(key)`); el wayfinder lo importa |
| Q4 | PRs por GitHub fuera de alcance (JAR-13) |
| Q5 | Lector `issueState` inyectable en `world`; unitarios con respuestas inyectadas; un test del cliente real contra el stub HTTP |
| Q6 | La salida dice de dónde salió el estado: línea en la cabecera y campo `state` en `--json` |
| Q7 | `path` y `branches` se recalculan desde la entrada nueva (única variable, como en JAR-9) |
| Q8 | Dos evals nuevos: Done → Ship; negativo sin clave → Build, pregunta, sin buscar credenciales |

## Contrato

### `issueState(key, env)` en `linear.mjs`

Devuelve `{ type, name, pr }` con `type` la categoría del estado (`backlog`, `unstarted`,
`started`, `completed`, `canceled`, `duplicate`), `name` el nombre tal cual, y `pr` el
`metadata.status` del último attachment `github` (`"open"` | `"merged"`) o `null`. Lanza si
no hay clave (`apiKey()` ya lo hace), si la red falla o si el issue no existe. Timeout 3 s.
Query: `issue(id: $key) { state { name type } attachments { nodes { sourceType metadata } } }`.

### Mapeo (en `route.mjs`)

| Estado | PR | Entra por |
|---|---|---|
| `backlog`, `unstarted` | cualquiera | Build |
| `started` | ninguna | Build (el workspace existe; el comando es el mismo) |
| `started` | `open` | Review |
| cualquiera | `merged` | Ship |
| `completed` | — | Ship |
| `canceled`, `duplicate` | — | **sin ruta**: `next: null`, una pregunta ("JAR-8 está cancelado en Linear: ¿reabrir o dejarlo?") |

### `world.issueState`

`buildRoute(input, world)` acepta `world.issueState: (key) => Promise<{type,name,pr} | null>`.
Por defecto: si hay clave (`apiKey()` no lanza) usa `issueState` de `linear.mjs`; si no, `null`
sin llamar a nada. `buildRoute` pasa a ser `async` solo por este camino; `route.mjs` desde CLI
ya hace `await`. `stations.mjs` y `flows.mjs` no lo usan.

Se consulta **solo** cuando `kind === "issue"`. Ideas, specs y PRs no tocan Linear.

### Salida

- Cabecera, antes de la tabla: `JAR-8 está **Done** en Linear (PR mergeada) → entra por
  **Ship / Learn**`. Sin lectura: nada en la cabecera y una pregunta abierta
  `no pude leer el estado de JAR-8 en Linear (<causa: sin clave | sin red | no existe>); si
  ya está en revisión o mergeado, entra por Review o Ship`.
- `--json`: `state: { source: "linear", type, name, pr }` o `state: null`. `entry`, `path`,
  `branches`, `next` se derivan de la entrada nueva (Q7).

## Rebanada (una)

- `linear.mjs`: `issueState(key, env)` exportada, con timeout (`AbortSignal.timeout(3000)`).
- `test/stub.mjs` de `to-tickets-linear`: la operación `issue` responde con estado y
  attachments configurables (`world.issues`).
- `route.mjs`: `entryForState(state)` exportada (la tabla del mapeo, pura); `buildRoute` async,
  consulta `world.issueState` cuando `kind === "issue"`, recalcula `entry` y deriva todo de
  ahí; cabecera y `state` en la salida; pregunta abierta con causa cuando no hay lectura;
  `next: null` y pregunta en `canceled`/`duplicate`. `renderMarkdown` imprime la línea de
  estado y, sin `next`, termina con la pregunta en vez de un comando.
- `route.test.mjs`: `entryForState` con cada fila del mapeo; `buildRoute` con `issueState`
  inyectado (Done+merged → Ship, started+open → Review, started sin PR → Build, backlog →
  Build, canceled → sin ruta y pregunta, lector que lanza → Build + pregunta con causa, lector
  `null` → Build + pregunta "sin clave"); una idea y una spec nunca invocan el lector (contador
  en el fake); golden de JAR-9 intacto con lector `null`.
- `linear.test.mjs`: `issueState` contra el stub (Done con attachment merged; issue inexistente
  lanza; timeout lanza).
- `evals.json` del wayfinder: (1) `issue-state-from-linear`: sandbox con `JARVIIS_LINEAR_URL`
  al stub y clave falsa; `/wayfinder JAR-8` con el stub respondiendo Done+merged → cabecera de
  estado, entra por Ship, termina con `/learnings JAR-8`, sin escrituras; (2) negativo
  `no-key-no-credential-hunting`: sin `LINEAR_API_KEY` ni `~/.config/linear/key` en el sandbox;
  `/wayfinder JAR-8` → Build como hoy, pregunta abierta con causa "sin clave", y el transcript
  no contiene `curl`, `cat` de `~/.config`, ni una petición de clave al usuario; termina con
  `/build-kickoff JAR-8`. Los 8 existentes sin tocar.
- `SKILL.md` del wayfinder: paso 1 dice que con clave de Linear lee el estado del issue y por
  qué la cabecera lo muestra; la regla única gana la frase "no busca credenciales: sin clave,
  pregunta".

Criterios: `npm test` en verde; `node skills/wayfinder/scripts/route.mjs "JAR-9"` en esta
máquina imprime la cabecera "está **Done** en Linear (PR mergeada) → entra por **Ship / Learn**"
y termina con `/learnings JAR-9`; `LINEAR_API_KEY= LINEAR_KEY_FILE=/nonexistent node … "JAR-9"`
imprime Build, la pregunta con "sin clave" y termina con `/build-kickoff JAR-9`; evals del
wayfinder 10/10.

## Fuera de alcance

- Estado de PRs en GitHub (JAR-13).
- Mapear por nombre de estado, flag `--offline`, mover issues de estado (el wayfinder no escribe).
