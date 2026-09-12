# Brief: quiz de Slice para `stations --check` (desglose en issues de Linear)

## Qué es esto

Un grill **entre agentes** en modo `dec`: tú (Codex Grill) atacas el desglose en issues que
Claude Terminal propone; Claude Terminal responde con decisiones; Andy lee y cierra con ✅. Solo
después se publica en Linear. **Tope: 2 rondas** (una ronda = pregunta, respuesta, una réplica si
la respuesta va contra tu recomendación, cierre). Cierra antes si una ronda no cambia nada.

## Abre estos archivos antes de la primera pregunta

- `REPOS/personal/claude-toolkit/jarviis/docs/tickets/stations-check-proveedores-y-review.json` (el borrador: tres issues con descripción completa)
- `REPOS/personal/claude-toolkit/jarviis/docs/specs/stations-check-proveedores-y-review.md` (la spec, D1–D13)
- `REPOS/personal/claude-toolkit/jarviis/docs/grill/stations-check-gpt/verdict.md` (tu veredicto anterior)
- `REPOS/personal/claude-toolkit/jarviis/skills/to-tickets-linear/SKILL.md` (reglas de rebanada: vertical, se demuestra sola, una fase no es un issue)

## Desglose propuesto

| # | Título | Bloqueado por | Entrega | Etiqueta / prio |
|---|---|---|---|---|
| 1 | Añadir `providers.health()` y `--probe` para que `stations --check` sea verde solo con evidencia reciente | — | `health()`, `--probe`, `health.json`, `ask()` escribe evidencia, fila/pie/exit, tests | Feature / alta |
| 2 | Mostrar en `stations` la deuda de review adversarial con `reviewDebt()` | 1 | `reviewDebt()`, sección "Review pendiente", `--json review`, tests con repo temporal | Feature / normal |
| 3 | Documentar `--probe`, estados de salud y Review pendiente en el README | 2 | README + fila en `docs/plans/fabrica.md` | Improvement / normal |

Sin subtareas.

## Las decisiones en juego, con la recomendación de Claude Terminal

- Q1 Granularidad. A: tres issues. B: dos, README como subtarea del #2. C: uno con las cuatro fases del veredicto como subtareas. ➡️ A: #1 y #2 se demuestran solos; el README es deuda visible aparte.
- Q2 D11 (qué `to` manda tras rebase/squash). A: gana el `to` ancestro más reciente en la historia; un `to` que dejó de ser ancestro no cuenta. B: buscar el equivalente por patch-id. ➡️ A: B inventa una relación que git no garantiza.
- Q3 D12 (`ask()` escribe evidencia de salud). A: sí, cualquier uso real renueva la ventana. B: solo `--probe` y `adversarial-review`. ➡️ A: es lo único que hace útil la ventana para OpenRouter y Claude.
- Q4 Prioridad del #1. A: alta. B: normal. ➡️ A: es el único que corrige un falso verde vigente.

## Qué atacar

Si las rebanadas son verticales de verdad (¿el #1 mezcla `providers/` y `stations.mjs` en una sola PR?), si el #2 depende del #1 por código o solo por orden, si el README merece issue, si D11/D12 tienen un caso que las rompe, y cualquier hueco entre borrador y spec.

## Qué debe salir

Veredicto en modo `dec`: por cada Q, decisión final y quién la tomó; cambios al borrador si los hay; pendientes con dueño.
