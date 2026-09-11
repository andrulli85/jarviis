# AGENTS.md

Instrucciones para agentes de código que trabajan en `jarviis`. El README explica qué
es la fábrica; este archivo dice cómo tocarla sin romper sus convenciones.

## Proyecto

Fábrica personal de software: una línea de estaciones (Shape, Slice, Build, Review,
Ship) implementadas como skills de Claude Code, con una capa de proveedores que decide
qué modelo atiende cada petición. Node ≥ 20, ESM puro, **sin dependencias**: todo lo
que hace falta está en la librería estándar de Node.

## Estructura

| Ruta | Qué hay |
|---|---|
| `skills/<nombre>/` | Una estación: `SKILL.md`, `scripts/`, `test/`, `evals/evals.json`. Se enlaza a `~/.claude/skills/<nombre>` |
| `skills/wayfinder/stations.json` | Única fuente de la tabla de estaciones |
| `providers/` | Resolvedor de canal y modelo (`index.mjs`), canales en `lib/channels/`, CLI en `bin/ask.mjs` |
| `agents/` | Un archivo por agente de Buzz (frontmatter + instrucciones) y `README.md` con las reglas comunes |
| `scripts/` | Utilidades del repo que no son una estación (`agents-sync.mjs`) |
| `docs/specs/`, `docs/tickets/`, `docs/plans/` | Artefactos de la línea; ver "Contrato de artefactos" en el README |

## Comandos

```bash
npm test                     # toda la suite: providers, skills y scripts
node --test 'skills/wayfinder/test/*.test.mjs'   # una sola carpeta
npm run ask -- --status      # estado de los proveedores en esta máquina
npm run agents:sync          # genera la sección de la colmena desde agents/ y la copia a ~/.buzz/AGENTS.md
```

Los evals de comportamiento de una skill se corren con
`~/.claude/skills/skill-evals/runner/run-evals.py` en un sandbox sin remoto, nunca
contra la máquina real.

## Convenciones de código

- Español en código, comentarios, mensajes de error y tests. Identificadores técnicos
  en su forma original.
- Cada script empieza con un bloque de comentario que dice qué hace, cómo se invoca
  y qué códigos de salida tiene (ver `providers/bin/ask.mjs`).
- Lógica en funciones exportadas y puras; el bloque `main` solo parsea flags y llama.
  Se testea la función, no `main`.
- Tests con `node:test` + `node:assert/strict`. El estado del mundo se fabrica en un
  directorio temporal (`mkdtempSync`), nunca se lee `~` ni se llama a un proveedor
  real. El patrón está en `skills/wayfinder/test/route.test.mjs` (`fakeWorld`).
- Ninguna estación llama a un binario o a una URL por su cuenta: pasa por
  `providers/index.mjs`.
- Toda afirmación sobre código lleva ruta de archivo y línea.

## Git y PRs

- Ramas en kebab-case descriptivo, sin prefijo de tipo; si hay issue de Linear, la
  clave va en el nombre (`jar-12-...`).
- Mensajes de commit en español: título como frase completa, cuerpo con el porqué en
  párrafos. **Nunca** un trailer `Co-Authored-By` ni otra atribución a herramientas.
- Una PR por cambio; la primera línea del cuerpo referencia la clave del issue si la
  hay. `npm test` en verde antes de abrirla.

## Colmena de Buzz

Los agentes de Buzz (Honey, Fizz, Pollen, Claude) se definen en `agents/`: un archivo por
agente con frontmatter y sus instrucciones propias, y `agents/README.md` con las reglas
comunes de conversación y lo ya decidido. Esas reglas aplican también dentro del repo.
`npm run agents:sync` genera de esa carpeta la sección que los agentes leen en cada turno
en `~/.buzz/AGENTS.md`.
