---
title: "Veredicto: Espejo Conductor ↔ Buzz v1"
tags: [conductor-mirror, grill, implementation-plan]
status: active
created: 2026-09-16
---

# Veredicto — conductor-mirror

## Decisión

Se cierra el grill de diseño para **v1, lectura estricta**. El próximo paso es Shape: escribir la spec y enviarla como PR de documentación para revisión desde el teléfono. Tras su ✅, se parte en tickets y se construye el primer slice. v2 de escritura no forma parte de ese slice.

Secuencia: `docs/specs/conductor-espejo-en-buzz.md` → PR de docs → ✅ de Andy → `/to-tickets-linear docs/specs/conductor-espejo-en-buzz.md` → `/build-kickoff JAR-xx`.

## Fase 1 — Spec de v1

**Objetivo:** convertir el ledger en `docs/specs/conductor-espejo-en-buzz.md` sin añadir capacidad de escribir hacia Conductor.

**Entregable verificable:** PR de docs que describa el contrato, el estado persistente, el despliegue y los criterios de aceptación siguientes:

- `UserPromptSubmit` refleja el `prompt` y `Stop` refleja exclusivamente `last_assistant_message`; no se leen transcripts ni eventos internos. (`D3`)
- La identidad de un acto es `prompt_id`; la marca visible y consultable son sus primeros ocho hex. Dos prompts humanos idénticos permanecen separados. (`D8`, `D12`)
- Hay un canal privado por workspace y el hook solo publica en el `channel_uuid` ya mapeado por `build-kickoff`; nunca crea canales, añade miembros ni usa `--reply-to`. (`D4`, `D6`, `D9`)
- Cada origen persiste `intentado` antes de enviar y se reconcilia por marca, pubkey y tag `h`; una búsqueda negativa del relay medido autoriza un reenvío. (`D7`, `D10`, `D11`)
- La configuración de hook vive en ámbito de proyecto y queda inerte fuera de la instalación autorizada; no se modifica la configuración de usuario de Orca. (`S15`)

**Dependencias:** ninguna de v2. La spec debe conservar `session_id` solo como dato de evaluación futura. (`D1`)

**Riesgos que debe registrar:** credencial del puente expuesta al mismo usuario/proceso que el agente (`D6`); canales muertos archivados a mano (`D9`); búsqueda medida en un relay sin carga (`D11`).

## Fase 2 — Primer slice de implementación

**Objetivo:** hacer operativo el espejo unidireccional para workspaces creados por `build-kickoff`.

**Entregable verificable:** hook y puente que, con una identidad `Conductor Mirror` restringida a canales espejo, publiquen prompts y respuestas finales en el canal del workspace. La implementación no incluye un lector de Buzz, `conductor message create`, flags ocultos ni configuración que escriba hacia Conductor. (`D1`, `D3`, `D6`, `D9`)

**Dependencias:** la spec aprobada; identidad de publicación sin runtime comprobada (`S7`); creación del canal y mapa por `build-kickoff` (`D9`).

**Pruebas de aceptación obligatorias:**

1. Un turno abierto desde la aplicación Conductor —con `--session-mirror`, plugin y stream-json— dispara ambos hooks y conserva `prompt_id`, `prompt`, `cwd` y `last_assistant_message`. Andy autorizó el probe previo a este Build; Claude reportará el resultado. (`D3`, `S15`, `D15`)
2. Dos prompts `ping` idénticos en una misma sesión publican dos actos diferentes. (`D12`)
3. Una caída inyectada tras `accepted:true` y antes de persistir `publicado` se reconcilia al siguiente hook sin duplicar. (`D7`, `D10`, `D11`)
4. Un workspace sin `channel_uuid` no publica; el hook no crea ni modifica membresías. (`D9`)
5. Un turno interrumpido muestra el prompt sin una respuesta inventada. (`D3`)

**Riesgos aceptados:** no hay reproducción controlada de un doble `UserPromptSubmit` para el mismo acto. El puente registra el caso para determinar si conserva el mismo `prompt_id`; si genera otro, es indistinguible de dos actos humanos idénticos y se reflejan ambos. (`S17`)

## Fase 3 — Validación del hábito móvil

**Objetivo:** decidir con uso real si v1 aporta valor desde el teléfono.

**Entregable verificable:** una semana de uso de los canales espejo, con revisión de legibilidad de prefijos de hablante, canales archivados y casos de recuperación. (`D8`, `D9`, `D11`)

**Dependencias:** Fase 2 completada.

**Regla de legibilidad:** `▸ Andy` identifica prompts y `◂ Claude` respuestas; ambos llevan la marca corta de D8. La spec puede cambiar los glifos por equivalentes sin perder las etiquetas. (`D14`)

## Fuera de alcance / follow-up

- **v2, Buzz → Conductor:** solo después de comprobar autenticación cloud, visibilidad de sesiones y correspondencia de `session_id`. (`D1`)
- **Seguridad de v2:** Conductor lanza Claude Code con `bypassPermissions`; cualquier escritura futura requiere una barrera independiente, no una confirmación del agente. (`S16`)
- **Reproducción del doble hook:** se observa e instrumenta; no bloquea v1 porque hoy no hay método para inducirlo. (`S17`)
- **Residuo de prueba:** resuelto; Andy confirmó que retiró `~/conductor/workspaces/jarviis/bangalore/.claude`. (`D15`)

## Validación

Decisiones técnicas: Claude `96c17bfc`. Decisión de producto de privacidad: Andy `df3bc9cf`. Ledger completo: `PLANS/conductor-mirror/ledger.md`.
