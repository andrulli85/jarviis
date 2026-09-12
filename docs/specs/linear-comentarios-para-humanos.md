---
title: "Comentarios en las cards de Linear escritos para un humano, y linear.mjs como única puerta al tablero"
status: sliced
date: 2026-09-12
issue: [JAR-16, JAR-17]
grill: docs/grill/linear-comentarios/gpt-review.md
---

# Comentarios en las cards de Linear escritos para un humano

Linear es la única superficie que Andy mira desde el teléfono; el repo (spec, veredicto, PR,
commits, learnings) es la superficie de los agentes. Hoy en la card solo cambia el estado y
aparece la PR: el *por qué* no está. Síntomas del 2026-09-12: un issue derivado (JAR-8) apareció
sin explicación; dos issues pasaron a Done sin código porque una PR de docs los nombró; cada
skill habla con Linear por GraphQL suelto (asignar, mover, enlazar se hicieron cinco veces a
mano). Esta spec fija **qué se comenta, cuándo y quién**, y hace de `linear.mjs` la única
puerta al tablero.

Shape: propuesta de Claude Terminal + revisión de GPT-5.6 (`codex exec`, `xhigh`), veredicto
"ADOPTAR CON CAMBIOS"; prompt y respuesta en [`docs/grill/linear-comentarios/`](../grill/linear-comentarios/gpt-review.md).
Slice: quiz cruzado en Buzz (Codex Grill ↔ Claude Terminal, 2 rondas) en
[`docs/grill/slice-linear-comentarios/`](../grill/slice-linear-comentarios/verdict.md): D11 y D12.

## Decisiones

