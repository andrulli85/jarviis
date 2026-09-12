# Brief: quiz de Slice para "comentarios en las cards de Linear" (desglose en issues)

## Qué es esto

Grill **entre agentes** en modo `dec`: tú (Codex Grill) atacas el desglose que Claude Terminal
propone; Claude Terminal decide todas las preguntas técnicas y de desglose; Andy valida el
paquete con ✅ (solo una pregunta de intención de producto iría a `@Andy`). **Tope: 2 rondas**
(pregunta, respuesta, una réplica si la respuesta va contra tu recomendación, cierre). Cierra
antes si una ronda no cambia nada. Al cerrar, lista las preguntas del brief que no trataste con
la decisión vigente y quién la tomó.

## Abre estos archivos antes de la primera pregunta

- `REPOS/personal/claude-toolkit/jarviis/docs/tickets/linear-comentarios-para-humanos.json` (borrador, dos issues)
- `REPOS/personal/claude-toolkit/jarviis/docs/specs/linear-comentarios-para-humanos.md` (spec, D1–D10)
- `REPOS/personal/claude-toolkit/jarviis/docs/grill/linear-comentarios/gpt-review.md` (tu revisión previa vía codex exec y qué se adoptó)
- `REPOS/personal/claude-toolkit/jarviis/skills/to-tickets-linear/scripts/linear.mjs` (lo que ya existe: resolve, issue, publish)
- `REPOS/personal/claude-toolkit/jarviis/skills/build-kickoff/scripts/open.mjs` (`kickoffPrompt`, donde irán los tres momentos)

## Desglose propuesto

| # | Título | Bloqueado por | Entrega |
|---|---|---|---|
| 1 | Hacer de `linear.mjs` la única puerta al tablero: `comment`, `create`, `assign`, `move`, `link` | — | los cinco comandos + `publish` asigna, stub, tests, sección en SKILL.md |
| 2 | Los tres momentos de comentario en las cards desde `build-kickoff` y Slice | 1 | prompt y SKILL.md de build-kickoff, paso 6 de to-tickets-linear, fila en el README, evals |

Sin subtareas; prioridad normal en ambos.

## Las decisiones en juego, con la recomendación de Claude Terminal

- Q1 Granularidad. A: dos issues (API primero, consumidores después). B: uno solo. C: tres (separar los comandos de "lectura/escritura simple" de `create --blocked-by`). ➡️ A: el #1 se demuestra solo contra el stub; el #2 es prosa en prompts y evals que necesita los comandos para nombrarlos.
- Q2 `move` rechaza `completed`/`canceled` (D8). A: sí, exit 3; el cierre lo hace la PR. B: permitirlo con `--force`. ➡️ A: la propiedad "el gate de aceptación es humano" ya existe en `publish`; un `--force` es la puerta que alguien acabará usando.
- Q3 Bloqueo sin reloj (D3). A: comentario al bloquearse y al retomar, sin "cada 24 h". B: además, un recordatorio programado. ➡️ A: no hay proceso vivo que lo ejecute; una promesa que nadie cumple es peor que ninguna.
- Q4 Quién comenta en Slice. A: Claude Terminal, un comentario por issue al publicar, con el resumen del desglose y enlace al veredicto. B: solo en el issue raíz. ➡️ A: cada card se lee sola desde el teléfono.

## Qué atacar

Si los cinco comandos caben en un issue verificable o es demasiado; si `create --blocked-by`
duplica lo que `publish` ya hace con relaciones; si la regla única (D1) es aplicable por un
agente sin criterio humano; si los evals del #2 pueden probar "no GraphQL a mano"; cualquier
hueco entre borrador y spec.

## Qué debe salir

Veredicto `dec`: por cada Q, decisión final y quién la tomó; cambios al borrador; pendientes con
dueño (ninguno sin decisión por defecto).
