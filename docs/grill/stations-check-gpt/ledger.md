# Grill: stations-check-gpt

**Modo:** plan · **Canal:** stations-check-gpt (`b3cd436b-3ec9-4709-b13d-b2dc6c3ce88e`) · **Inicio:** 2026-09-12
**Brief:** `PLANS/stations-check-gpt/brief.md`
**Hilo raíz:** `71d758801960aab708f2c42080588206b58127be0becf328cbc9e112c0a88718`

## Hechos verificados antes de preguntar

- El checkout local `REPOS/andrulli85--jarviis` está en `7d15c790ed5b1c4eb9d07d9cce3fb95e05a1db39`; todavía no contiene `skills/wayfinder/scripts/stations.mjs`.
- `providers/index.mjs` expone `status(env)` exclusivamente como presencia de binarios/clave y `ask(resolved, opts)` como la única puerta para hacer una llamada de proveedor; por tanto `health()` necesita definir qué significa ausencia de evidencia sin sondeo.
- Los JSON recientes de `~/.claude/adversarial-reviews/` tienen `agent: "codex"` pero no un campo temporal; su `mtime` sí es legible. Hay un éxito de Codex a las 15:02 -03:00 del 2026-09-11 y fallos por cuota más recientes a las 18:52 y 19:00 -03:00, por lo que "hay algún éxito reciente" no debe prevalecer sobre un fallo posterior.
- Los nombres de los JSON recientes empiezan por timestamps como `2026-09-11T21-52-31-176-…`, coherentes con la creación de los artefactos y disponibles aunque cambie su `mtime`; D9 los designa como fuente temporal primaria.
- El brief fija D1–D7 como restricciones de este grill; no son decisiones nuevas que se vayan a reabrir.

## Árbol de diseño (estado)

- [x] Mecanismo principal: `health()` y `reviewDebt()` — FIJADO por D1, D2, D6
  - [x] Semántica de evidencia local desconocida para Codex — DECIDIDA (Q1, D8)
    - [x] Criterio de `--check` sin `--probe`: `unprobed` falla — DECIDIDO (Q1, D8)
    - [x] Persistencia de un sondeo para evitar sondear a diario — DECIDIDA (Q1, D8)
  - [x] Orden, fecha y elegibilidad de evidencias mixtas — DECIDIDA (Q2, D9)
  - [x] Política de frescura y señales locales por canal — DECIDIDA (Q3, D10)
- [x] Interpretación temporal y selección de evidencia de cuota — DECIDIDA (Q2, D9)
- [ ] Relación de evidencia de review con historia Git (rebase/squash/rama) — PENDIENTE CON DUEÑO: Claude Terminal / Andy; el tope de rondas impidió precisar cómo elegir entre varios `to` ancestros de `HEAD`.
- [ ] Renovación por uso real fuera de `--probe` — PENDIENTE CON DUEÑO: Claude Terminal / Build; D8 permite que uso real renueve salud, pero falta definir qué llamadas además de `adversarial-review` persisten una evidencia verificable, sobre todo para OpenRouter.

## Decisiones (confirmadas por un humano)

- D8. `health()` usa una ventana de evidencia reciente para dar `ok`, `down`/`quota` o `unprobed`: éxitos de `adversarial-review` del canal y resultados persistidos de `--probe` cuentan como positivos; fallos recientes cuentan como negativos; sin evidencia aplicable es `unprobed`. `--check` falla tanto en negativo como en `unprobed`; `--probe` guarda por canal `{ status, at, latency|why }` en `~/.local/state/jarviis/health.json` y lo renueva. (Q1, 2026-09-12, Claude Terminal `68d8a24b`)
- D9. Para salud de un canal se consideran JSON regulares y parseables de `adversarial-review` de cualquier repo con `agent` exactamente igual al canal. Su instante se toma primero del prefijo timestamp del nombre y, si no parsea, de `mtime`; los `--probe` usan `at` RFC 3339 con zona. El más reciente gana y, en empate, gana el fallo. JSON corruptos, sin agente, o fechados en el futuro se ignoran y se exponen como `ignored: n` en JSON. Una fecha `try again at` sin zona se interpreta en la zona local; si no se puede parsear, queda `down` con el motivo literal. (Q2, 2026-09-12, Claude Terminal `68d8a24b`)
- D10. La ventana de 7 días es única para evidencia positiva de respuesta en Claude, Codex y OpenRouter. Las señales locales baratas —`claude auth status` no exitoso, clave OpenRouter ausente y binario ausente— solo detectan fallo inmediato y dejan `down`; cuando son buenas no dan `ok`, sino `unprobed` hasta un `--probe` o uso real reciente. (Q3, 2026-09-12, Claude Terminal `68d8a24b`)

## Supuestos (míos, hasta que alguien los confirme o corrija)

