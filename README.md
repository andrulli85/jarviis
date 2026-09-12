# jarviis — fábrica personal de software

Herramienta personal para construir software rápido con IA: skills, agentes y
tres piezas externas que ya están en el día a día.

| Pieza | Rol en la fábrica |
|---|---|
| Conductor | Ejecución: un workspace (worktree) por issue, agentes en paralelo |
| Buzz | Conversación: grill de ideas y decisiones con el equipo |
| Linear (free) | Estado: backlog, issue activo, enlace a PR |
| Claude Code skills | Estaciones de la línea |
| Codex CLI | Segundo agente ejecutor/revisor (familia GPT) |
| OpenRouter | Acceso HTTP a cualquier modelo sin CLI (terceras opiniones, tareas baratas) |

## Línea de producción

Cinco estaciones (Shape, Slice, Build, Review, Ship / Learn) en las que cada
una recibe un artefacto y produce el siguiente; el wayfinder es la puerta de
entrada y el mapa de las demás. El mapa completo (transiciones, ramas,
entradas y recorridos ya hechos) está en [`docs/flows.md`](docs/flows.md);
el estado de cada estación en esta máquina lo imprime `npm run stations`.

Regla: el wayfinder **enruta, no ejecuta**. Si una estación está `manual`,
el wayfinder dice exactamente qué hacer a mano. Cuando la estación gana skill,
solo cambia `skills/wayfinder/stations.json`: de ahí se genera el mapa
(`npm run flows`) y de ahí lee el wayfinder; el estado real (`existe` /
`manual` / `sin enlazar` / `otra copia` / `por construir`) lo calcula mirando
el disco en cada corrida, no lo guarda ningún documento.

## Skills de la fábrica

Viven en `skills/<nombre>/` y se enlazan a `~/.claude/skills/<nombre>` como
el resto del toolkit:

```
ln -s ~/personal/claude-toolkit/jarviis/skills/wayfinder ~/.claude/skills/wayfinder
```

Un enlace nuevo no aparece hasta reiniciar la sesión de Claude Code. Cada
skill lleva `evals/evals.json` y se regresa con
`~/.claude/skills/skill-evals/runner/run-evals.py` en un sandbox sin remoto.

`npm run stations` imprime la tabla de las cinco estaciones con su estado
real en esta máquina, sin entrada: qué skills responden y qué proveedores
responden. `npm run stations -- --json` da lo mismo como JSON (`providers`
trae la salud por canal e `ignored`) y `npm run stations -- --check` sale
con 1 si hay algo que arreglar, para usarlo desde un script (bajo npm ≤ 10
ese exit 1 añade además el bloque `npm error` de npm; es lo esperado, no un
fallo del comando). Cada estación está en uno de cinco estados: `existe`
(responde y es la de la fábrica), `manual` (la estación existe pero pide un
paso a mano; no es fallo), `sin enlazar` (está en `skills/` pero no en
`~/.claude/skills`), `otra copia` (el enlace apunta a otra copia, no a esta
fábrica) y `por construir` (no está en ningún sitio). Las dos que se
arreglan con un `ln` salen listadas bajo "Arreglos" con el comando exacto;
tras enlazar, reinicia la sesión.

Los proveedores (`claude`, `codex`, `openrouter`) no están verdes por estar
instalados sino por haber **respondido en los últimos 7 días**. Cada canal
está en uno de cuatro estados: `ok` (con la fecha de la última respuesta y
su latencia), `sin cuota hasta <fecha>` (el proveedor dijo cuándo volver a
intentar), `down: <porqué>` (sin binario, `claude auth status` en rojo, sin
clave de OpenRouter, o el último intento falló sin fecha) y `sin sondear`
(nada en la ventana). La evidencia sale de dos sitios: los JSON que deja
`adversarial-review` en `~/.claude/adversarial-reviews/` (de cualquier
repo; los que no parsean, no traen `agent` o tienen fecha futura se
cuentan como `ignorados`) y `~/.local/state/jarviis/health.json`, donde
cada uso real por `providers.ask()` deja su resultado al terminar. El más
reciente manda; en empate gana el fallo. `--check` cuenta como fallo
`sin cuota`, `down` y `sin sondear`: **la primera vez sale rojo** hasta
sondear. `npm run stations -- --probe` manda un `pong` a los tres canales
en paralelo (30 s de techo por canal, una llamada por canal), escribe
`health.json` y sale 1 si alguno no respondió; sin `--probe` el comando no
gasta ni escribe nada.

Bajo "Arreglos" va "Review pendiente": qué commits de **este repo** no han
pasado por `adversarial-review` y el comando que los salda
(`N commits sin review adversarial desde <sha7> (<fecha>): /adversarial-review
<sha7>..HEAD`, `al día (último review …)` o `sin evidencia de review en este
repo`). Cuenta como revisado cada `to` de una evidencia `ok:true` con
veredicto que siga siendo ancestro de `HEAD` (un `to` que dejó de serlo por
rebase o squash no cuenta); la deuda es el conjunto de commits que ningún
`to` revisado alcanza, así que dos ramas revisadas por separado y fusionadas
deben solo el merge y lo posterior, y el comando parte del merge-base (nunca
deja fuera un pendiente; la nota dice cuántos ya revisados arrastra). Es
**informativa**: no cambia el exit de `--check`. `/code-review` no deja
evidencia y no cuenta; `--json` lo trae como `review`.

