---
title: "El wayfinder enruta con las transiciones de stations.json"
status: sliced
date: 2026-09-12
issue: [JAR-9]
grill: null
---

# El wayfinder enruta con las transiciones de `stations.json`

`/wayfinder JAR-8` responde hoy "entra por Build", lista las estaciones de Build en adelante
**por índice** (`STATIONS.slice(from)`) y cierra con un comando. No menciona qué viene después
ni qué ramas existen desde ahí. Con `transitions` en `stations.json` (JAR-10), la ruta pasa a
ser un recorrido del grafo, cada paso lleva su comando, y las ramas de la estación de entrada
se muestran como "Si …: comando".

Interrogado con `/grilling` el 2026-09-12 (8 preguntas, dos rondas). Historia en Linear:
[JAR-9](https://linear.app/jarviis-app/issue/JAR-9), bloqueada por JAR-10. Seguimiento fuera de
alcance: [JAR-12](https://linear.app/jarviis-app/issue/JAR-12) (estado real del issue en Linear).

## Decisiones

| Q | Decisión |
|---|---|
| Q1 | La respuesta añade la ruta completa (camino feliz desde la entrada, con comandos) y las ramas de la estación de entrada |
| Q2 | La tabla de estaciones sale de recorrer `transitions` sin `when` desde `entry` hasta `end`, no del índice |
| Q3 | Las ramas se muestran, no se detectan; `when` es texto para humanos |
| Q4 | Leer el estado del issue en Linear queda fuera (JAR-12) |
| Q5 | `--json` añade `path: [{ station, command }]` y `branches: [{ when, to, command, skill }]`; `next` se conserva |
| Q6 | `renderMarkdown` imprime ruta y ramas **antes** de "Siguiente paso"; el último renglón sigue siendo un solo comando copiable |
| Q7 | Placeholders sin dato quedan visibles (`<equipo>`), como hace `fill()` hoy con `<spec>` |
| Q8 | Tests unitarios con fixture de `transitions` + golden de la salida actual; evals: ruta y ramas en `JAR-8`, y negativo "sigue sin ejecutar" |

## Contrato

Depende del contrato de `transitions` en `docs/specs/flujos-end-to-end.md`: `to` (id, `end`,
`outside`), `when` opcional, `command`, `skill` opcional. `route.mjs` deja de ignorar el campo.

### Ruta

`path(entry, stations)`: desde la estación `entry`, seguir en cada estación la única transición
sin `when`; parar en `end` u `outside`. Cada paso es `{ station, name, command }` con los
placeholders rellenos por `fill()` (lo que no se sabe queda visible). Una estación sin
transición sin `when` que no sea la última es un error con nombre (`stations.json` roto), no un
recorrido corto.

`stations` (la tabla) son las estaciones del `path`, con la misma forma de fila que hoy
(`stationStatus`). Con la línea actual (lineal), la tabla es idéntica a la de hoy.

### Ramas

`branches`: las transiciones con `when` de la estación de entrada, con `command` relleno igual
que la ruta. Solo la estación de entrada: las ramas de estaciones posteriores se verán cuando se
llegue a ellas.

### Salida

`--json`: el objeto actual más `path` y `branches`. `next` no cambia.

`renderMarkdown`, en este orden: cabecera (como hoy) · tabla de estaciones (como hoy) ·
**"Ruta"**: una línea numerada por paso, `n. <Estación> — \`<command>\`` · **"Si te sales del
camino"** (solo si hay ramas): `- Si <when>: \`<command>\`` · preguntas abiertas (como hoy) ·
**"Siguiente paso"** con un solo comando (como hoy). El SKILL.md del wayfinder sigue diciendo
"termina con el comando de la siguiente estación, copiable, y nada más".

## Rebanada (una)

- `route.mjs`: `path()` y `branches()` exportadas; `buildRoute` las usa; `stations` se deriva
  del `path`; `renderMarkdown` añade las dos secciones. `stationStatus`, `stationRow`,
  `findSkill`, `providerFor` no cambian.
- `stations.mjs`: sin cambios (Q12 de flujos).
- `skills/wayfinder/test/route.test.mjs`: fixture de `stations.json` con `transitions` (tres
  estaciones, una rama en la primera, un `end`): (a) `path` desde cada `entry` recorre hasta
  `end` con comandos rellenos; (b) `branches` de la entrada trae la rama con `when` y no las
  de otras estaciones; (c) placeholder sin dato queda visible en el comando; (d) estación
  intermedia sin transición feliz → error con el nombre de la estación; (e) golden: sobre el
  `stations.json` real, la salida de `JAR-8`, de una idea y de una PR mergeada es la de hoy más
  las secciones nuevas (la tabla y el último renglón no cambian).
- `skills/wayfinder/evals/evals.json`: caso "issue muestra ruta y ramas" (`/wayfinder JAR-8`:
  ruta Build → Review → Ship con comandos, rama "bloqueador fuera del plan", termina con
  `/build-kickoff JAR-8`); caso negativo "orden disfrazada" (`/wayfinder implementa JAR-8 ya`:
  responde la ruta y el comando, no abre workspace ni toca git).
- `skills/wayfinder/SKILL.md`: paso 2 menciona la ruta y las ramas; paso 4 sin cambios.

Criterios: `npm test` en verde; `node skills/wayfinder/scripts/route.mjs "JAR-8"` imprime
"Ruta" con tres pasos y "Si te sales del camino" con al menos una rama, y su último renglón
sigue siendo `/build-kickoff JAR-8`; `--json` trae `path` de tres elementos y `branches` no
vacío; evals del wayfinder en verde (los existentes y los dos nuevos).

## Fuera de alcance

- Detectar ramas desde la entrada (Q3) y leer Linear (JAR-12).
- Cambios en `stations.mjs` o en `flows.mjs`.
