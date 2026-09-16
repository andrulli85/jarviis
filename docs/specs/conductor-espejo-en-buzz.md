---
title: "Espejo Conductor → Buzz: leer desde el teléfono lo que pasa en un workspace"
status: draft
date: 2026-09-16
grill: docs/grill/conductor-mirror/verdict.md
---

# Espejo Conductor → Buzz

Conductor abre un workspace por issue y corre Claude Code dentro. Mientras eso pasa, el
único sitio donde se ve el trabajo es la pantalla del portátil: si Andy sale de casa, la
sesión sigue avanzando y él se entera al volver. Linear ya recibe los tres momentos que
deciden algo (`docs/specs/linear-comentarios-para-humanos.md`), pero la conversación misma
—lo que él pidió y lo que el agente contestó— no sale de la máquina.

Esta spec fija **v1: un espejo de solo lectura** que copia cada turno humano a un canal
privado de Buzz, uno por workspace. No hay ruta de vuelta.

**El principio que decide todo lo demás: el puente es espejo, no participante.** Nunca
razona, nunca resume, nunca decide qué es importante; transporta y marca el origen. La
prueba para saber si algo cruza: *¿lo leerías desde el teléfono?* Si para explicar un
mensaje hay que describir el formato interno de una herramienta, no cruza.

Shape: grill de diseño en el canal `conductor-mirror` de Buzz (Claude ↔ Codex Grill, 15
preguntas, del 2026-09-12 al 2026-09-16); ledger y veredicto en
[`docs/grill/conductor-mirror/`](../grill/conductor-mirror/verdict.md). La evidencia de
máquina que se cita aquí está en `~/.buzz/RESEARCH/HOOKS_AMBITO_PROYECTO_Y_PAYLOADS.md`.

## Decisiones

| D | Decisión | Origen |
|---|---|---|
| D1 | **v1 es lectura estricta.** No existe código, flag ni configuración que escriba hacia Conductor. Se guarda el `session_id` que el hook regala, porque v2 lo necesitaría; nada más | Q1 |
| D2 | La identidad del workspace es `realpath(cwd)` del hook. Un workspace recreado es una vida nueva y estrena canal | Q2 |
| D3 | **Contrato visible de un turno:** `UserPromptSubmit` publica el `prompt` literal de inmediato; `Stop` publica solo `last_assistant_message` de su propio payload. No se abre ni se parsea el transcript. No cruzan `SubagentStop`, eventos del SDK, `tool_use`, `tool_result`, estados ni coste. Un turno interrumpido queda como prompt sin respuesta, que es información correcta | Q3 |
| D4 | El texto literal solo va a un canal **privado** cuyos miembros son Andy y la identidad del puente. Nunca al canal compartido | Q4 (Andy) |
| D6 | El puente firma como identidad Nostr propia, `Conductor Mirror`, miembro solo de los canales espejo. Su clave vive en un archivo `0600` fuera de repositorios, `settings.json`, variables de Conductor y transcripts. No se promete que el agente no pueda leerla —comparten usuario y proceso—: se elige por radio de daño, porque esa identidad solo escribe en canales espejo y se revoca sacándola de ellos | Q6 |
| D7 | **A lo sumo una vez.** Antes de enviar se persiste la marca como `intentado`; con `accepted:true` pasa a `publicado`. Un `intentado` sin confirmar se reconcilia en la siguiente invocación preguntando al relay. Sin demonio: el hook es lo único que corre | Q7 |
| D8 | La marca de origen es visible, de 8 hex, al final de la línea de hablante. El comentario HTML se descartó: Buzz móvil lo muestra crudo | Q8 |
| D9 | **Un canal privado por workspace.** `build-kickoff` lo crea con la identidad de Andy al abrir el workspace y guarda `realpath(cwd) → channel_uuid`. El hook solo publica en ese destino: no crea canales, no añade miembros, no usa `--reply-to`. Un workspace abierto a mano no tiene destino y no publica | Q9 |
| D10 | La reconciliación es una pregunta directa, no un recorrido: `buzz messages search --query <marca> --author <pubkey del puente> --since <t-60>`, aceptando el resultado cuyo tag `h` sea el canal del workspace | Q10 |
| D11 | En el relay medido, una búsqueda negativa autoriza enviar en esa misma invocación: la sonda apareció dentro del mismo segundo de publicarse. Se acepta con dos límites escritos: un solo relay, sin carga, canal de treinta mensajes | Q11 |
| D12 | **La identidad de un acto humano es `prompt_id`**, el UUID que Claude Code entrega en `UserPromptSubmit`; sus primeros ocho hex son la marca de D8. Dos prompts idénticos en la misma sesión reciben ids distintos, así que un reenvío humano no se funde con el anterior. Sin hash de texto, sin ventana temporal, sin transcript | Q12 |
| D14 | Cada prompt lleva el prefijo `▸ Andy` y cada respuesta `◂ Claude`, seguidos de la marca. Una sola identidad firma ambos; el prefijo es lo que dice quién habló | cierre |
| D16 | **El hook publica solo si `$CONDUCTOR_SESSION_ID` es igual al `session_id` del payload.** Las sub-sesiones headless que corren con el mismo `cwd` —los evals de las skills— leen el mismo `settings.json` y heredan las variables de Conductor, así que su presencia no distingue nada. Lo que distingue es la igualdad | Q15, medido |
| D17 | El hook se declara en `.claude/settings.json` **del repositorio**, versionado. No se toca `~/.claude/settings.json`: los ámbitos de usuario y de proyecto se suman, y Conductor arranca con `--setting-sources=user,project,local` | Q14, S15 |

