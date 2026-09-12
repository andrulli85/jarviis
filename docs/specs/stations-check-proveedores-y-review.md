---
title: "npm run stations -- --check comprueba que cada proveedor responde y muestra la deuda de Review"
status: sliced
date: 2026-09-12
issue: null
grill: docs/grill/stations-check-gpt/verdict.md
---

# `stations --check`: proveedores que responden y deuda de Review

`npm run stations -- --check` sale hoy con 0 si el binario de cada proveedor existe. Eso vendió
"instalado" como "funciona": dos días de `existe · proveedor: codex` con Codex sin cuota y nueve
PRs mergeadas sin review adversarial, sin que ningún comando lo dijera. Esta spec hace que
`--check` sea verde solo con **evidencia reciente de que cada canal respondió**, sin sondear por
defecto, y que muestre el **rango pendiente de review adversarial** sin convertirlo en exit.

Shape en dos partes el 2026-09-12: `/grilling` en terminal (Q1–Q7 con Andy) y un grill en Buzz
donde **Codex Grill (GPT-5.6, `xhigh`) interrogó a Claude Terminal** sobre el plan resultante
(3 rondas, las tres con decisión nueva: D8–D10). Veredicto y ledger en
[`docs/grill/stations-check-gpt/`](../grill/stations-check-gpt/verdict.md); Andy validó con ✅.

## Decisiones

| D | Decisión | Origen |
|---|---|---|
| D1 | "Responde" = barato por defecto (señales locales), sondeo real solo con `--probe` (`pong` por canal vía `ask()`, timeout 30 s, latencia o error literal) | Q1 |
| D2 | Revisado = solo evidencia de `adversarial-review` con `ok:true` y veredicto cuyo `to` es ancestro de `HEAD`; deuda = `git log <to>..HEAD`; `/code-review` no cuenta y el pie lo dice; sin marca manual | Q2 |
| D3 | `--check` sale 1 si un proveedor no responde; la deuda de Review es informativa | Q3 |
| D4 | Tres canales y las cuatro estaciones con proveedor, mismo mecanismo | Q4 |
| D5 | Fila: `proveedor: codex sin cuota hasta <fecha>` / `codex responde (1.8 s)`; pie por canal `ok · sin cuota hasta · token inválido · sin sondear`; sección "Review pendiente" bajo "Arreglos"; `--json` con `providers[canal]` y `review` | Q5 |
| D6 | `providers/index.mjs` gana `health(env, { probe, evidenceDir, exec })`; `stations.mjs` gana `reviewDebt({ cwd, evidenceDir, git })`; tests con fixtures inyectados; un `why` que no matchea → `down` con el literal, nunca `ok` | Q6 |
| D7 | `--probe` sondea los tres en paralelo, timeout por canal, informe completo, exit 1 si alguno falla | Q7 |
| D8 | Salud con tres estados: `ok` (evidencia positiva reciente), `down`/`quota` (negativa reciente), `unprobed` (nada en la ventana). **`unprobed` también sale 1** en `--check`, con `codex: sin evidencia reciente (7 d); corre npm run stations -- --probe`. `--probe` persiste su resultado por canal en `~/.local/state/jarviis/health.json` (`status`, `at` RFC 3339 con zona, `latency|why`) | Codex Grill Q1 |
| D9 | Evidencia de salud: JSON de `adversarial-review` regulares y parseables con `agent` = canal, de cualquier repo (el `to` no importa para salud). Instante = timestamp del nombre de archivo; si no parsea, `mtime`. El más reciente manda; en empate gana el fallo. Corruptos, sin `agent` o con fecha futura se ignoran y se cuentan en `--json` como `ignored`. "try again at" del `why` se interpreta en zona local | Codex Grill Q2 |
| D10 | Ventana única de **7 días** para toda evidencia positiva, en los tres canales. `claude auth status` fallido, clave OpenRouter ausente o binario ausente degradan a `down` en el acto; cuando salen bien **no** suben a `ok`: dejan `unprobed` | Codex Grill Q3 |
| D11 | *(pendiente 1 del veredicto, propuesta de Claude Terminal)* Entre varias evidencias de review cuyo `to` es ancestro de `HEAD`, manda la de **`to` más reciente en la historia** (`git merge-base --is-ancestor` entre ellas; a igual posición, la de instante más reciente). Una evidencia cuyo `to` dejó de ser ancestro (rebase, squash) **no cuenta**: no se inventa una relación que git no demuestra; si ninguna cuenta, "sin evidencia de review en este repo" | veredicto |
| D12 | *(pendiente 2 del veredicto, propuesta de Claude Terminal)* Todo uso real de un canal pasa por `providers.ask()`; `ask()` escribe la evidencia de salud (`ok` con latencia o `down` con `why`) en `health.json` al terminar. Así OpenRouter y Claude renuevan la ventana con cualquier uso (un `/ping-test`, una review, un juez), no solo con `--probe` | veredicto |
| D13 | *(pendiente 3 del veredicto, para Build)* `health.json` se escribe atómico (archivo temporal + `rename`); ausente o corrupto = sin evidencia persistida (`unprobed`), nunca error; ruta, reloj y `exec` inyectables en tests | veredicto |

D11 y D12 son decisiones de Claude Terminal sobre pendientes que el veredicto dejaba a Andy;
Andy puede vetarlas en Slice.

## Contrato

### `health(env, { probe = false, evidenceDir, stateFile, exec, ask, now })` en `providers/index.mjs`

Devuelve `{ claude, codex, openrouter, ignored }` con, por canal,
`{ bin, status: "ok"|"quota"|"down"|"unprobed", until?, latency?, why?, at? }`.

