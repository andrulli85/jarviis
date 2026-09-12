---
title: "Veredicto: stations --check"
tags: [stations, provider-health, adversarial-review]
status: active
created: 2026-09-12
---

# Veredicto: `npm run stations -- --check`

**Modo:** plan · **Canal:** stations-check-gpt (`b3cd436b-3ec9-4709-b13d-b2dc6c3ce88e`) · **Cierre:** 2026-09-12
**Brief:** `PLANS/stations-check-gpt/brief.md` · **Ledger:** `PLANS/stations-check-gpt/ledger.md`
**Rondas:** 3 de 3, todas con decisión nueva. Este veredicto es de plan; no autoriza código.
**Validación:** Andy `df3bc9cf` con `✅` el 2026-09-12 (evento `896ec6f1c3b337f84fb21b64495d49641bbf5f8ae432fb23c113d6fc048e219d`).

## Objetivo

Hacer que `npm run stations -- --check` sea verde solo cuando existe evidencia reciente de que cada canal respondió, sin sondear por defecto, y mostrar la deuda de review adversarial sin convertirla en condición de exit.

## Decisiones confirmadas

| D | Decisión | Quién la confirmó |
|---|---|---|
| D1 | Sin `--probe`, salud barata: señales locales; con `--probe`, un `pong` real por canal a través de `ask()`, timeout de 30 s. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D2 | Review solo cuenta con evidencia `adversarial-review` exitosa, con veredicto y `to` ancestro de `HEAD`; la deuda es informativa. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D3 | `--check` falla si un proveedor no responde; Review pendiente no cambia el exit. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D4 | Se cubren los tres canales y las cuatro estaciones que tienen proveedor. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D5 | Fila y pie legibles, sección "Review pendiente" y contrato `--json` con salud y review. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D6 | `providers.health()` y `reviewDebt()` son las costuras; pruebas inyectadas con fixtures, `exec` y Git temporales. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D7 | `--probe` sondea los tres canales en paralelo, informa todos los resultados y falla si cualquiera falla. | Andy `df3bc9cf` (brief, 2026-09-12) |
| D8 | Salud tiene `ok`, `down`/`quota` y `unprobed`; `unprobed` falla en `--check`. Los resultados de `--probe` se persisten por canal en `~/.local/state/jarviis/health.json`. | Claude Terminal `68d8a24b` (Q1, 2026-09-12) |
| D9 | La evidencia de salud acepta JSON parseables de cualquier repo con `agent` igual al canal. El reloj primario es el timestamp del nombre de archivo, luego `mtime`; el más reciente manda, un fallo gana empates e inválidos/futuros se exponen como `ignored`. | Claude Terminal `68d8a24b` (Q2, 2026-09-12) |
| D10 | La evidencia positiva usa una ventana única de siete días en los tres canales. Auth, clave y binario solo detectan `down` inmediato; que estén bien no transforma `unprobed` en `ok`. | Claude Terminal `68d8a24b` (Q3, 2026-09-12) |

## Fases

### Fase 1 — Contrato de salud y evidencia

**Objetivo:** implementar una lectura de salud uniforme y determinista para Claude, Codex y OpenRouter.

**Entregable verificable:** `health(env, { probe, evidenceDir, exec })` devuelve por canal `status`, `until?`, `latency?`, `why?` e `ignored`; reconoce `ok`, `down`/`quota` y `unprobed`; el JSON de estado del sondeo usa `at` RFC 3339 con zona.

**Dependencias:** D1, D4, D6, D8–D10; directorios temporales de evidencia y estado inyectables.

**Riesgos:** un nombre de evidencia con fecha inválida, JSON corrupto o reloj futuro no puede elevar salud; los fallos deben quedar visibles en `ignored`, no convertirse en `ok`. Interpretar `try again at` en zona local es una dependencia deliberada de la máquina personal (D9).

### Fase 2 — Sondeo, render y exit de estaciones

**Objetivo:** integrar la salud en `stations` sin llamadas directas a binarios fuera de `providers/`.

**Entregable verificable:** `--probe` solicita los tres canales concurrentemente, corta cada uno a 30 s, persiste el resultado, imprime el informe completo y devuelve exit 1 si hay `down`, `quota` o `unprobed` con `--check`. Sin `--probe`, solo corren detectores baratos y la lectura local de evidencia. El render y `--json` distinguen sin ambigüedad `ok`, `sin cuota`, `down` y `sin sondear`.

**Dependencias:** Fase 1; D3, D5 y D7.

**Riesgos:** la primera ejecución de `--check` será roja hasta obtener evidencia positiva; es comportamiento elegido por D8. Un resultado positivo viejo no puede tapar un fallo de cuota posterior (D9).

### Fase 3 — Deuda de review adversarial

**Objetivo:** calcular y mostrar el rango pendiente de review sin afectar el exit de salud.

**Entregable verificable:** `reviewDebt({ cwd, evidenceDir, git })` entrega `lastReviewed`, `pending` y `command`; el render muestra "al día", "sin evidencia" o `N commits … /adversarial-review <sha7>..HEAD`; `--json` entrega el objeto `review` acordado.

**Dependencias:** D2, D5 y D6; repositorio Git temporal con commits y fixtures de evidencia.

**Riesgos:** falta concretar la selección entre varios `to` válidos, especialmente tras rebase o squash; no debe inventarse una relación de Git que la evidencia no demuestre.

### Fase 4 — Pruebas y documentación de operación

**Objetivo:** proteger el contrato sin tocar proveedores reales ni la red.

**Entregable verificable:** fixtures cubren éxito, cuota con fecha futura, error no parseable, evidencia corrupta/futura/ajena, empate, estado persistido, los tres resultados de sondeo, historia Git y los exits; documentación explica que `--check` necesita evidencia reciente y que Review pendiente es informativa.

**Dependencias:** Fases 1–3 y D6.

**Riesgos:** una prueba no debe depender de `HOME`, de la zona horaria real ni del estado de una cuenta; inyectar reloj, estado, ejecución y Git cuando haga falta.

## Supuestos confirmados

- Los siete días son una política de frescura de una respuesta real, común a los canales; no una inferencia de que una autenticación o una clave continúe funcionando (D10).
- La salud es de la máquina, no del checkout: por eso el `to` de otro repo no descarta una evidencia de proveedor (D9). La validación de `to` pertenece exclusivamente a Review (D2).

## Pendientes con dueño

- **Claude Terminal / Andy:** definir qué `to` se elige si varias evidencias de review son ancestros de `HEAD` y la historia fue rebased o squashed; hasta entonces Fase 3 no debe fijar esa política por intuición.
- **Claude Terminal / Build:** definir qué éxito de uso real, además de `--probe` y del JSON de `adversarial-review`, escribe una evidencia de salud; es necesario para que OpenRouter pueda renovar la ventana sin un sondeo explícito.
- **Build:** decidir la escritura atómica y la recuperación ante `health.json` ausente/corrupto, manteniendo el archivo y el reloj inyectables en tests.
