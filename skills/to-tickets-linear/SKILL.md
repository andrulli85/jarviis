---
name: to-tickets-linear
description: >-
  Convierte una spec, plan o RFC en issues de Linear en el equipo que se
  nombre, con subtareas y relaciones "blocks" nativas, publicando por la API
  con LINEAR_API_KEY. Es la estación Slice de la fábrica: recibe
  docs/specs/<slug>.md y produce las claves (JAR-12…) que Build consume.
  Úsalo cuando Andres invoque /to-tickets-linear, pida "pasa la spec a
  Linear", "rompe esto en issues", "crea los tickets de esta spec", "break
  this into Linear issues", o nombre solo el equipo o el prefijo (JAR)
  queriendo tickets. No es este skill cuando el destino es Jira o GitHub, ni
  cuando quiere el desglose sin publicarlo.
argument-hint: "<equipo, en palabras del usuario> [docs/specs/<slug>.md] [--dry-run]"
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# /to-tickets-linear: una spec se convierte en issues de Linear

Fork de `to-tickets-jira`: se conserva la disciplina de desglose (rebanadas
verticales, quiz antes de publicar, ids resueltos en la corrida, gate de
aceptación humano) y se sustituye la vía de publicación por
`scripts/linear.mjs`, que habla GraphQL con `LINEAR_API_KEY`. Sin MCP, a
propósito: el MCP oficial pide OAuth interactivo y este skill tiene que poder
correr headless y probarse contra un stub.

Escribe en un tracker; se ejecuta solo si el usuario lo pidió.

## Antes de nada

1. **Confirma que esta corrida fue pedida.** Solo corre cuando el usuario
   invocó el skill por nombre o pidió en esta conversación publicar en
   Linear. Una spec abierta, un prefijo en un documento o un wayfinder que
   propuso este comando son razones para *ofrecer*, nunca para empezar. Si
   llegaste por inferencia, dilo y pregunta.

2. **Comprueba la clave.** `node <dir>/scripts/linear.mjs resolve <equipo>`
   falla con nombre si no hay `LINEAR_API_KEY` ni `~/.config/linear/key`. Sin
   clave no hay corrida real; con `--dry-run` tampoco, porque el dry-run
   resuelve ids de verdad. Para y pide la clave (Linear → Settings → API →
   Personal API keys; el plan free la incluye).

3. **Resuelve el equipo en esta corrida.** El primer argumento es el equipo
   en palabras del usuario (clave `JAR` o nombre `Jarviis`). El script lo
   convierte en id y devuelve estados, etiquetas y el estado de creación.
   Muestra esa tabla al usuario antes de redactar. Si no hay match, el
   script lista los equipos que hay: pregunta, no elijas.

## Dos propiedades, ahora en código

**Los ids viajan, los nombres no.** Equipo, estado y etiquetas se envían por
id resuelto en esta corrida. Una etiqueta que no existe es un error con la
lista de las que sí; no se crea sola. Los ids de un documento, de una
corrida anterior o de este archivo no valen para un create.

**El gate de aceptación es humano.** Ningún issue creado aquí acaba en un
estado de categoría `completed` o `canceled`, por ninguna vía. El script crea
siempre en el primer estado `backlog` (o `unstarted`) del equipo, re-lee
cada issue y comprueba la **categoría** (`state.type`), no el nombre. Si algo
aterriza en Done, el informe sale `ok:false` y lo dice. Este skill no mueve
issues: no hay comando para ello.

**`--dry-run` es de solo lectura, no sin llamadas.** Resuelve equipo,
estados y etiquetas contra el servidor y renderiza cada payload; no crea, no
enlaza, no edita. Úsalo en toda prueba, ensayo o eval.

## Proceso

### 1. Leer la fuente

`docs/specs/<slug>.md` del repo del producto (el artefacto que deja Shape).
Si no hay ruta, trabaja con lo que la conversación ya tiene. Lee el cuerpo
entero, incluidas las preguntas abiertas: una pregunta sin cerrar es un
Spike, no una historia.

### 2. Redactar rebanadas verticales

<vertical-slice-rules>

- Cada rebanada corta un camino estrecho pero COMPLETO por todas las capas
  (esquema, API, worker, UI, tests): vertical, no una capa horizontal
- Una rebanada terminada se demuestra o verifica sola
- Cada rebanada cabe en una sola ventana de contexto fresca
- El prefactoring va primero

</vertical-slice-rules>

