# providers — la única puerta a un modelo

Fase 2 de la fábrica. Una estación declara qué necesita y `resolve` decide
quién lo atiende; `ask` lo ejecuta y devuelve siempre `{ ok, text, why? }`.
Ninguna estación llama a un binario o a una URL por su cuenta.

```js
import { resolve, ask } from "./providers/index.mjs";

// Un agente con herramientas sobre el árbol, de la familia opuesta a quien escribió.
const r = resolve({ need: "agent", opposite: "claude" });      // → codex / openai/gpt-5.6-terra
const a = await ask(r, { prompt, cwd: worktree, mode: "readonly", effort: "high" });

// Una respuesta a un prompt, sin herramientas, por OpenRouter.
const j = await ask(resolve({ need: "text", model: "haiku" }), { prompt, json: true });
if (!j.ok) console.error(j.why);   // nunca lanza por un fallo del proveedor
```

Desde la terminal:

```
node providers/bin/ask.mjs --status
node providers/bin/ask.mjs --need text --model terra "clasifica esto"
node providers/bin/ask.mjs --need agent --opposite claude --cwd . "revisa el árbol"
```

## Salud

`health(env, { probe, evidenceDir, stateFile, exec, ask, now })` dice si cada
canal **responde**, no si está instalado: `{ claude, codex, openrouter,
ignored }` con `{ bin, status: ok|quota|down|unprobed, at?, latency?,
until?, why? }` por canal. Sin binario, `claude auth status` en rojo o sin
clave de OpenRouter es `down` en el acto; si pasan, decide la evidencia de
los últimos 7 días: los JSON de `adversarial-review` (leídos por
`evidence.mjs`, una sola copia de la regla) y `~/.local/state/jarviis/health.json`.
Con `probe: true` manda un `pong` a los tres en paralelo (30 s por canal) y
persiste el resultado. `ask()` escribe la salud del canal en `health.json`
al terminar cualquier uso real (`stateFile: null` para no hacerlo; los
tests le pasan `env` con un HOME temporal). Es lo que consume
`npm run stations`.

## Resolución

| `need` | canal por defecto | `channel` admitidos | modelo por defecto |
|---|---|---|---|
| `agent` (herramientas sobre un árbol) | familia → `claude` o `codex`; sin familia, `claude` | `claude`, `codex` | `anthropic/claude-opus-5` / `openai/gpt-5.6-terra` |
| `text` (solo un prompt) | `openrouter` | los tres (`claude`/`codex` en modo sin herramientas) | `anthropic/claude-opus-5` (`JARVIIS_OPENROUTER_MODEL`) |

Familia: `family` explícita > `opposite` de una dada > la del `model` > `claude`.
Un modelo de Anthropic con familia `gpt` es un error, no una traducción.
`agent` por `openrouter` es un error, no un fallback.

Ids de modelo: forma canónica `vendor/modelo`; alias `opus sonnet haiku fable
terra sol luna`. Cada canal traduce a su vocabulario (`lib/models.mjs`).

## Modos (`need: "agent"`)

| `mode` | claude | codex |
|---|---|---|
| `readonly` (default) | `--allowedTools Read Grep Glob --disallowedTools Write Edit NotebookEdit Bash` | `--sandbox read-only` |
| `edit` | `--permission-mode acceptEdits` | `--sandbox workspace-write` |
| `full` | `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` |

`need: "text"` en un CLI nunca escribe, pida lo que pida el `mode`.

## Variables de entorno

| Variable | Efecto |
|---|---|
| `CE_CLAUDE_BIN`, `CE_CODEX_BIN` | Binario concreto. **Vacía = sin binario**, no "búscalo". |
| `CE_AGENT_BINARIES_DIR` | Raíz alternativa a la de Conductor. |
| `OPENROUTER_API_KEY`, `OPENROUTER_KEY_FILE` | Clave; env primero, luego `~/.config/openrouter/key`. |
| `CE_OPENROUTER_URL` | Endpoint alternativo (los tests lo apuntan a un stub local). |
| `CE_REVIEW_IDLE_MS` | Silencio máximo en el stream (default 15 min). |
| `JARVIIS_AGENT_TIMEOUT_MS` | Techo de un CLI (default 20 min). |
| `CE_REVIEW_AUTHOR` | Quién escribió el cambio, si el entorno no lo dice. |

Los nombres `CE_*` son los de `adversarial-review`, a propósito: la misma
variable neutraliza las dos herramientas en una eval.

## Lo que se hereda medido

De `~/.claude/skills/adversarial-review` (2026-08-18 a 2026-09-10):

- `codex` del PATH muere con ENOENT; se usan los binarios de Conductor,
  versión más nueva primero.
- `codex exec` arranca con esfuerzo `none`; se fija siempre.
- Streaming con vigilante de **silencio** (no de duración): 344 s mudos en
  una corrida sana.
- Decodificador UTF-8 con estado: una ñ partida en dos chunks.
- `max_tokens` 64000 con suelo 8000: el presupuesto se comparte con el
  razonamiento y un techo bajo devuelve cero caracteres a precio completo.
- El proveedor real detrás de OpenRouter se registra (`provider`).
- Una respuesta que no llegó no es una respuesta: `ok:false`, nunca texto
  vacío con `ok:true`.

## Tests

`npm test`: ningún proveedor real. Binarios falsos en shell, OpenRouter
contra un servidor HTTP local, clave de mentira, evidencia y `health.json`
en directorios temporales, `exec`, `ask` y reloj inyectados.

Smoke real (`ask.mjs --status` y un "pong" por canal) hecho el 2026-09-11:
`claude` respondió; `codex` correcto pero la cuenta está sin cuota hasta el
2026-09-16; `openrouter` correcto pero la clave del `.zshenv` devuelve
`401 User not found` y hay que renovarla.
