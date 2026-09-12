# Brief: `npm run stations -- --check` comprueba que cada proveedor responde y muestra la deuda de Review

## Qué es esto

Un grill **entre agentes**: tú (Terra, GPT-5.6) interrogas; quien responde es **Claude Terminal**
(una sesión de Claude Code en la terminal de Andy), que defiende un plan ya decidido con Andy.
Andy lee el hilo y valida al final con ✅. Tu trabajo es encontrar los huecos del plan, no
rehacerlo: las decisiones D1–D7 de abajo están tomadas; ataca sus consecuencias, sus supuestos
y lo que no cubren.

**Tope: 3 rondas.** Una ronda = una pregunta tuya (o varias si son independientes) y una
respuesta. Si una ronda no produce ninguna decisión nueva (solo reafirma o reformula), cierra
en esa ronda. Al cerrar, escribe `PLANS/stations-check-gpt/verdict.md` en modo `plan` y publica
el resumen como dice el skill.

## Historia

`npm run stations` (repo `jarviis`, `skills/wayfinder/scripts/stations.mjs`) imprime la tabla de
las cinco estaciones de la fábrica con su estado en la máquina y, con `--check`, sale 1 si falta
algo. Hoy "proveedor: codex" significa "el binario existe": llevó dos días diciendo verde con
Codex sin cuota y nueve PRs mergeadas sin review adversarial, sin que ningún comando lo dijera.
Queremos que `--check` compruebe que cada proveedor **responde**, y que muestre el rango de
commits **pendiente de review adversarial**.

## Contexto del repo

- `providers/index.mjs`: `status(env)` devuelve la ruta del binario por canal (`claude`, `codex`)
  y "clave presente" para `openrouter`; `ask()` manda un prompt a un canal resuelto. Regla del
  módulo: ninguna estación llama a un binario por su cuenta.
- `stations.mjs`: `collectStations`, `renderStations` (tabla + pie de proveedores + "Arreglos"),
  `failures()` (única fuente del exit), flags `--json`, `--check`, `--cwd`. Un test exige que la
  salida no contenga "Siguiente paso".
- `adversarial-review` (skill del toolkit) deja por corrida un JSON en
  `~/.claude/adversarial-reviews/` con `from`, `to`, `ok`, `why`, `verdict`, `agent`. Los dos
  intentos del 2026-09-11 tienen `ok:false` y `why` = "usage limit … try again at Sep 16th,
  2026 10:24 AM". Hay evidencia de varios repos mezclada; `to` es o no un commit del repo actual.
- `/code-review` (otro skill) no deja evidencia en disco.
- Los tests del repo nunca tocan un proveedor real ni la red (`fakeWorld`, stubs, inyección).

## Decidido (con Andy, 2026-09-12)

- D1. "Responde" = **barato por defecto, sondeo a petición**. Sin flag: señales locales (Claude:
  `claude auth status`; Codex: último JSON de evidencia con `ok:false` y un "try again at <fecha>"
  futura = sin cuota hasta esa fecha; OpenRouter: clave presente). Con `--probe`: "pong" real a
  cada canal vía `ask()`, timeout 30 s, latencia o error literal.
- D2. **Revisado** = solo evidencia de `adversarial-review` con `ok:true` y veredicto, cuyo `to`
  sea ancestro de `HEAD`. Deuda = `git log <to más reciente>..HEAD`. `/code-review` no cuenta y
  el pie lo dice. Sin marca manual.
- D3. **Exit**: `--check` sale 1 si un proveedor no responde (cuota, token, sondeo fallido), como
  hoy cuando falta el binario. La deuda de Review es informativa, no cambia el exit.
- D4. **Alcance**: los tres canales y las cuatro estaciones con proveedor, mismo mecanismo.
- D5. **Formato**: en la fila de la estación, `proveedor: codex sin cuota hasta 2026-09-16 10:24`
  / `codex responde (1.8 s)`; pie por canal `ok | sin cuota hasta <fecha> | token inválido |
  sin sondear`; sección nueva "Review pendiente" bajo "Arreglos" con `N commits sin review
  adversarial desde <sha7>: /adversarial-review <sha7>..HEAD` o "al día" o "sin evidencia".
  `--json`: `providers[canal] = { bin, status, until?, latency?, why? }`,
  `review: { lastReviewed, pending, command }`.
- D6. **Dónde vive y cómo se prueba**: `providers/index.mjs` gana `health(env, { probe,
  evidenceDir, exec })`; `stations.mjs` gana `reviewDebt({ cwd, evidenceDir, git })`. Tests con
  fixtures de evidencia en directorio temporal, `exec` falso, repo git temporal, `ask` inyectado.
  Si el `why` no matchea el regex de fecha → `status: "down"` con el `why` literal, nunca `ok`.
- D7. **`--probe` a medias**: los tres canales en paralelo, timeout por canal, informe completo;
  exit 1 si alguno no responde.

## Qué atacar

Lo que estas decisiones no cubren o suponen sin decirlo. Ejemplos de dónde mirar (no una lista
cerrada): la evidencia vive fuera del repo y en una máquina; la fecha de "try again" tiene zona
horaria; qué pasa con un `to` que fue rebased o squashed; el `--probe` gasta cuota justo cuando
la cuota es la duda; `claude auth status` en una máquina sin sesión; la deuda cuando `main` no
es la rama actual; el formato de fecha en la salida; qué es "responde" para OpenRouter sin
gastar; si `health` pertenece a `providers/` cuando lee archivos de otro skill.

## Qué debe salir

Un veredicto en modo `plan`: decisiones nuevas (o supuestos confirmados) numeradas, con quién
respondió, y los pendientes con dueño. Nada de código.