| D | Decisión | Origen |
|---|---|---|
| D1 | **La regla única**: se comenta en una card solo si Andy tomaría una decisión distinta al leerlo. Todo lo demás (progreso, logs, lo que ya dice la PR, preguntas técnicas) no se comenta | GPT (regla anti-ruido) |
| D2 | **Arranque** (Build, al abrir el workspace): una línea con alcance y plan. Sin rama ni workspace: eso ya lo muestra Conductor | GPT: quitar rama/workspace |
| D3 | **Cambio de plan**: decisión que altera el alcance, sorpresa, o bloqueo; dos o tres frases con el porqué en palabras y enlace a spec/veredicto si hay detalle. **Obligatorio al crear un issue derivado**: en la card padre, "nació por X, bloquea/depende de Y" con la relación creada; y **al bloquearse**: qué espera y qué lo desbloquea (sin promesa de reloj: un agente sin sesión viva no puede cumplir "cada 24 h") | Claude + GPT (issue derivado; bloqueo) |
| D4 | **Cierre** (al abrir la PR de Build): resultado en lenguaje de usuario, número de PR, y "se cierra con esta PR" explícito; Done sin PR de Build no prueba implementación | GPT: validar el cierre |
| D5 | **Slice**: al publicar, un comentario en cada issue con el resumen del desglose validado ("2 issues en vez de 3 porque…", enlace al veredicto). **Ship**: si hay learning, una línea con el enlace | Claude |
| D6 | Tono: el mensaje que dejarías a un colega en Slack al salir; sin tecnicismos; en español | Claude |
| D7 | **`linear.mjs` es la única puerta al tablero**: gana `comment <clave> <texto|->`, `create --team --title --description [--label --priority --blocked-by --assignee me]`, `assign <clave> [me]`, `move <clave> <estado>`, `link <bloqueador> blocks <bloqueado>`. Ningún skill ni prompt hace GraphQL a mano. `publish` asigna al viewer por defecto (hoy se hace a mano cada vez) | deuda medida |
| D8 | `move` nunca lleva a una categoría `completed`/`canceled`: el cierre lo hace la PR de Build (propiedad existente del skill, extendida al comando) | to-tickets-linear |
| D9 | Los prompts de `build-kickoff` dicen los tres momentos y el comando exacto; el agente no redacta GraphQL. `build-kickoff` mueve a In Progress al arrancar y a In Review al abrir la PR (regla ya vigente, ahora por comando) | memoria del 2026-09-12 |
| D10 | La PR de docs que publica borrador y spec no nombra claves (regla ya escrita en `to-tickets-linear`, PR #19) | hoy |
| D11 | `create` es azúcar sobre `publish` (plan de un issue por el mismo camino); `publish` acepta en `blockedBy` una clave existente como issue externo. Una sola ruta compuesta en el script | quiz cruzado Q1 |
| D12 | D7 no se cumple hoy: `build-kickoff/scripts/open.mjs` (`fetchIssue`) hace GraphQL propio; pasa a importar `issue` de `linear.mjs`, que devuelve también `title` y `spec`. Criterio: `api.linear.app` solo aparece en `linear.mjs` y su test | quiz cruzado, hallazgo |
| D13 | El comentario de Slice no lo emite `publish`: es un paso propio, después de `publish.ok:true` **y de mergear la PR de docs** (para que el enlace al veredicto apunte a `main`), reanudable por recibo: el borrador guarda por issue `comment: { id, at }` y el paso solo comenta los que no lo tienen. Slice termina cuando el comentario está puesto. Un duplicado por recibo perdido se acepta (visible, se borra a mano) | quiz cruzado Q2 |

## Contrato de `linear.mjs`

Todos los comandos: resuelven ids en la corrida, salen con JSON en stdout, exit ≠ 0 con causa en
stderr; `--dry-run` renderiza el payload sin escribir; probados contra `test/stub.mjs`.

- `comment <clave> <texto | ->`: `commentCreate` con el texto (de argumento o stdin). Devuelve `{ key, commentId, url }`.
- `create --team <clave|nombre> --title … --description <texto | -> [--label …] [--priority 0-4] [--blocked-by <clave>…] [--assignee me]`: envoltorio de `publish` con un plan de un issue (D11); devuelve `{ key, url }`.
- `assign <clave> [me]`: `assigneeId` = viewer. Devuelve `{ key, assignee }`.
- `move <clave> <nombre de estado>`: resuelve por nombre en el equipo del issue; rechaza categorías `completed`/`canceled` (D8) con exit 3.
- `link <A> blocks <B>`: `issueRelationCreate` tipo `blocks`; idempotente si ya existe.
- `publish`: además de hoy, `assigneeId` = viewer en cada create (D7) y `blockedBy` con clave externa (D11).
- `issue <clave>`: además del estado, `title` y `spec` (D12); `build-kickoff` lo importa.

## Rebanadas

### 1. `linear.mjs`: `comment`, `create`, `assign`, `move`, `link`; `publish` asigna (D7, D8)

- Comandos según el contrato, en `skills/to-tickets-linear/scripts/linear.mjs`; el stub
  (`test/stub.mjs`) gana las operaciones `commentCreate`, `issueUpdate`, `issueRelationCreate`,
  `viewer`; tests en `test/linear.test.mjs` por comando (feliz, `--dry-run` sin escrituras,
  `move` a Done rechazado, `link` repetido idempotente, `publish` asigna).
- `SKILL.md` de `to-tickets-linear`: sección "Comandos del tablero" con los cinco.

Criterios: `npm test` en verde; `node linear.mjs comment JAR-15 "prueba" --dry-run` renderiza
sin escribir; `move JAR-15 Done` sale 3; `api.linear.app` solo en `linear.mjs` y su test (D12).

### 2. Los tres momentos en Build y el comentario de Slice (D1–D6, D9) — bloqueada por 1

- `build-kickoff/scripts/open.mjs`: el prompt lleva la regla única (D1), los tres momentos con
  su comando (`linear.mjs comment`, `move`), la obligación al crear un issue derivado
  (`create --blocked-by` + comentario en el padre) y al bloquearse, y el tono (D6).
- `build-kickoff/SKILL.md`: lo mismo, como contrato; evals: el prompt de la URL contiene los tres
  momentos y el comando; negativo: un prompt nunca pide GraphQL a mano.
- `to-tickets-linear/SKILL.md` paso 6: el comentario de Slice por issue (D5) con `comment`, tras
  mergear la PR de docs, con recibo `comment: { id, at }` en el borrador y reanudación por los que
  falten (D13).
- `README` de jarviis, contrato de artefactos: fila "Comentarios en la card".

Criterios: `npm test`; evals de `build-kickoff` en verde con el caso nuevo; el prompt generado
para una clave contiene `linear.mjs comment` y "solo si Andy tomaría una decisión distinta".

## Fuera de alcance

- Un temporizador que comente cada 24 h en issues bloqueados (nadie lo ejecutaría).
- Comentarios desde Review o desde el wayfinder.
- Mover issues a Done por comando (D8).
