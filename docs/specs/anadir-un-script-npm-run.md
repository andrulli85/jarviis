---
title: "Script npm run stations que imprime la tabla de estaciones con su estado real"
status: idea
date: 2026-09-11
issue: null
---

# Script `npm run stations` para comprobar la instalación de la fábrica de un vistazo

añadir un script `npm run stations` que imprima la tabla de las cinco estaciones con su estado real (existe / sin enlazar / manual / por construir) sin necesitar una entrada, para comprobar la instalación de la fábrica de un vistazo

## Ruta

| # | Estación | Entrada → Salida | Skills | Estado |
|---|---|---|---|---|
| 1 | Shape | idea → spec interrogada en docs/specs/<slug>.md | `buzz-kickoff`, `grilling` | existe |
| 2 | Slice | spec → issues en Linear con dependencias | `to-tickets-linear` | existe |
| 3 | Build | issue → workspace de Conductor en la rama del issue → PR que referencia la clave | `build-kickoff`, `tdd`, `git-conventions` | existe · proveedor: claude |
| 4 | Review | PR → hallazgos verificados | `adversarial-review`, `code-review` | existe · proveedor: codex |
| 5 | Ship / Learn | PR mergeada → issue cerrado en Linear, learning en el vault | `learnings` | existe |

## Preguntas abiertas

- ¿El script reutiliza `skills/wayfinder/scripts/route.mjs` (exponiendo la parte que mira el disco como función) o vive aparte en `providers/bin/`? Dos copias de la lógica de estado divergirían.
- El estado "sin enlazar" no existe hoy en el wayfinder (solo `existe` / `manual` / `por construir`): ¿se añade también a la ruta que imprime el wayfinder, o es exclusivo de este script?
- ¿Debe mostrar también el estado de los proveedores (claude / codex / openrouter) o solo el de las skills?
- ¿Salida solo en tabla markdown, o también `--json` para que otro agente lo consuma?
- ¿Cuando algo falta, sale con código distinto de 0 (útil como check en un script de instalación) o siempre 0?
