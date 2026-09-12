# Plan: construir la fábrica

Orden de construcción de jarviis. El `README.md` describe qué es la fábrica;
este archivo dice qué falta por hacer y en qué orden. Cuando una fase cierra,
se marca aquí con la fecha y el commit; el README no lleva estado.

| # | Fase | Entrega | Estado |
|---|---|---|---|
| 1 | Contrato de artefactos | Sección "Contrato de artefactos" del README | hecha 2026-09-11 |
| 2 | `providers/` | Resolvedor único `claude` \| `codex` \| `openrouter`, CLI `bin/ask.mjs`, 43 tests sin proveedor real | hecha 2026-09-11 (`e737490`) |
| 3 | `wayfinder` | `skills/wayfinder/` (SKILL.md, `stations.json`, `scripts/route.mjs`, evals). 21 tests unitarios y 6 casos headless | hecha 2026-09-11 (`bcc01b7`) |
| 4 | `to-tickets-linear` | Fork de `to-tickets-jira` por GraphQL con `LINEAR_API_KEY` (sin MCP: pide OAuth interactivo y la skill debe correr headless contra un stub). Única estación que el wayfinder marca `por construir` | hecha 2026-09-11 (`21a804d`, `c99017c`) |
| 5 | Workspace desde issue | `skills/build-kickoff/`: deep link `conductor://linear_id=<clave>&prompt=…` (workspace en la rama del issue) o `conductor://prompt=…&path=<repo>` sin Linear conectado. 7 tests y 4 casos headless | hecha 2026-09-11 (`76ae16a`) |
| 6 | `docs/flows.md` | Mapa end to end generado desde `stations.json` (`transitions`, `npm run flows`, golden en `npm test`); el README enlaza al mapa y a `npm run stations` en vez de copiar la tabla | hecha 2026-09-12 (JAR-10 `5ad5ebb`, JAR-11 en esta PR) |

## Regla de cierre de fase

Toda fase termina con `/code-review` antes del commit. Medido el 2026-09-11:
la fase 2 cerró con 43 tests en verde y un smoke real por canal, y aun así
llevaba tres defectos que la review de la fase 3 encontró (`opposite`/`family`
ignorados en `need:text`, familia desconocida aceptada, env var sin
canonizar). Tests en verde no sustituyen a la review.

## Fase 4: `to-tickets-linear`

- Entrada: `docs/specs/<slug>.md`. Salida: issues en Linear con relaciones
  `blocks` nativas, clave `JAR-n` en cada uno, `Spec:` al pie de la
  descripción.
- El borrador vive en `docs/tickets/<slug>.json` (formato del script); tras
  publicar, cada issue del borrador lleva su `key`.
- Hereda de `to-tickets-jira` la disciplina de borrador y aprobación; cambia
  el camino de publicación completo (`scripts/linear.mjs`).
- Dos propiedades en código, no en prosa: los ids viajan y los nombres no;
  ningún issue creado acaba en categoría `completed`/`canceled`.

Hecho: `SKILL.md`, `scripts/linear.mjs`, `test/linear.test.mjs` + `stub.mjs`
(11 tests, en la suite global), `evals/evals.json` (4 casos, 2 negativos de
comportamiento).

Cerrada: evals headless 4/4 con el stub, `/code-review` (4 hallazgos
corregidos), smoke real `resolve JAR` y `publish --dry-run` sin escrituras.
Del contacto real salió `duplicate` como tercera categoría de cierre.

## Fase 5: workspace desde issue

- Entrada: clave de Linear. Salida: workspace de Conductor abierto en la
  rama del issue, para que Linear cierre al merge.
- Verificado antes de diseñar: el CLI `conductor` solo crea workspaces
  cloud (y pide token). Lo que sirve es el deep link documentado
  (`conductor.build/docs/reference/deep-links`). Requiere Linear conectado
  en Conductor; con `--via path` funciona sin conexión.
- `JARVIIS_NO_OPEN=1` / `--print` para que ningún eval abra un workspace
  real.

## Después del merge (PR #1)

1. Enlazar `wayfinder`, `to-tickets-linear` y `build-kickoff` en
   `~/.claude/skills` y reiniciar la sesión.
2. Conectar Linear en Conductor (Settings → Integrations).
3. Primera pasada de punta a punta con una idea pequeña.

## Pendientes fuera del orden

- Renovar `OPENROUTER_API_KEY` en `.zshenv` (`401 User not found`).
- Corregir en `adversarial-review` la nota "Andres no usa OpenRouter"
  (2026-09-10) para que nadie la lea como vigente.
- `codex` sin cuota hasta el 2026-09-16.
