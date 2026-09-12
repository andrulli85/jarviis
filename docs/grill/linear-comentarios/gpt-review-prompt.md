Eres un revisor externo (GPT-5.6) de una propuesta de proceso. Responde en español, sin rodeos, máximo 40 líneas. No propongas herramientas nuevas; evalúa la propuesta tal cual y di qué cambiarías.

## Contexto
Una "fábrica personal de software" de una sola persona (Andy) con agentes de IA que hacen el trabajo. Línea: idea → grill (interrogatorio) → spec en el repo → issues en Linear (JAR-n) → un workspace de Conductor por issue, donde un agente de Claude Code implementa y abre la PR → review → merge (Linear cierra el issue solo). Todo el "por qué" vive en el repo: spec, veredicto del grill, PR, commits, learnings en un vault. En Linear solo cambia el estado de la card (Backlog/In Progress/In Review/Done) y aparece la PR enlazada. Andy mira Linear desde el teléfono; el repo lo miran los agentes. Síntomas recientes: apareció un issue nuevo (JAR-8) creado por un agente en mitad de otro y Andy no supo por qué hasta preguntar; dos issues pasaron a Done sin código porque una PR de documentación los nombró en el título.

## Propuesta de Claude (a evaluar)
Comentar en las cards de Linear, escrito para un humano y sin tecnicismos, en exactamente tres momentos por card:
1. Arranque: una línea. "Empiezo. Workspace abierto, rama X. Plan: A primero, B al final."
2. Algo que cambia el plan (no progreso): una decisión, una sorpresa, un bloqueo. "Encontré que X falla desde worktrees; abrí JAR-8 que bloquea a este. Sigo cuando se mergee." Dos o tres frases, el porqué en palabras, enlace a la spec o veredicto si hay detalle.
3. Cierre: el resultado en lenguaje de usuario, no de código. "Listo: `npm run stations -- --check` ya sale rojo si Codex no tiene cuota. PR #20. Aprendizaje: ..."
Prohibido: progreso ("3 de 5 tests"), logs, lo que ya dice la PR o el commit, preguntas técnicas.
Quién: el agente de Build en esos tres momentos, mediante un comando único (`linear.mjs comment`) para que el formato sea uno; Claude Terminal comenta en Slice al publicar el desglose y en Ship si hay learning.
Tono: el mensaje que le dejarías a un colega en Slack al salir, no una entrada de changelog.

## Lo que quiero de ti
1. ¿Tiene sentido comentar en Linear en este montaje, o es duplicación? Argumenta desde el lector (Andy en el teléfono) y desde el coste (agentes escribiendo prosa).
2. Por cada uno de los tres momentos: ¿lo mantienes, lo quitas o lo cambias? Di por qué en una frase.
3. ¿Qué caso real rompe la regla "no progreso"? (p. ej. un issue que dura tres días)
4. ¿Qué falta que sí leerías desde el teléfono y la propuesta no cubre?
5. Un riesgo concreto de que esto degenere en ruido, y la regla de una línea que lo evita.
Termina con "VEREDICTO:" y una de: ADOPTAR TAL CUAL / ADOPTAR CON CAMBIOS (lista) / NO ADOPTAR.
