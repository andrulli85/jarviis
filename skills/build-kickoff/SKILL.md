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