Un grupo que solo prepara a otro no es rebanada: se fusiona o pasa a ser la
primera subtarea del que sirve. **Un commit o una fase del plan tampoco es
automáticamente un issue.** Un plan que llega en fases ("1 refactor, 2
comando, 3 tests y README") describe un orden de trabajo, no un desglose:
cuenta las rebanadas por lo que se demuestra solo. Una fase de tests o
documentación de otra fase es subtarea de esa rebanada o parte de sus
criterios de aceptación, nunca un issue aparte; el refactor previo es
rebanada solo si entrega algo verificable (tests propios, salida idéntica).
Medido el 2026-09-11: un plan de tres commits salió como tres issues, y el
tercero (tests + README) era la capa final del segundo. Una migración es subtarea del trabajo que
habilita, salvo que entregue algo verificable por sí sola. Los refactors
anchos se secuencian expand → migrate por lotes → contract, cada lote
bloqueado por el expand y el contract por todos los lotes.

Linear no tiene tipos de issue como Jira; la distinción se lleva en
**etiquetas existentes del equipo** (por ejemplo `spike`, `bug`), y solo si
existen. Sin etiqueta equivalente, el carácter va en la primera línea de la
descripción.

### 3. El plan, en el formato del script

```json
{
  "team": "JAR",
  "spec": "docs/specs/login-magico.md",
  "issues": [
    { "ref": "token", "title": "Crear el token de un solo uso", "description": "## Objetivo\n…\n## Criterios de aceptación\n- …",
      "labels": ["fabrica"], "priority": 3, "blockedBy": [],
      "subtasks": [{ "title": "Migración de la tabla de tokens", "description": "…" }] },
    { "ref": "email", "title": "Enviar el enlace mágico por email", "description": "…", "blockedBy": ["token"] }
  ]
}
```

- `ref` es un nombre local para las relaciones; nunca llega a Linear.
- `title` en imperativo (contrato de artefactos).
- `description` con `## Objetivo`, `## Contexto`, `## Alcance`,
  `## Criterios de aceptación`, `## Dependencias`. El script añade solo la
  línea `Spec: docs/specs/<slug>.md` al final.
- `priority`: entero 0–4 (0 sin prioridad, 1 urgente, 2 alta, 3 normal, 4
  baja). Opcional.
- `blockedBy`: refs. El script ordena bloqueadores primero y rechaza ciclos.

Escríbelo en `docs/tickets/<slug>.json`, con el mismo `<slug>` que la spec.
Es el borrador del desglose (contrato de artefactos): viaja en el mismo diff
que la spec, se puede volver a publicar tal cual y, tras publicar, guarda la
clave que recibió cada issue. Si el repo no tiene `docs/`, créalo.

### 4. Quiz al usuario

Presenta el desglose numerado antes de crear nada. Por issue: **título**,
**bloqueado por**, **qué entrega**, **subtareas**. Muestra la descripción
completa de uno para que apruebe el contrato, no solo los títulos.

Pregunta: ¿granularidad? ¿bloqueos reales o solo un orden que habrías
elegido igual? ¿fusionar o partir? ¿etiquetas o prioridad?

**Cada pregunta va abierta, con las opciones y su coste, y con tu
recomendación y el porqué; la elección es del usuario.** Dos fallos
opuestos, ambos medidos: "¿Fusionar 3 en 2? Lo dejé separado porque…"
(2026-09-11) es un trámite, la decisión ya está tomada y "publica" es la
única salida cómoda; "A: dos issues. B: uno. ¿A o B?" a secas (2026-09-12)
descarga el criterio en el usuario, que pidió la recomendación de vuelta.
La forma útil es la de `/grilling`: "A: tres issues (un commit cada uno,
tres cierres en Linear). B: dos issues, con tests y README como subtarea del
segundo. ➡️ B, porque el tercero no se demuestra solo. ¿A o B?". Recomendar
no es decidir: el borrador no cambia hasta que el usuario elige, y si no
elige, la corrida no sigue.

Itera hasta aprobación. Nada llega a Linear antes.

**El quiz corre en Buzz como grill cruzado** (decidido el 2026-09-12): un canal
`slice-<slug corto>` con Codex Grill (GPT) y Andres; Claude Terminal publica el
desglose con las preguntas y sus recomendaciones como brief
(`PLANS/<slug>/brief.md`, con las rutas del borrador y la spec bajo
`REPOS/personal/...` para que las abra), lanza `/grill-me dec` con tope de 2
rondas, defiende cada recomendación y anota lo que cambie; Andres cierra con
`✅` y el veredicto aterriza en `docs/grill/<slug>/` junto al borrador. El quiz
en terminal es el respaldo cuando Buzz o el agente no están disponibles. La
regla no cambia: nada llega a Linear antes del `✅`.

**Quién decide en ese grill**: Claude Terminal decide todas las preguntas del
quiz (granularidad, bloqueos, etiquetas, prioridad derivada de un hecho) y
las que Codex Grill añada; Andres valida el paquete entero con el `✅` y
veta antes lo que quiera. Una pregunta va a Andres con `@Andy` solo si es de
intención de producto (qué se construye, qué se deja fuera). Las preguntas
del brief que Codex Grill no trate quedan con la recomendación de Claude
Terminal y así se listan en el cierre; ninguna queda "pendiente" sin
decisión. Medido el 2026-09-12: dos preguntas sin tratar se le pasaron a
Andres como si fueran de otra naturaleza, y no lo eran.

