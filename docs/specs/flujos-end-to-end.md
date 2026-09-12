---
title: "docs/flows.md: el mapa end to end de la fábrica, generado desde stations.json"
status: planned
date: 2026-09-12
issue: null
grill: null
---

# `docs/flows.md`: el mapa end to end de la fábrica

Un artefacto en el repo que muestre los flujos de la fábrica de punta a punta: por dónde se
entra, qué estación sigue a cuál con qué comando, qué ramas existen cuando algo se sale del
camino feliz, y qué recorridos reales ya se hicieron. Generado desde `stations.json`, nunca
escrito a mano.

Interrogado con `/grilling` el 2026-09-12 (13 preguntas, tres rondas); esta spec es el
resultado. La historia de seguimiento (que el wayfinder enrute con estos datos) es
[JAR-9](https://linear.app/jarviis-app/issue/JAR-9), fuera de alcance aquí.

## Para quién

- Andres dentro de semanas, que no recuerda el orden ni los comandos ("¿por dónde entro con
  una PR?").
- Un agente en cualquier estación, que necesita saber qué viene después sin que se lo digan.
- Una instalación nueva (persona o máquina), que lee GitHub sin instalar nada.

Lo que hoy no responde nadie: el mapa de transiciones y las ramas. El estado de instalación
ya lo da `npm run stations`; el "qué se hizo" de cada trabajo ya lo dan spec + grill + tickets.

## Decisiones

| Q | Decisión |
|---|---|
| Q1 | Público: Andres futuro + agentes + instalación nueva |
| Q2 | Ramas: solo las vividas y con respuesta en un skill; una rama inventada es una promesa |
| Q3 | Fuente única: `skills/wayfinder/stations.json` gana `transitions`; el artefacto se genera |
| Q4 | Formato: Mermaid `flowchart` para el mapa + tabla de ramas debajo (lo que lee un agente) |
| Q5 | `docs/flows.md` commiteado, generado por `npm run flows`; test golden en `npm test`; el README enlaza en vez de copiar la tabla |
| Q6 | Granularidad: solo transiciones entre estaciones; lo interno vive en cada SKILL.md |
| Q7 | Forma: `transitions: [{ to, when?, command }]`, lista única; camino feliz = sin `when` |
| Q8 | Sección "Recorridos" leída del frontmatter de `docs/specs/*.md` (`status`, `issue`, `grill`, `learnings`); sin prosa a mano |
| Q9 | El wayfinder no consume `transitions` en este trabajo (JAR-9); solo debe seguir en verde |
| Q10 | Regeneración: la dispara quien cambie la fuente, avisado por el test; sin hooks |
| Q11 | Ramas que entran: las cinco de abajo |
| Q12 | `npm run stations` no cambia: instalación y mapa son preguntas distintas |
| Q13 | Generador en `skills/wayfinder/scripts/flows.mjs`, junto a su fuente |

## Las ramas (Q11)

| Desde | Cuándo | Adónde | Skill que la atiende |
|---|---|---|---|
| Shape | la historia es del plano de trabajo (tracker corporativo, `~/work/`, nombres de empresa) | *(no aterriza)*: los artefactos quedan en el agente y se aterrizan desde el otro plano | `buzz-kickoff` paso 1 y 6 |
| Build | el issue destapa un bloqueador que no está en el plan | Slice: un issue nuevo que bloquea al actual; luego Build sobre el nuevo | `to-tickets-linear` (vivido: JAR-8) |
| Build | una PR cierra varios issues de la misma spec | Review, sin rama nueva: `Closes <clave>` por cada uno en el cuerpo | `build-kickoff` (vivido: JAR-6 + JAR-7) |
| Review | no hay reviewer de la otra familia (cuota, binario) | Ship *con deuda*: se mergea y queda anotado el rango a revisar | `adversarial-review` ("incomplete, not clean") |
| *(entrada)* | se llega con un issue, una PR o una PR mergeada | Build, Review o Ship directamente, sin Shape ni Slice | `wayfinder` (`entry`) |

## Contrato de `transitions`

En cada estación de `stations.json`:

```json
"transitions": [
  { "to": "review", "command": "/adversarial-review" },
  { "to": "slice", "when": "el issue destapa un bloqueador que no está en el plan",
    "command": "/to-tickets-linear <equipo> (un issue que bloquea al actual)", "skill": "to-tickets-linear" }
]
```

- `to`: `id` de una estación, o `"end"` para salir de la línea (Ship) o `"outside"` para
  "no aterriza".
- `when`: ausente en el camino feliz; una frase en las ramas. Es texto para humanos y agentes,
  no una condición ejecutable.
- `command`: el comando copiable, con placeholders `<…>` como en `command` de la estación.
- `skill`: opcional, el skill que atiende la rama cuando no es el de la estación de destino.
- Las entradas directas siguen en `entry`; no se duplican como transiciones.

`route.mjs` y `stations.mjs` ignoran el campo. La regla del archivo ("única fuente de la
línea") se amplía a las transiciones.

## Rebanadas

Una PR. Dos rebanadas: la primera entrega el artefacto completo; la segunda es un cierre de
deuda independiente que se demuestra sola.

### 1. `transitions` en `stations.json`, `flows.mjs`, `docs/flows.md` y su test

- `stations.json`: `transitions` en las cinco estaciones (camino feliz + las cinco ramas de
  Q11); `_` actualizado.
- `skills/wayfinder/scripts/flows.mjs` (ESM): `collectFlows({ stationsPath, specsDir })`
  exportada devuelve `{ stations, transitions, runs }`; `renderFlows(result)` exportada devuelve
  el Markdown: título, `flowchart LR` Mermaid (estaciones como nodos, camino feliz con flecha
  continua, ramas con flecha punteada y la frase `when` como etiqueta), tabla de ramas (Desde ·
  Cuándo · Adónde · Comando · Skill), tabla de entradas (desde `entry`), sección "Recorridos"
  con una fila por spec de `docs/specs/*.md` con frontmatter `issue` no nulo: título enlazado,
  `status`, claves, enlace al grill y a cada learning. `main` con el mismo guard
  `invokedDirectly` que `route.mjs`; flags `--check` (exit 1 si `docs/flows.md` difiere de lo
  generado, sin escribir) y `--out <ruta>` (por defecto `docs/flows.md`).
- `package.json`: `"flows": "node skills/wayfinder/scripts/flows.mjs"`.
- `skills/wayfinder/test/flows.test.mjs`: (a) golden: `renderFlows(collectFlows())` sobre el
  repo real coincide byte a byte con `docs/flows.md` commiteado; (b) fixture temporal con un
  `stations.json` de tres estaciones y una rama → el Mermaid contiene los tres nodos, una arista
  continua por camino feliz y una punteada con la etiqueta `when`; la tabla de ramas tiene una
  fila; (c) fixture con dos specs (una `shipped` con `issue`, `grill` y `learnings`; una con
  `issue: null`) → "Recorridos" tiene una fila, con los enlaces; (d) una transición cuyo `to`
  no es una estación ni `end`/`outside` → `collectFlows` lanza con el nombre de la estación y
  el `to`; (e) `route.mjs` y `stations.mjs`: tests existentes en verde sin tocar.
- `docs/flows.md` generado y commiteado.

Criterios: `npm test` en verde; `npm run flows -- --check; echo $?` → `0` en la rama;
editar un `when` en `stations.json` sin regenerar → `npm test` en rojo por el golden;
`docs/flows.md` se renderiza en GitHub con el diagrama.

### 2. El README enlaza a `docs/flows.md` en vez de copiar la tabla — bloqueada por 1

- Sección "Línea de producción" del README: la tabla manual de estaciones se sustituye por
  dos líneas: qué es la línea y un enlace a `docs/flows.md` (mapa) y a `npm run stations`
  (estado). La regla "cuando la estación gana skill, solo cambia `stations.json`" se conserva.
- `docs/plans/fabrica.md`: fila nueva con esta fase y su commit al cerrar.

Criterios: `grep -c '| Shape |' README.md` → `0`; el README enlaza a `docs/flows.md`;
`npm test` en verde.

## Fuera de alcance

- Que el wayfinder enrute con `transitions` (JAR-9).
- Ramas dentro de una estación (`✅` incompleto, quiz de Slice): viven en cada SKILL.md.
- Hooks de git que regeneren solos (Q10).
- Cambios en `npm run stations` (Q12).

## Preguntas abiertas

Ninguna: el frontier del grill quedó vacío.
