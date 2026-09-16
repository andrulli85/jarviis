# Colmena de Buzz

Reglas comunes de los agentes de Buzz. Cada agente tiene su archivo en `jarviis/agents/`:
frontmatter (`name`, `pubkey`, `rol`, `cuando`) y, en el cuerpo, **su prompt**. Añadir un
agente es añadir un archivo y volver a sincronizar.

## Cómo llega al agente

`npm run agents:sync` genera de esta carpeta la tabla "Quién hace qué", este README y una
sección "Instrucciones por agente" con el cuerpo de cada uno, y lo escribe debajo del
bloque gestionado de `~/.buzz/AGENTS.md`. Además asegura `~/.buzz/CLAUDE.md` con la línea
`@AGENTS.md`: los agentes con harness Claude Code arrancan con cwd `~/.buzz` y cargan
`CLAUDE.md`, no `AGENTS.md`; sin ese puente solo ven el nido si se les pide leerlo.

Se carga **al arrancar la sesión** del agente (una por canal), no en cada turno. El circuito
completo es:

```bash
vim agents/honey.md && npm run agents:sync   # y reiniciar el agente desde Buzz Desktop
```

Comprobado el 2026-09-11 con Honey: una línea añadida solo en `honey.md` apareció en su
respuesta tras sincronizar y reiniciarla, sin tocar Edit Agent. El campo "Agent
instructions" de Edit Agent puede quedar con la identidad mínima ("You are Honey…"); lo
que se quiera controlar desde git va en el archivo. Si chocan, la sección "Instrucciones
por agente" manda.

Lo demás aprendido ese día: un cambio en Edit Agent exige **Save changes, reabrir para
confirmar que persistió, y reiniciar el agente**. `buzz agents draft-update` solo prellena
el formulario si lo envía el dueño de los agentes; desde otra identidad el relay lo acepta
pero Desktop no lo muestra. Tras reiniciar la app, las menciones de los dos primeros minutos
se pierden. **Respond to** decide a quién contesta cada agente y falla en silencio: con *Only me* ignora
a las demás identidades; con *Selected people* ignora a todo el que no esté en la lista.
Para que la terminal pueda lanzar pruebas, su identidad (`68d8a24b…cb96`, Claude Terminal)
tiene que estar en la lista de cada agente.

Estado al cierre del 2026-09-11: Honey y Pollen responden con el prompt de su archivo y con
Edit Agent vacío. Fizz, con la misma configuración declarada, no respondió a la ronda final;
pendiente comparar su Edit Agent con el de Pollen campo a campo.

Última revisión: 2026-09-11.

Andy (`df3bc9cf…38e6`) es el dueño de todos. Decide; no se le pide permiso para cosas
rutinarias, sí para lo irreversible o lo que cambia el alcance.

## Cómo conversamos en Buzz

1. **Respuestas planas.** Si hay un humano en el canal, responde a la **raíz del hilo**
   (`--reply-to <raíz>`), no al mensaje intermedio que te disparó. Anidar solo en
   subhilos donde únicamente hablan agentes.
2. **Una intervención por ronda.** Cuando alguien abre una ronda ("responded una vez",
   "ronda 1 de 2"), respondes una sola vez y no respondes a otros agentes salvo que la
   pregunta te lo pida. El moderador cierra; nadie reabre.
3. **Formato pedido = formato entregado.** Si piden una línea, es una línea. Si piden
   terna y razón, es terna y razón.
4. **Evidencia con ruta.** Toda afirmación sobre código lleva ruta de archivo y línea,
   y se comprueba en el checkout principal (`~/personal/claude-toolkit/jarviis`) o se
   dice en qué worktree se vio. Un "no existe" sin decir dónde se buscó no vale.
5. **Ceder cuesta poco.** Si el argumento del otro es mejor, dilo y cambia de posición
   en la misma intervención. Ganar la discusión no es el objetivo; decidir bien sí.
6. **Menciones solo para pedir acción.** `@Nombre` dispara una notificación y un turno.
   Nombrar a alguien para hablar *de* él va sin arroba. Nunca publiques un acuse de
   recibo vacío ("ok", "entendido", "confirmado").
7. **Sin bucles.** Dos agentes que se mencionan sin fin no paran solos. Quien abre una
   conversación entre agentes fija un tope de rondas y lo cumple.
8. **Avances a mitad, no solo el final.** Un turno largo publica antes de terminar. La
   prueba, una línea: *¿lleva quien espera más de diez minutos sin nada nuevo que leer?*
   Si la respuesta es sí, publicas un avance antes de seguir — qué va cerrado, qué falta,
   qué sigue. No hace falta que esté todo resuelto; hace falta que se vea el progreso.
   El motivo es de la app: en Buzz el indicador de "escribiendo" queda encendido todo el
   turno, así que un tramo largo de silencio **se ve** y no se distingue de estar colgado.
   Pedido por Andy el 2026-09-16, tras veinte minutos de indicador encendido con el
   trabajo avanzando por dentro y nada publicado.
9. **Si necesitas que un humano toque un archivo, dale el comando.** Nunca prosa del
   tipo "abre X, busca la línea Y y cámbiala por Z". Un bloque copiable que se pega en
   la terminal y ya está. La prueba, una línea: *¿puede ejecutarlo sin abrir un editor
   y sin decidir nada?* Si no, todavía no es un comando.
   El bloque lleva siempre tres cosas: **copia de seguridad** si sobrescribe algo,
   **la operación**, y **una verificación que imprima el resultado** para que se vea
   que salió bien sin tener que mirar el archivo. Si el orden importa, van en el mismo
   bloque y en ese orden, no en pasos sueltos.
   Antes de pasarlo, pruébalo en una copia. Un comando que le rompe un archivo de
   configuración cuesta más que los diez minutos que ahorra.
   Pedido por Andy el 2026-09-16, después de que le pidiera editar a mano un
   `settings.json`.

## Lo que ya está decidido y no se rediscute

- `npm run stations`: estados por estación `existe / sin enlazar / otra copia / manual /
  por construir` (decisiones D1-D7 de Andy, `PLANS/npm-run-stations/verdict.md`). La
  terna `ok / falta / roto` que salió en una prueba de conversación el 2026-09-11 fue
  un ejercicio, no una decisión.

## Prueba de conectividad

Para comprobar que un agente está vivo: menciónalo y pídele "tu nombre y tu rol en una
frase". Tres resultados posibles:

| Señal | Significa | Qué hacer |
|-------|-----------|-----------|
| Aviso `needs configuration` en < 1 s | Falta `provider`/`model`/credencial en Edit Agent (Desktop es la única fuente de esa config; `crates/buzz-acp/src/setup_mode.rs`). | Corregir en Edit Agent y **reiniciar el agente**; el proceso en setup mode no detecta el cambio. |
| Silencio > 3 min | Config guardada pero el arranque falla o el proceso viejo sigue vivo. | Reiniciar el agente desde Desktop y repetir. |
| Respuesta con nombre y rol | Operativo. | Nada. |

Tras un Save en Edit Agent, espera 2-4 minutos antes de dar el cambio por fallido.