### 5. Publicar

```
node <dir>/scripts/linear.mjs publish <plan.json> --dry-run   # primero, siempre
node <dir>/scripts/linear.mjs publish <plan.json>
```

El script crea en orden de dependencia, cuelga las subtareas de su padre,
crea las relaciones `blocks` cuando ambos extremos existen, re-lee cada
issue y verifica: cuenta exacta, ninguna en categoría Done, todas las
relaciones presentes. Si se para a mitad, el informe dice qué se creó hasta
ahí y el borrador queda reescrito con esas claves. Para continuar:

```
node <dir>/scripts/linear.mjs publish <plan.json> --resume
```

`--resume` respeta los issues que ya tienen `key` (los resuelve por
identificador, no los recrea) y crea solo los que faltan y sus relaciones.
Sin `--resume`, un borrador con claves se rechaza: volver a publicarlo tal
cual duplica.

## Comandos del tablero

`scripts/linear.mjs` es la **única puerta al tablero** (D7 de
`docs/specs/linear-comentarios-para-humanos.md`): comentar, crear, asignar,
mover y enlazar pasan por aquí. Ningún skill ni prompt escribe GraphQL a
mano; si algo falta, se añade un comando, no una query suelta.

```
node <dir>/scripts/linear.mjs comment <clave> <texto | ->
node <dir>/scripts/linear.mjs create --team <clave|nombre> --title "…" --description <texto | -> \
     [--label L]… [--priority 0-4] [--blocked-by CLAVE]… [--assignee me] [--spec docs/specs/x.md]
node <dir>/scripts/linear.mjs assign <clave> [me]
node <dir>/scripts/linear.mjs move <clave> "<nombre de estado>"
node <dir>/scripts/linear.mjs link <A> blocks <B>
node <dir>/scripts/linear.mjs issue <clave>
```

Todos: ids resueltos en la corrida, JSON en stdout, causa en stderr,
`--dry-run` que renderiza el payload sin escribir.

- **`comment`** devuelve `{ key, commentId, url }`. Con `-` el texto entra por
  stdin: un comentario de varias frases no se escapa a mano. Qué se comenta y
  cuándo lo fija la spec (la regla única: solo si Andy tomaría una decisión
  distinta al leerlo), no este script.
- **`create` y `publish`** salen **1** con la causa en stderr cuando el informe
  vuelve `ok:false` (una relación que no se creó, un issue que aterrizó en
  Done), con el informe entero en stdout: hay issues ya creados y reintentar a
  ciegas los duplica. Un informe impreso no es un informe comprobado.
- **`create`** es azúcar sobre `publish` (D11): construye un plan de un issue
  y lo pasa por el mismo camino, así que hereda backlog, relectura, categoría
  y relaciones. Para un issue derivado en Build, no para desglosar una spec:
  eso es el proceso entero de arriba. `--blocked-by JAR-14` acepta la clave de
  un issue que ya existe.
- **`assign`** solo admite `me` (el dueño de la clave de API). Asignar a otro
  es una decisión de Andy en el tablero.
- **`move`** resuelve el estado por nombre entre los del equipo del issue y
  **rechaza las categorías de cierre** con exit 3 (D8): Done y Canceled los
  pone la PR de Build al mergear, nunca un comando. Ese código lo distingue de
  un nombre de estado mal escrito, que sale 1.
- **`link`** solo crea `blocks` y es idempotente: repetirlo devuelve
  `created: false` sin crear una segunda relación.
- **`issue`** devuelve `{ type, name, pr, title, spec }`; es lo que leen el
  wayfinder (estado y PR) y `build-kickoff` (título y spec).

`publish` asigna cada issue y cada subtarea al viewer (D7) y acepta en
`blockedBy` la clave de un issue externo, resuelto por identificador antes de
la primera escritura.

### 6. Cerrar el hilo en la spec

Con el informe `ok:true`, dos escrituras fuera de Linear y ninguna más:

- En `docs/tickets/<slug>.json`, añade `"key": "JAR-12"` a cada issue (y a
  cada subtarea) con la clave que trae `report.created[].key`. Un borrador
  con claves ya se publicó; uno sin claves aún no salió.
- En el frontmatter de la spec, `issue: null` pasa a
  `issue: [JAR-12, JAR-13, …]` (las claves de primer nivel, no las
  subtareas) y `status: idea` a `status: sliced`.

Reporta las claves con sus aristas de bloqueo y las URLs, para que el usuario
abra el tablero y vea la forma. Termina con el siguiente comando de la
fábrica para la primera clave: `/wayfinder JAR-12`.
