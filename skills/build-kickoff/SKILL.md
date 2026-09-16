---
name: build-kickoff
description: >-
  Abre el workspace de Conductor para un issue de Linear y le entrega el
  prompt de arranque de la estación Build: rama con la clave, /tdd sobre los
  criterios del issue, PR que referencia la clave. Úsalo cuando Andres
  invoque /build-kickoff, diga "abre el workspace de JAR-12", "arranca
  JAR-12", "empieza a construir JAR-12", "open a workspace for JAR-12", o
  pegue una clave de issue queriendo empezar a implementarla. No implementa
  nada en la sesión actual: abre otra donde se implementa.
argument-hint: "<JAR-12> [--via linear|path] [--spec docs/specs/<slug>.md] [--print]"
allowed-tools: Bash, Read, Glob
---

# /build-kickoff: del issue al workspace

La estación Build empieza en un workspace propio, con la clave del issue en
la rama para que Linear cierre el issue al merge. Este skill abre ese
workspace desde la sesión actual y le pasa el prompt de arranque. Lo que
pase dentro ya es Build; esto es la puerta.

## Paso 1: la clave

`$ARGUMENTS` trae la clave (`JAR-12`, o una URL de Linear que la contenga).
Sin clave, pregunta **una** vez y para. Sin `--spec`, el script deja que el
agente del workspace la localice desde el issue (`Spec:` al pie de la
descripción) o desde `docs/tickets/<slug>.json`; si tú la conoces, pásala.

## Paso 2: abrir

```
node <directorio-base-de-este-skill>/scripts/open.mjs <clave> [--via linear|path] [--spec …] [--title "…"]
```

**La rama agrupa las cards de una spec.** Conductor lista cada workspace por
su rama (el deep link no acepta nombre), así que el prompt manda renombrarla
a `<slug de la spec>/<clave>-<título del issue en kebab>`:
`flujos-end-to-end/jar-12-el-wayfinder-entra-por-la-estacion`. Ordenadas,
las cards de una misma spec quedan juntas. El script lee título y `Spec:`
del issue en Linear cuando hay clave en la máquina (mejor esfuerzo, 3 s);
sin clave, pásalos con `--spec` y `--title`, o el prompt deja la plantilla
y el agente la completa. La clave sigue en la rama: Linear cierra el issue
al merge igual que antes. Coste conocido: un segundo `/build-kickoff` de la
misma clave abre un workspace nuevo, porque Conductor busca el existente por
la rama que Linear generó.

**Un deep link cada vez.** Dos `open` seguidos en pocos segundos pierden el
segundo (medido el 2026-09-12). Para varios issues en paralelo, lanza uno,
espera a que exista su directorio en `~/conductor/workspaces/<repo>/` con
la rama de la clave, y lanza el siguiente.

- `--via linear` (default): `conductor://linear_id=<clave>&prompt=…`.
  Conductor lee el issue, detecta el repo y crea el workspace **en la rama
  del issue** (o va al que ya exista). Requiere Linear conectado en
  Conductor (Settings → Integrations).
- `--via path`: `conductor://prompt=…&path=<repo>`. Para cuando Linear no
  está conectado. Conductor nombra la rama; el prompt pide al agente
  renombrarla igual que arriba.

El script imprime la URL y la abre con `open`. Si Conductor responde que no
hay cuenta de Linear, repite con `--via path`; no intentes conectar Linear
desde aquí.

**En pruebas, ensayos y evals no se abre nada**: `--print` o
`JARVIIS_NO_OPEN=1` imprimen la URL y salen. Un workspace abierto por un
test es un workspace real en el Conductor de Andres.

Con cualquiera de los dos, **corre el script igual y reporta la URL**: eso es
la corrida completa y con éxito, no una corrida bloqueada. No es un motivo
para no ejecutar nada, ni para mandar al usuario a otra sesión. Medido el
2026-09-15: un eval leyó `JARVIIS_NO_OPEN=1` como "build-kickoff no puede
funcionar aquí" y no llegó a ejecutar `open.mjs`.

