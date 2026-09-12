# Ruta: docs/specs/login-con-enlace-magico-por.md

Entrada: **idea** → entra por **Shape**. Slug `login-con-enlace-magico-por`. Spec: `docs/specs/login-con-enlace-magico-por.md`.

| # | Estación | Entrada → Salida | Skills | Estado |
|---|---|---|---|---|
| 1 | Shape | idea → spec interrogada en docs/specs/<slug>.md | `buzz-kickoff`, `grilling` | existe |
| 2 | Slice | spec → issues en Linear con dependencias | `to-tickets-linear` | existe |
| 3 | Build | issue → workspace de Conductor en la rama del issue → PR que referencia la clave | `build-kickoff`, `tdd`, `git-conventions` | existe · proveedor: claude |
| 4 | Review | PR → hallazgos verificados | `adversarial-review`, `code-review` | existe · proveedor: codex |
| 5 | Ship / Learn | PR mergeada → issue cerrado en Linear, learning en el vault | `learnings` | existe |

## Siguiente paso

`/buzz-kickoff docs/specs/login-con-enlace-magico-por.md`