1. Detectores inmediatos (D10): sin binario → `down`; `claude auth status` con exit ≠ 0 → `down`
   (`why` = salida recortada); OpenRouter sin clave → `down`. Cuando pasan, no deciden nada.
2. Evidencia (D8, D9): registros de `evidenceDir` (`~/.claude/adversarial-reviews/`) con
   `agent` = canal, más el registro del canal en `stateFile` (`~/.local/state/jarviis/health.json`).
   Se toma el de instante más reciente dentro de la ventana de 7 días desde `now`; `ok:true` o
   `status:"ok"` → `ok`; fallo con "try again at <fecha>" futura → `quota` con `until`; otro fallo
   → `down` con `why`; nada en la ventana → `unprobed`.
3. `probe: true` (D1, D7): `ask()` con "pong" a los tres canales en paralelo, timeout 30 s por
   canal; resultado escrito en `stateFile` (D12, D13) y devuelto como `ok`+`latency` o `down`+`why`.

### `reviewDebt({ cwd, evidenceDir, git })` en `stations.mjs`

`{ lastReviewed: { sha, at } | null, pending: [sha…], command: string | null, note }`. Evidencia
elegible: `ok:true` con `verdict` y `to` ancestro de `HEAD` en `cwd`; selección por D11; `pending`
= `git log <to>..HEAD --format=%h`; `command` = `/adversarial-review <to7>..HEAD` si hay pendientes;
`note` = "/code-review no deja evidencia y no cuenta".

### `failures()` y exit

Suma, por estación con proveedor, un fallo si su canal está en `quota`, `down` o `unprobed` (D3,
D8). La deuda de Review nunca entra (D3).

### Salida (D5)

- Fila: `existe · proveedor: codex ok (2026-09-12, 1.8 s)` / `codex sin cuota hasta 2026-09-16 10:24`
  / `codex sin sondear` / `codex down: <why>`.
- Pie: `Proveedores: claude ok (hace 2 d) · codex sin cuota hasta 2026-09-16 10:24 · openrouter sin
  sondear · autor claude` (+ ` · ignorados: n` si `ignored > 0`).
- "Review pendiente": `N commits sin review adversarial desde <sha7> (<fecha>): /adversarial-review
  <sha7>..HEAD` | `al día (último review <sha7>, <fecha>)` | `sin evidencia de review en este repo`,
  y la nota sobre `/code-review`.
- `--json`: `providers` (objeto de `health`) y `review` (objeto de `reviewDebt`).
- Sin "Siguiente paso" (invariante de `renderStations`).

## Rebanadas

Cuatro fases del veredicto en tres rebanadas: la salud (fases 1+2) se demuestra sola con
`--probe`; la deuda (fase 3) se demuestra sola con un repo temporal; las pruebas (fase 4) van
dentro de cada una, no aparte.

### 1. `health()` en `providers/` y su integración en `stations` (D1, D4, D6–D10, D12, D13)

- `providers/index.mjs`: `health()` según el contrato; `ask()` escribe la evidencia de salud al
  terminar (D12); escritura atómica de `stateFile` (D13).
- `stations.mjs`: `collectStations` llama a `health()`; `renderStations` pinta fila y pie nuevos;
  `failures()` cuenta `quota`/`down`/`unprobed`; flag `--probe`.
- Tests (`providers/test`, `skills/wayfinder/test`): fixtures de evidencia en directorio temporal
  (ok reciente, cuota futura, cuota pasada, fallo sin fecha, corrupto, sin `agent`, fecha futura,
  otro repo, empate éxito/fallo, nombre sin timestamp → `mtime`); `stateFile` ausente/corrupto/
  válido; `exec` falso para `auth status`; `ask` inyectado (responde, falla, timeout); `now`
  inyectado para la ventana; los tres canales; `failures()` por estado; render de fila y pie.

Criterios: `npm test` en verde; en esta máquina `npm run stations -- --check; echo $?` → `1` con
"sin evidencia reciente" hasta un `--probe`; `npm run stations -- --probe` imprime los tres
resultados y deja `health.json`; el `--check` siguiente sale 0 (o 1 con `codex sin cuota…` si
Codex está agotado); `--json` trae `providers.codex.status`.

### 2. `reviewDebt()` y la sección "Review pendiente" (D2, D5, D11) — bloqueada por 1

- `stations.mjs`: `reviewDebt()`; sección en el render; `review` en `--json`; `failures()` no cambia.
- Tests: repo git temporal con cuatro commits y evidencia con `to` en el segundo → `pending` = 2,
  `command` correcto; dos evidencias ancestro → gana la más reciente en la historia; evidencia con
  `to` no ancestro (rebase simulado) → no cuenta; sin evidencia → "sin evidencia"; `ok:false` no
  cuenta.

Criterios: `npm test` en verde; en `jarviis` hoy, "Review pendiente" muestra `N commits sin review
adversarial desde c7733fe` (o la última evidencia `ok:true` real) con el comando.

### 3. README y `docs/plans/fabrica.md` — bloqueada por 2

- README, sección de `npm run stations`: los estados de salud, que `--check` necesita evidencia
  reciente (primera vez roja: correr `--probe`), que `--probe` gasta una llamada por canal, y que
  "Review pendiente" es informativa y no cuenta `/code-review`.
- `docs/plans/fabrica.md`: fila con la fase y el commit al cerrar.

Criterios: README menciona `--probe`, `unprobed`/`sin sondear` y "Review pendiente"; `npm test`.

## Fuera de alcance

- Marca manual de "revisado" para `/code-review` (Q2 B).
- Que la deuda de Review cambie el exit (D3).
- Cruzar salud con Linear o GitHub.