## Proveedores

Cada estación declara **qué necesita** (un agente con herramientas sobre el
árbol, o solo una respuesta a un prompt) y un único resolvedor decide **quién**
lo atiende. Ninguna estación llama a un binario o a una URL por su cuenta.

| Canal | Cómo se invoca | Cuándo |
|---|---|---|
| `claude` | Claude Code CLI (binario de Conductor) | Estación por defecto en la familia Anthropic |
| `codex` | Codex CLI (binario de Conductor, `codex exec`) | Cuando hace falta la otra familia: revisión cruzada, segunda implementación |
| `openrouter` | HTTP `chat/completions` con `OPENROUTER_API_KEY` | Sin herramientas: clasificar, resumir, juez, modelos que no tienen CLI |

Reglas que ya están medidas en `~/.claude/skills/adversarial-review` y se
heredan tal cual:

- **Binarios**: nunca el `codex` del PATH (el wrapper npm deja un shim que muere
  con ENOENT). Se resuelve desde
  `~/Library/Application Support/com.conductor.app/agent-binaries/<agente>/<versión>/`,
  versión más nueva primero. Overrides `CE_CODEX_BIN` / `CE_CLAUDE_BIN`;
  vacío significa "sin binario", no "búscalo tú".
- **Familia**: el resolvedor sabe quién escribió el cambio (`detectAuthor` en
  `family.mjs`) y quien revisa es siempre de la otra familia.
- **Ids de modelo**: forma canónica `vendor/modelo` (`openai/gpt-5.6-terra`,
  `anthropic/claude-opus-5`). Cada canal traduce a su propio vocabulario
  (Codex quiere `gpt-5.6-terra`, sin prefijo).
- **OpenRouter**: el contrato JSON, el vocabulario de fallos y el stub de
  pruebas (`CE_OPENROUTER_URL`) viven en el `adversarial-review.mjs` retirado;
  se reutilizan, no se reescriben. Una respuesta que no llegó no es una
  respuesta.
- **Evals**: ningún test toca un proveedor real. Los binarios se apuntan a una
  ruta inexistente y OpenRouter a un stub local.

Nota: `adversarial-review` retiró su ruta OpenRouter el 2026-09-10 con la
anotación "Andres no usa OpenRouter". Esta fábrica la reactiva en
`providers/`; queda actualizar esa nota en la skill para que nadie la lea
como vigente.

Estado del 2026-09-11: los tres canales resuelven en esta máquina.
`openrouter` devuelve `401 User not found` (clave del `.zshenv` a renovar) y
`codex` está sin cuota hasta el 2026-09-16. Ver `providers/README.md`.

## Contrato de artefactos

Lo que las estaciones se pasan entre sí. Fijado el 2026-09-11; cada skill lo
asume sin preguntar.

| Artefacto | Regla |
|---|---|
| Spec | `docs/specs/<slug>.md` en el repo del producto (no en el vault). La PR y la spec van en el mismo diff. |
| Issue | Clave de Linear (`JAR-12`) es la clave única de todo el hilo. Título en imperativo. Descripción enlaza la spec. |
| Workspace Conductor | Uno por issue. Rama `<slug de la spec>/<clave>-<título en kebab>` (`flujos-end-to-end/jar-12-el-wayfinder-entra-por-la-estacion`): Conductor lista los workspaces por rama, así las cards de una spec quedan juntas; la clave dentro hace que Linear cierre el issue al merge. La pone `build-kickoff` en el prompt de arranque (decidido 2026-09-12). |
| PR | Primera línea del cuerpo referencia la clave. Linear cierra el issue al merge. |
| Learning | Frontmatter con `date:` y `issue: JAR-12`. |

## Documentos

| Carpeta | Qué guarda |
|---|---|
| `docs/plans/` | Plan de construcción de la fábrica y su estado por fase: [`fabrica.md`](docs/plans/fabrica.md) |
| `docs/specs/` | Una spec por trabajo (`<slug>.md`), salida de Shape y entrada de Slice |
| `docs/tickets/` | Borrador de issues por spec (`<slug>.json`), lo escribe `to-tickets-linear` y guarda las claves tras publicar |
| `AGENTS.md` | Instrucciones para agentes de código que trabajan en el repo (estructura, comandos, convenciones), en el formato estándar |
| `agents/` | Un archivo por agente de Buzz (frontmatter `name`/`pubkey`/`rol`/`cuando` + su prompt en el cuerpo) y `README.md` con las reglas comunes. `npm run agents:sync` genera de ahí `~/.buzz/AGENTS.md` (y el puente `~/.buzz/CLAUDE.md`) que los agentes cargan al arrancar; `--check` sale 1 si el nido está desactualizado |