## Contrato del hook

Dos eventos, un solo script, ninguna lectura de disco ajeno.

**`UserPromptSubmit`** publica:

```
▸ Andy · a10a5729
Commit and push all changes
```

**`Stop`** publica:

```
◂ Claude · a10a5729
Desarrollado y arreglado. No era el wayfinder: era el precio de estrenar un ejecutable.
…
```

La marca `a10a5729` son los primeros ocho hex del `prompt_id`, y es **la misma en los dos
mensajes**, porque ambos payloads traen ese campo: así prompt y respuesta quedan
correlacionados sin guardar estado. Eso tiene una consecuencia que la implementación no puede
ignorar: la reconciliación de D10 no puede conformarse con "encontré la marca", porque la
encontraría también en el mensaje del otro rol. Busca por marca y acepta el resultado cuyo
contenido empiece por el prefijo de ese rol (`▸` o `◂`). Es el único punto donde el formato
visible es además dato de máquina, y por eso D14 exige conservar ambas etiquetas si alguien
cambia los glifos.

Campos del payload que v1 usa, todos observados bajo la app Conductor:

| Campo | Evento | Para qué |
|---|---|---|
| `prompt` | `UserPromptSubmit` | el contenido del mensaje |
| `last_assistant_message` | `Stop` | el contenido del mensaje |
| `prompt_id` | ambos | identidad del acto y marca de D8/D12 |
| `cwd` | ambos | destino, vía el mapa de D9 |
| `session_id` | ambos | filtro de D16 y dato guardado para v2 (D1) |

El hook **no publica, y escribe el motivo en su log local**, cuando falta `prompt` o `cwd`,
cuando el `cwd` no tiene canal en el mapa, o cuando `$CONDUCTOR_SESSION_ID` no coincide con el
`session_id` (D16). Un silencio explicado no es un fallo; un mensaje inventado sí.

## Estado persistente

Un directorio fuera del repositorio, `~/.local/state/conductor-mirror/`:

- `workspaces.json` — `realpath(cwd) → channel_uuid`, escrito por `build-kickoff` (D9).
- `intentos/<marca>-<rol>.json` — `{ estado: intentado | publicado, prompt_id, session_id, canal, event_id? }` (D7).

La clave del puente vive aparte, en un archivo `0600` que solo el hook lee (D6).

## Instalación