- S1. **Confirmado por D8:** la ausencia de evidencia reciente de Codex no permite afirmar que responde; se representa como `unprobed` y `--check` falla. (Q1, 2026-09-12)
- S2. **Confirmado por D10:** los 7 días son una política común de frescura de respuesta, no un TTL particular de la cuota de Codex; evita equiparar una autenticación vigente con una respuesta real. (Q3, 2026-09-12, Claude Terminal `68d8a24b`)

## Registro de preguntas

### Q1 — `--check` ante Codex sin evidencia concluyente
**Pregunta:** D1 solo clasifica como sin cuota a Codex cuando hay un JSON fallido con fecha futura; no define qué devuelve `health()` cuando no existe tal JSON (o solo hay evidencia vieja/ajena). D5 reserva `sin sondear`, mientras D3 exige que `--check` falle si un proveedor no responde. ¿Cuál es la semántica y el exit de ese estado sin `--probe`?

**Recomendación:** Devolver `status: "unprobed"` / mostrar `sin sondear`, y que `--check` salga 1: no hay evidencia suficiente de respuesta. Solo `--probe` puede convertirlo en `ok` o `down`. Es la única variante que cumple literalmente “comprueba que responde” y evita otro verde especulativo; el coste es que la comprobación barata no dará verde para Codex sin una sonda.

**Respuesta:** "D8: `health()` distingue `ok`, `down`/`quota` y `unprobed` según la evidencia más reciente dentro de una ventana de 7 días; `--check` falla en negativo y en `unprobed`. `--probe` persiste su resultado en `~/.local/state/jarviis/health.json`, que también cuenta durante la ventana." — Claude Terminal `68d8a24b`, 2026-09-12

### Q2 — Evidencia que manda y su reloj
**Pregunta:** Los JSON de `adversarial-review` no traen timestamp, y en la máquina hay éxitos de Codex anteriores a fallos de cuota el mismo día. Para que D8 sea determinista: ¿qué registros son elegibles, con qué reloj se ordenan y cuál gana cuando discrepan?

**Recomendación:** Para salud del proveedor (no deuda de este repo), aceptar cualquier JSON regular y parseable cuyo `agent` coincida exactamente con el canal; fecharlo por `mtime` de archivo (epoch) y el estado de `--probe` por su `at` RFC 3339 con zona. Ignorar JSON corruptos, sin `agent`/fecha válida y relojes futuros; ordenar todos por ese instante y dejar que el más reciente mande (en empate, fallo sobre éxito). Así el fallo de cuota posterior sí invalida el éxito anterior; el `to` de otro repo no importa aquí porque se mide salud de la máquina, no revisión.

**Respuesta:** "D9: todos los JSON parseables del canal de cualquier repo cuentan; se fecha primero por el timestamp del nombre, luego por `mtime`; los `--probe` usan `at` RFC 3339. El más reciente manda, el fallo gana empates, y los registros inválidos/futuros se exponen como `ignored: n`." — Claude Terminal `68d8a24b`, 2026-09-12

### Q3 — Una frescura común, señales locales distintas
**Pregunta:** D9 conserva una ventana de 7 días. D1 también manda leer `claude auth status` y presencia de clave OpenRouter en cada check, pero esas señales no prueban que un prompt haya respondido. ¿La ventana de éxito debe ser común para los tres canales, dejando esas señales solo para detectar un fallo inmediato, o hacemos TTL distintos (7 d Codex / 1 d Claude / otro OpenRouter)?

**Recomendación:** Una sola ventana de 7 días para toda evidencia positiva de respuesta. En cada ejecución, `claude auth status` no exitoso y una clave OpenRouter ausente degradan inmediatamente a `down`; que sean exitosos solo mantienen `unprobed` hasta un `--probe` o uso real reciente. No usaría TTL de 1 día para Claude: sería una certeza falsa (auth no es una respuesta), rompe un contrato JSON uniforme y vuelve a empujar sondeos. La diferencia entre canales queda en el detector barato de fallo, no en qué cuenta como evidencia positiva.

**Respuesta:** "D10: una sola ventana de 7 días para los tres canales. Las señales baratas solo degradan a `down` al fallar; si están bien, se conserva `unprobed` hasta un sondeo o uso real reciente." — Claude Terminal `68d8a24b`, 2026-09-12

## Cierre

Tope de tres rondas alcanzado: Q1–Q3 produjeron D8–D10, por lo que ninguna fue marginal. No se abren más preguntas. Las dos ramas no tratadas quedaron como pendientes con dueño arriba; el veredicto está en `PLANS/stations-check-gpt/verdict.md`.

Validado por Andy `df3bc9cf` con `✅` el 2026-09-12 (evento `896ec6f1c3b337f84fb21b64495d49641bbf5f8ae432fb23c113d6fc048e219d`).
