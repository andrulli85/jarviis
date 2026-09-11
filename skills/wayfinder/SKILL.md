---
name: wayfinder
description: >-
  Puerta de entrada de la fábrica personal de software: toma una idea, una
  clave de issue de Linear (JAR-12), una PR o una spec y devuelve la ruta por
  la línea de producción (Shape, Slice, Build, Review, Ship), con el estado
  real de cada estación en esta máquina y el comando exacto del siguiente
  paso. Úsalo cuando Andres invoque /wayfinder, pregunte "por dónde empiezo",
  "qué hago con esta idea", "arma la ruta", "route this", "where does this
  go", suelte una idea de producto y quiera convertirla en software, o pegue
  una clave de issue o una PR sin decir qué hacer con ella. Enruta, no
  ejecuta: nunca implementa, nunca crea issues, nunca revisa; señala qué
  estación lo hace.
argument-hint: "<idea | JAR-12 | PR #4 | docs/specs/x.md>"
allowed-tools: Bash, Read, Write, Glob
---

# /wayfinder: la primera estación es el mapa

Una entrada, una ruta. La fábrica tiene cinco estaciones y cada una recibe un
artefacto y produce el siguiente. Este skill decide **por cuál se entra** y
**qué hay disponible** para recorrerla; las estaciones hacen el trabajo.

La tabla de estaciones vive en `stations.json`, junto a este archivo. Es la
única fuente: cuando una estación gane skill o cambie de comando, se edita
ahí y este skill lo refleja solo.

## Regla única

**El único efecto secundario del wayfinder es el esqueleto de la spec.**
Cualquier cosa que cambie el árbol del producto más allá de ese archivo, o
toque Linear, git, Buzz o un proveedor de modelos, pertenece a una estación
y no se hace aquí, aunque la entrada esté redactada como una orden
("implementa JAR-12", "haz login mágico ya"). La respuesta a una orden es la
ruta y el comando de la estación que la ejecuta.

## Paso 1: calcular la ruta

```
node <directorio-base-de-este-skill>/scripts/route.mjs "$ARGUMENTS"
```

Corre desde el repositorio del producto (el `cwd` de la sesión). El script
es determinista: clasifica la entrada, elige la estación de entrada, mira en
disco qué skills existen (personales y de plugins) y qué proveedores
responden, y lista las preguntas abiertas que puede detectar solo.

| Entrada | Detectada por | Entra por |
|---|---|---|
| idea | texto libre | Shape |
| spec | ruta `docs/specs/<slug>.md` existente | Slice (si no existe, vuelve a Shape) |
| issue | clave `ABC-12` en mayúsculas, o del prefijo `JARVIIS_LINEAR_PREFIX` en cualquier caja | Build |
| PR | URL de GitHub, `PR #n`, `pull request n` (un `#n` suelto no) | Review |
| PR mergeada | PR + "merged"/"mergeada" | Ship |

Sale con código 2 si la entrada está vacía: pide la entrada con **una**
pregunta y vuelve a correrlo. Sin `$ARGUMENTS`, usa el último mensaje del
usuario como entrada.

## Paso 2: presentar la ruta tal cual

Muestra la salida del script sin resumirla: la tabla con el estado de cada
estación (`existe`, `manual`, `por construir`), las preguntas abiertas y el
siguiente paso. Si conoces el producto lo bastante para añadir preguntas
abiertas sobre la idea (alcance, usuarios, qué no es), añádelas debajo de
las del script, como preguntas, no como decisiones.

Cuando una estación marca **proveedor no disponible**, dilo en una línea con
la causa que da el script (binario ausente, cuota, clave). No lo resuelvas.

## Paso 3: el esqueleto de la spec, solo para ideas

Solo si `kind` es `idea` **y** `docs/specs/<slug>.md` no existe, créalo:

```markdown
---
title: "<la idea en una línea>"
status: idea
date: YYYY-MM-DD
issue: null
---

# <título>

<la entrada del usuario, literal>

## Ruta

<la tabla de estaciones que imprimió el script>

## Preguntas abiertas

<las del script y las tuyas>
```

Para `spec`, `issue`, `pr` y `merged` no se escribe nada: el artefacto ya
existe o lo produce otra estación.

## Paso 4: entregar el siguiente comando y parar

Termina con el comando de la siguiente estación, copiable, y nada más. Si la
estación es `manual`, el paso manual va antes del comando. Si es `por
construir`, dilo y describe la salida que hay que producir a mano.

No invoques la siguiente skill. El usuario decide cuándo cruza a la
estación siguiente; que el wayfinder la cruzara por él sería ejecutar.

## Ejemplos

`/wayfinder login con enlace mágico por email`
→ idea, entra por Shape, crea `docs/specs/login-con-enlace-magico-por.md`,
termina con `/buzz-kickoff docs/specs/login-con-enlace-magico-por.md`.

`/wayfinder JAR-12`
→ issue, entra por Build, no escribe nada, termina con `/build-kickoff JAR-12`.

`/wayfinder https://github.com/andrulli85/x/pull/4`
→ PR, entra por Review, reporta si la familia opuesta tiene binario, termina
con `/adversarial-review`.