El hook se declara en `.claude/settings.json` del repositorio, así que aparece en todos los
worktrees —incluidos los que se abran a mano— sin tocar la configuración de usuario, que
gestiona otra herramienta. A cambio, el hook viaja con el repositorio: **debe salir con 0 sin
hacer nada** si no encuentra el binario `buzz`, si falta el archivo de clave o si no hay mapa.
Quien clone el repositorio en otra máquina no debe notar que existe.

## Rebanadas

### 1. El hook publica un turno (D3, D8, D12, D14, D16, D17)

El script del puente y su declaración en `.claude/settings.json`; el mapa se lee, no se escribe.

Criterios:

- Un prompt en un workspace con canal mapeado aparece en ese canal como `▸ Andy · <8 hex>` con
  el texto literal; al terminar el turno aparece `◂ Claude · <los mismos 8 hex>` con
  `last_assistant_message` íntegro, saltos de línea y Markdown incluidos.
- Una sub-sesión headless lanzada con el mismo `cwd` —por ejemplo los evals de una skill— **no
  publica nada**, y deja en el log la razón `session_id != CONDUCTOR_SESSION_ID`.
- Sin `buzz` en el PATH, sin archivo de clave o sin entrada en el mapa, el hook sale con 0 y no
  escribe en el canal.
- El hook nunca abre el archivo de `transcript_path`.

### 2. Reconciliación tras una caída (D7, D10, D11) — bloqueada por 1

Criterios:

- Inyectando una muerte del proceso **entre** el `accepted:true` del relay y la escritura de
  `publicado`, la siguiente invocación del hook encuentra la marca por búsqueda, la pasa a
  publicada y **no publica un segundo mensaje**.
- Con el relay inaccesible, el intento permanece `intentado` y no se reenvía.
- Una búsqueda que solo devuelve la marca del rol contrario (`◂` cuando se busca `▸`) no cuenta
  como encontrada.

### 3. `build-kickoff` aprovisiona el canal (D9) — independiente de 1 y 2

Al abrir un workspace por deep link, y con la identidad de Andy: crear el canal privado del
workspace, añadir a `Conductor Mirror` y escribir `realpath(cwd) → channel_uuid` en el mapa.

Criterios:

- Abrir un workspace deja canal creado y entrada en el mapa; abrirlo dos veces no crea dos
  canales.
- El canal tiene exactamente dos miembros.
- Un workspace abierto a mano no crea nada, y el hook de la rebanada 1 no publica desde él.

## Fuera de alcance

- **Escribir desde Buzz hacia Conductor (v2).** Follow-up con condición de entrada propia:
  autenticación de la nube de Conductor, visibilidad de las sesiones locales desde su API, y
  una barrera de autorización independiente —porque Conductor arranca sus sesiones con
  `--permission-mode bypassPermissions` y no va a preguntar nada (S16).
- Reflejar pasos intermedios de un turno: herramientas, estados, coste, subagentes.
- Archivar solos los canales de workspaces muertos: se hace a mano.
- Cualquier lectura de `conductor.db`.

## Riesgos que v1 asume, con los ojos abiertos

- **La búsqueda del relay se midió una vez y sin carga** (D11). Si el índice se retrasara, la
  reconciliación podría duplicar un mensaje. La rebanada 2 mide el caso real.
- **Un doble disparo de `UserPromptSubmit`** para un mismo acto no se ha podido provocar. Si
  ocurre y Claude Code conserva el `prompt_id`, D7 lo trata como duplicado de transporte; si lo
  cambiara, el puente no puede distinguirlo de dos prompts humanos idénticos y refleja los dos,
  según D12 (S17).
- **La clave del puente es legible por el agente** que corre en la misma máquina y con el mismo
  usuario (D6). El límite no es el secreto: es que esa identidad solo alcanza a los canales
  espejo.
- **`CONDUCTOR_WORKSPACE_ID`** parece mejor clave de mapa que la ruta, pero no se ha observado
  su ciclo de vida ante un renombre real; v1 sigue con `realpath(cwd)` (D2, S19).
