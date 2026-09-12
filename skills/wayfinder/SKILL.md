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

La tabla de estaciones y sus transiciones viven en `stations.json`, junto a
este archivo. Es la única fuente: cuando una estación gane skill, cambie de
comando o gane una rama, se edita ahí y este skill lo refleja solo.

## Regla única

**El único efecto secundario del wayfinder es el esqueleto de la spec.**
Cualquier cosa que cambie el árbol del producto más allá de ese archivo, o
toque Linear, git, Buzz o un proveedor de modelos, pertenece a una estación
y no se hace aquí, aunque la entrada esté redactada como una orden
("implementa JAR-12", "haz login mágico ya"). La respuesta a una orden es la
ruta y el comando de la estación que la ejecuta.

Las únicas lecturas fuera de esta máquina son el estado del issue en Linear
y el de la PR en GitHub, y las hace el script, no la sesión. **No busca
credenciales ni instala ni autentica nada: sin clave, pregunta; sin `gh`,
pregunta.** Si el script dice que no pudo leer el estado, esa pregunta es
la respuesta: no se lee `~/.config`, no se inspecciona el entorno, no se
llama a la API a mano (ni a Linear ni a `api.github.com`), no se corre
`brew install gh` ni `gh auth login`, y no se le pide al usuario una clave
ni un token. Lo que conseguiría una credencial o un binario por otra vía
es, por definición, buscar credenciales.

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
| PR | URL de GitHub, `PR #n`, `pull request n` (un `#n` suelto no) | Review (con `gh`: lo que diga GitHub) |
| PR mergeada | PR + "merged"/"mergeada" | Ship (con `gh`: lo que diga GitHub) |

Para un issue, Build es la entrada **si no se sabe más**. Con clave de
Linear (`LINEAR_API_KEY` o `~/.config/linear/key`) el script lee el estado
del issue y su PR adjunta (3 s de margen) y entra por la estación que dicta
la categoría del estado: backlog o en curso sin PR → Build; en curso con PR
abierta → Review; PR mergeada o completado → Ship; cancelado o duplicado →
sin ruta, una pregunta. La cabecera dice de dónde salió la entrada
(`JAR-8 está **Done** en Linear (PR mergeada) → entra por **Ship / Learn**`)
para que quien lee sepa que la ruta viene del tablero y no del texto. Sin
clave, sin red o si el issue no existe, entra por Build como siempre y lo
dice en una pregunta abierta con la causa; en `--json` el campo `state` es
`null`.

Para una PR, Review es la entrada **si no se sabe más** (Ship si el texto
dice "merged"). Con `gh` en el `PATH` el script lee el estado real de la PR
(`gh pr view <ref> --json state,isDraft,url,headRefName`, 3 s de margen; por
número se resuelve contra el repo del `cwd`) y entra por lo que diga GitHub:
abierta, en borrador o no → Review; mergeada → Ship; cerrada sin mergear →
sin ruta, una pregunta. La lectura manda sobre la palabra "merged" del texto
y, si discrepan, la cabecera lo dice
(`PR #13 está **abierta** en GitHub (dijiste mergeada; GitHub la tiene
abierta) → entra por **Review**`). Si la rama de la PR lleva la clave del
issue (`jar-12-…`), el `<key>` de `/learnings` sale de ahí. Sin `gh`, sin
repo GitHub en el `cwd` o con error, entra como hoy y lo dice en una
pregunta abierta con la causa; en `--json`, `state` es `null`.

Sale con código 2 si la entrada está vacía: pide la entrada con **una**
pregunta y vuelve a correrlo. Sin `$ARGUMENTS`, usa el último mensaje del
usuario como entrada.

## Paso 2: presentar la ruta tal cual

Muestra la salida del script sin resumirla: la tabla con el estado de cada
estación (`existe`, `manual`, `por construir`), la **ruta** (el camino feliz
desde la estación de entrada, un paso numerado por estación con su comando),
las **ramas** de la estación de entrada ("Si te sales del camino": cuándo y
con qué comando se sale del camino feliz; solo aparece si las hay), las
preguntas abiertas y el siguiente paso. La ruta y las ramas salen de
`transitions` en `stations.json`; se muestran, no se detectan: `when` es
texto para quien lee, y decidir si aplica es del usuario. Si conoces el
producto lo bastante para añadir preguntas abiertas sobre la idea (alcance,
usuarios, qué no es), añádelas debajo de las del script, como preguntas, no
como decisiones.

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
→ issue, entra por Build, muestra la ruta Build → Review → Ship con sus
comandos y las ramas de Build, no escribe nada, termina con
`/build-kickoff JAR-12`.

`/wayfinder JAR-8` con clave de Linear y JAR-8 en Done con su PR mergeada
→ issue, la cabecera dice que está Done en Linear, entra por Ship, termina
con `/learnings JAR-8`. Sin clave: Build, la pregunta "no pude leer el
estado de JAR-8 en Linear (sin clave)…", termina con `/build-kickoff JAR-8`,
y nadie fue a buscar la clave.

`/wayfinder https://github.com/andrulli85/x/pull/4`
→ PR, entra por Review, reporta si la familia opuesta tiene binario, termina
con `/adversarial-review`.

`/wayfinder https://github.com/andrulli85/jarviis/pull/13` con `gh` y la PR
mergeada desde la rama `jar-12-…`
→ PR, la cabecera dice que está mergeada en GitHub, entra por Ship, termina
con `/learnings JAR-12`. Sin `gh`: Review, la pregunta "no pude leer el
estado de la PR #13 en GitHub (sin gh)…", termina con `/adversarial-review`,
y nadie instaló ni autenticó nada.
