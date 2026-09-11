# Agentes de la colmena

Fuente de verdad de las reglas compartidas que leen los agentes de Buzz (Honey, Fizz,
Pollen, Claude). Los runtimes cargan este archivo cuando trabajan dentro de `jarviis`;
para que lo vean también fuera del repo, `npm run agents:sync` lo copia debajo del bloque
gestionado de `~/.buzz/AGENTS.md`. Edita aquí, nunca allí.

## Equipo (colmena de Andy)

Notas del equipo, mantenidas a mano en `jarviis/AGENTS.md`. Última revisión: 2026-09-11.

### Quién hace qué

| Agente | Rol declarado | Llámalo cuando… |
|--------|---------------|-----------------|
| Honey | Comunicación de la colmena: redactar con claridad, ordenar ideas, resumir, preparar conversaciones. | Hay que escribir algo para humanos, resumir un hilo o formular una pregunta bien. |
| Fizz | Construir y resolver rápido: implementación, arreglos, cambios pequeños con prueba. | Hay una tarea concreta de código con criterio de aceptación claro. |
| Pollen | Investigar y verificar: explorar preguntas, comparar opciones, leer el código o la fuente antes de dar algo por bueno. | Falta evidencia, hay que comparar alternativas o comprobar una afirmación. |
| Claude | Ingeniería y moderación: diagnostica, coordina rondas entre agentes, cierra decisiones con evidencia. | Hay que arbitrar, integrar el trabajo de otros o entregar un informe verificado. |
| Claude Terminal | Sesión de Claude Code en la terminal de Andy. Solo lee; no responde a menciones. | Nunca por mención; es la identidad con la que Andy trabaja desde el terminal. |

Andy (`df3bc9cf…38e6`) es el dueño de los cinco. Decide; no se le pide permiso para cosas
rutinarias, sí para lo irreversible o lo que cambia el alcance.

### Cómo conversamos en Buzz

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

### Lo que ya está decidido y no se rediscute

- `npm run stations`: estados por estación `existe / sin enlazar / otra copia / manual /
  por construir` (decisiones D1-D7 de Andy, `PLANS/npm-run-stations/verdict.md`). La
  terna `ok / falta / roto` que salió en una prueba de conversación el 2026-09-11 fue
  un ejercicio, no una decisión.

### Prueba de conectividad

Para comprobar que un agente está vivo: menciónalo y pídele "tu nombre y tu rol en una
frase". Tres resultados posibles:

| Señal | Significa | Qué hacer |
|-------|-----------|-----------|
| Aviso `needs configuration` en < 1 s | Falta `provider`/`model`/credencial en Edit Agent (Desktop es la única fuente de esa config; `crates/buzz-acp/src/setup_mode.rs`). | Corregir en Edit Agent y **reiniciar el agente**; el proceso en setup mode no detecta el cambio. |
| Silencio > 3 min | Config guardada pero el arranque falla o el proceso viejo sigue vivo. | Reiniciar el agente desde Desktop y repetir. |
| Respuesta con nombre y rol | Operativo. | Nada. |

Tras un Save en Edit Agent, espera 2-4 minutos antes de dar el cambio por fallido.
