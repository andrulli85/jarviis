# Revisión de GPT-5.6 (codex exec, xhigh) de la propuesta de comentarios en Linear

2026-09-12. Prompt en `gpt-review-prompt.md`. Respuesta literal:

> Tiene sentido: Linear no debe duplicar el repo, pero sí resumir el estado operativo que Andy necesita entender desde el teléfono: intención, cambio de rumbo y resultado. El coste de tres mensajes breves por card es razonable si sustituyen investigación posterior; no lo es si repiten PRs.
>
> 1. Arranque: cambiarlo. Mantendría alcance y plan, pero quitaría workspace y rama: no ayudan a Andy en el teléfono.
> 2. Cambio de plan: mantenerlo. Es el mensaje más valioso, especialmente si abre un JAR nuevo, bloquea, o redefine alcance.
> 3. Cierre: cambiarlo. Debe decir resultado, PR y si el issue quedó correctamente cerrado; no asumir que "Done" prueba que hubo implementación.
>
> La regla "no progreso" se rompe en un issue bloqueado o en ejecución durante tres días: el silencio parece abandono. Excepción: un aviso breve cada 24 h hábiles de bloqueo, indicando qué se espera y cuándo se reevaluará.
>
> Falta algo crucial: un aviso explícito de "este issue nació por X y bloquea/depende de Y", con enlace y relación visible. JAR-8 no debió ser una sorpresa. También falta blindar el cierre automático: una PR de documentación no debería mencionar un JAR de forma que lo cierre.
>
> Riesgo de ruido: agentes convierten cada microdecisión en "cambio de plan". Regla: "Solo comenta si Andy tomaría una decisión distinta al leerlo."
>
> VEREDICTO: ADOPTAR CON CAMBIOS
> - Arranque orientado a alcance, sin rama/workspace.
> - Excepción de seguimiento para bloqueos de más de 24 h hábiles.
> - Aviso obligatorio al crear un issue derivado, con causa y dependencia.
> - Cierre solo validado contra una PR con cambio funcional; evitar referencias que cierren cards desde PRs documentales.

## Qué se adoptó (Claude Terminal, validado por Andy)

Todo salvo el temporizador de 24 h: un agente sin sesión viva no puede cumplirlo. En su lugar,
comentario al bloquearse (qué espera, qué desbloquea) y otro al retomar. La regla anti-ruido de
GPT pasa a ser la regla única (D1 de la spec).
