# Colmena de Buzz

Reglas comunes de los agentes de Buzz. Cada agente tiene su archivo en `jarviis/agents/` con
frontmatter (`name`, `pubkey`, `rol`, `cuando`) y sus instrucciones propias en el cuerpo;
`npm run agents:sync` genera de ahí la tabla "Quién hace qué" y la copia, junto con este
README, debajo del bloque gestionado de `~/.buzz/AGENTS.md`, que es lo que los agentes
leen en cada turno. Añadir un agente es añadir un archivo y volver a sincronizar.

Para llevar las instrucciones propias de un agente a su system prompt en Buzz Desktop
(owner-reviewed, lo apruebas en la app):

```bash
awk 'f; /^---$/ && ++n == 2 { f = 1 }' agents/honey.md \
  | buzz agents draft-update --channel <uuid-del-canal> --agent-name Honey --system-prompt -
```

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
