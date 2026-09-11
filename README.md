# jarviis — fábrica personal de software

Herramienta personal para construir software rápido con IA: skills, agentes y
tres piezas externas que ya están en el día a día.

| Pieza | Rol en la fábrica |
|---|---|
| Conductor | Ejecución: un workspace (worktree) por issue, agentes en paralelo |
| Buzz | Conversación: grill de ideas y decisiones con el equipo |
| Linear (free) | Estado: backlog, issue activo, enlace a PR |
| Claude Code skills | Estaciones de la línea |
| Codex CLI | Segundo agente ejecutor/revisor (familia GPT) |
| OpenRouter | Acceso HTTP a cualquier modelo sin CLI (terceras opiniones, tareas baratas) |

## Línea de producción

Cada estación recibe un artefacto y produce el siguiente. El wayfinder es la
primera estación y a la vez el mapa de todas las demás.

| # | Estación | Entrada → Salida | Skill | Estado |
|---|---|---|---|---|
| 0 | Intake (wayfinder) | idea en texto libre → ruta (estaciones a recorrer, preguntas abiertas) | `wayfinder` | existe (`skills/wayfinder`) |
| 1 | Shape | idea → spec interrogada | `buzz-kickoff` / `grilling` | existe |
| 2 | Slice | spec → issues en Linear con dependencias | `to-tickets-linear` | por construir (fork de `to-tickets-jira`) |
| 3 | Build | issue → workspace Conductor → PR | `tdd`, `git-conventions` | existe (manual: crear workspace) |
| 4 | Review | PR → hallazgos verificados | `adversarial-review`, `code-review` | existe |
| 5 | Ship / Learn | PR mergeado → learning en el vault | `learnings`, `keeper` | existe |

Regla: el wayfinder **enruta, no ejecuta**. Si una estación está `manual`,
el wayfinder dice exactamente qué hacer a mano. Cuando la estación gana skill,
solo cambia `skills/wayfinder/stations.json`, que es la fuente de esta tabla;
el estado real (`existe` / `manual` / `por construir`) lo calcula el wayfinder
mirando el disco en cada corrida, no esta copia.

## Skills de la fábrica

Viven en `skills/<nombre>/` y se enlazan a `~/.claude/skills/<nombre>` como
el resto del toolkit:

```
ln -s ~/personal/claude-toolkit/jarviis/skills/wayfinder ~/.claude/skills/wayfinder
```

Un enlace nuevo no aparece hasta reiniciar la sesión de Claude Code. Cada
skill lleva `evals/evals.json` y se regresa con
`~/.claude/skills/skill-evals/runner/run-evals.py` en un sandbox sin remoto.

## Proveedores

Cada estación declara **qué necesita** (un agente con herramientas sobre el
árbol, o solo una respuesta a un prompt) y un único resolvedor decide **quién**
lo atiende. Ninguna estación llama a un binario o a una URL por su cuenta.

| Canal | Cómo se invoca | Cuándo |
|---|---|---|
| `claude` | Claude Code CLI (binario de Conductor) | Estación por defecto en la familia Anthropic |
| `codex` | Codex CLI (binario de Conductor, `codex exec`) | Cuando hace falta la otra familia: revisión cruzada, segunda implementación |
| `openrouter` | HTTP `chat/completions` con `OPENROUTER_API_KEY` | Sin herramientas: clasificar, resumir, juez, modelos que no tienen CLI |

Reglas que ya están medidas en `~/.claude/skills/adversarial-review` y se
heredan tal cual:

- **Binarios**: nunca el `codex` del PATH (el wrapper npm deja un shim que muere
  con ENOENT). Se resuelve desde
  `~/Library/Application Support/com.conductor.app/agent-binaries/<agente>/<versión>/`,
  versión más nueva primero. Overrides `CE_CODEX_BIN` / `CE_CLAUDE_BIN`;
  vacío significa "sin binario", no "búscalo tú".
- **Familia**: el resolvedor sabe quién escribió el cambio (`detectAuthor` en
  `family.mjs`) y quien revisa es siempre de la otra familia.
- **Ids de modelo**: forma canónica `vendor/modelo` (`openai/gpt-5.6-terra`,
  `anthropic/claude-opus-5`). Cada canal traduce a su propio vocabulario
  (Codex quiere `gpt-5.6-terra`, sin prefijo).
- **OpenRouter**: el contrato JSON, el vocabulario de fallos y el stub de
  pruebas (`CE_OPENROUTER_URL`) viven en el `adversarial-review.mjs` retirado;
  se reutilizan, no se reescriben. Una respuesta que no llegó no es una
  respuesta.
- **Evals**: ningún test toca un proveedor real. Los binarios se apuntan a una
  ruta inexistente y OpenRouter a un stub local.

Nota: `adversarial-review` retiró su ruta OpenRouter el 2026-09-10 con la
anotación "Andres no usa OpenRouter". Esta fábrica la reactiva en
`providers/`; queda actualizar esa nota en la skill para que nadie la lea
como vigente.

Estado del 2026-09-11: los tres canales resuelven en esta máquina.
`openrouter` devuelve `401 User not found` (clave del `.zshenv` a renovar) y
`codex` está sin cuota hasta el 2026-09-16. Ver `providers/README.md`.

## Contrato de artefactos

Lo que las estaciones se pasan entre sí. Fijado el 2026-09-11; cada skill lo
asume sin preguntar.

| Artefacto | Regla |
|---|---|
| Spec | `docs/specs/<slug>.md` en el repo del producto (no en el vault). La PR y la spec van en el mismo diff. |
| Issue | Clave de Linear (`JAR-12`) es la clave única de todo el hilo. Título en imperativo. Descripción enlaza la spec. |
| Workspace Conductor | Nombre = clave del issue. Rama según `git-conventions`, con la clave incluida para que Linear la detecte. |
| PR | Primera línea del cuerpo referencia la clave. Linear cierra el issue al merge. |
| Learning | Frontmatter con `date:` y `issue: JAR-12`. |

## Orden de construcción

1. Fijar el contrato de artefactos (sección anterior).
2. ~~`providers/`~~ hecho: resolvedor único (`claude` | `codex` | `openrouter`),
   extraído de `tooled-review.mjs` (binarios, familia) y del
   `adversarial-review.mjs` retirado (HTTP, contrato JSON, stub). `npm test`.
3. ~~`wayfinder`~~ hecho: `skills/wayfinder/` (SKILL.md, `stations.json`,
   `scripts/route.mjs`, evals). 17 tests unitarios y 6 casos headless en verde
   el 2026-09-11.
4. `to-tickets-linear`: fork de `to-tickets-jira` sobre el MCP oficial de Linear.
5. Automatizar la creación del workspace Conductor desde un issue.