## Los tres momentos de comentario en la card

El prompt que este skill entrega lleva escrito, con su comando exacto, lo que
el agente del workspace tiene que dejar en la card de Linear. No es un extra
del prompt: es el contrato de Build con Andy, que lee la card desde el
teléfono y decide con lo que ahí diga. Fijado en
`docs/specs/linear-comentarios-para-humanos.md` (D1–D6, D9).

**La regla única**: se comenta solo si Andy tomaría una decisión distinta al
leerlo. Progreso, logs, lo que ya dice la PR y las dudas técnicas no se
comentan. Tono: el mensaje que dejarías a un colega en Slack al salir, en
español y sin tecnicismos.

| Momento | Cuándo | Qué dice | Comando |
|---|---|---|---|
| Arranque | al abrir el workspace | una línea con alcance y plan; ni rama ni workspace, que eso ya lo muestra Conductor | `move <clave> "In Progress"` + `comment <clave> -` |
| Cambio de plan | cuando ocurre | decisión que altera el alcance, sorpresa o bloqueo: qué, por qué y qué espera, sin prometer plazos; enlace a spec o veredicto si hay detalle | `comment <clave> -` |
| Cierre | al abrir la PR | resultado en lenguaje de usuario, número de PR y "se cierra con esta PR" | `move <clave> "In Review"` + `comment <clave> -` |

Un **issue derivado** es obligatoriamente un cambio de plan: se crea con
`create --team <equipo> --title … --description - --blocked-by <clave>` y el
padre recibe un comentario que dice por qué nació y a qué bloquea. El
2026-09-12 apareció uno (JAR-8) sin una línea de explicación.

Todo eso pasa por `node ~/.claude/skills/to-tickets-linear/scripts/linear.mjs`
(la **única puerta al tablero**, D7): el prompt no pide ni acepta una petición
a mano contra la API de Linear, y `move` rechaza por diseño las categorías de
cierre — a Done lo lleva el merge de la PR, nunca un comando.

Los comentarios y los dos `move` los ordena el prompt, así que el agente no
tiene que pedir permiso para ellos; lo que sigue esperando el visto bueno de
Andres es git (push y PR).

**Tres momentos, y el prompt no promete nada más.** La propiedad que decide si
algo puede entrar en el prompt: se cumple con lo que el agente hace mientras
trabaja, sin depender de un reloj ni de una sesión viva. Un aviso cada tanto,
un resumen periódico, un recordatorio "mientras avanzas" o un "te voy
contando" no la cumplen — nadie queda ejecutándolos cuando la sesión acaba, y
el prompt sería una promesa que la card no puede sostener (por eso la spec
también deja fuera el temporizador de issues bloqueados).

Si Andres pide seguir el avance desde el móvil, la respuesta son los tres
momentos: eso es lo que la card va a contar, y el cambio de plan cubre lo que
de verdad le haría decidir distinto. No se añade la cadencia al prompt ni se
ofrece montarla por otra vía; si insiste después de oír el porqué, es su
decisión y se le dice qué estación lo haría, pero no sale de aquí.

## Paso 3: parar

Reporta la URL y qué hizo Conductor (workspace nuevo o existente). **No
implementes el issue en esta sesión**: la sesión actual no es el workspace
del issue, y todo lo que se haga aquí queda en la rama equivocada. Si el
usuario insiste en implementar aquí, dile que la rama actual no lleva la
clave y que Build vive en el workspace que acabas de abrir.

## Ejemplos

`/build-kickoff JAR-12`
→ abre `conductor://linear_id=JAR-12&prompt=…`; reporta la URL.

`/build-kickoff JAR-12 --via path --spec docs/specs/login.md`
→ abre un workspace en el repo actual con el prompt que nombra la spec.
