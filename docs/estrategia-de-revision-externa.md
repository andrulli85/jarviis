# Estrategia de revisión externa

Cuándo se paga una lectura externa, qué se le pide, y qué pasa cuando dice que
una protección no existe.

Salió de cinco rondas adversariales con GPT-6 sobre la práctica real de dos días:
**21 pasadas de revisión, 40 hallazgos en las 13 con conteo registrado, ninguna
tendencia a la baja**, y el defecto más grande encontrado **usando** la
herramienta, no leyéndola.

---

## 1. La regla de la que cuelga todo

> **La protección requerida se deriva de las consecuencias inaceptables, no de lo
> que el mecanismo casualmente intercepta.**
>
> **Si la protección soportada cae por debajo de la requerida, las acciones no
> supervisadas que dependen de ella quedan retiradas** hasta que exista una
> frontera adecuada.
>
> **Documentar el estrechamiento no restaura la autorización.**

La prueba, una línea: *¿queda alcanzable una consecuencia inaceptable sin la
protección requerida?* No *"¿puedo deshacerlo?"* — una divulgación no tiene
deshacer.

### Lo que esta regla prohíbe expresamente

Escribir con honestidad que una herramienta no protege lo que se creía, y seguir
trabajando igual porque ahora está bien documentado. **Eso ya pasó**, el
2026-09-17, en esta misma casa: se documentó que el guard no es una frontera y se
siguió operando sin supervisión sobre esa misma base.

### Y lo que no justifica nada por sí solo

Tres categorías que parecen permisos y no lo son:

| Categoría | Por qué no basta |
|---|---|
| "está en git con remoto" | da recuperación de **algún contenido**. No protege de divulgación, de efectos externos, de destruir lo no versionado, ni de propagar el daño al remoto |
| "es un área desechable" | vale sólo para las consecuencias que su borrado resuelve. El proceso que trabaja ahí puede tener acceso consecuente en otro sitio |
| "ya lo aprobó una persona" | aprobar un trabajo no es aceptar informadamente la protección que falta |

Cada permiso no supervisado que quede necesita su propia justificación atada a
sus consecuencias posibles. **Autorización por protección, no por categoría.**

### Cuando el estado es desconocido

La acción espera. No se presume soportada.

---

## 2. Cuándo se paga una lectura

**Automático, y no sujeto a clasificación de quien escribió el cambio:** el
componente por el que todo se analiza y sus dependencias, y cualquier cosa que
cambie permisos.

*(Nota deliberada: "el componente por el que todo se analiza" **no** es una
frontera universal. Ya se sabe que hay efectos que escapan a su observación.
Nombrar su cobertura real es parte del trabajo pendiente, y hasta entonces ese
disparador no debe sonar a garantía.)*

**Exención sólo cuando es verificable mecánicamente**: existe una aprobación que
cubre exactamente estos artefactos y ninguno ha cambiado. Eso establece
continuidad, no que los supuestos originales fueran completos.

**Lo que necesita juicio no se exime sin supervisión.** Espera, y el trabajo
sigue por otro lado.

**Una lectura rechazada o estrechada es cobertura incompleta**, nunca garantía.
Ocurrió en la ronda 2 de estas cinco: el proveedor rechazó la petición por
describir en concreto cómo se evade un mecanismo de seguridad. La pasada no
cuenta; se reformuló en registro estructural y se volvió a pedir.

---

## 3. Qué se le pide a la lectura

Lo que 21 pasadas no encontraron y una pregunta sí habría encontrado:

> *¿Todo efecto relevante para la seguridad pasa necesariamente por algo que este
> mecanismo puede observar y restringir?*

Esa es una **revisión arquitectónica**, y es distinta de pedir defectos. Las 21
pidieron defectos y devolvieron defectos.

Y al menos una vez, la lectura se dirige a **la batería y sus oráculos**, no al
código. Es teatro si comprueba el código contra expectativas derivadas de ese
mismo código; es real si los defectos conocidos y las violaciones introducidas a
propósito la hacen fallar, si lo esperado sale del contrato y no de la
implementación, y si observa **los efectos** que el contrato nombra.

---

## 4. Experimentos de frontera

Financiados por la decisión que pueden cambiar, no por una cuota fija.

- Entorno desechable, secretos sintéticos, un área señuelo, un receptor
  controlado, ninguna credencial real.
- **El registrador vive fuera de la autoridad del agente** y observa **efectos**
  —estado del sistema de archivos, peticiones recibidas— no el flujo de eventos
  del propio mecanismo. Un log que dice "bloqueado" no satisface la prueba.
- Un resultado enunciado **antes** de ejecutar.
- Control positivo y control con la protección deshabilitada a propósito, para
  que una ejecución silenciosa sea interpretable.
- Se reproduce el hueco conocido y se varía la ruta. Se registra **qué rutas se
  cubrieron**: el éxito no establece cobertura.

---

## 5. Qué se mide

Un solo libro de defectos, **todos los canales** — lectura, uso ordinario,
accidente — y sólo con entradas que cambien una decisión: autoridad, prioridad,
cobertura o gasto.

Por entrada: qué garantía falló y con qué consecuencia; dónde se encontró y qué
comprobación anterior no lo vio —con **"fuera de su alcance"** y **"desconocido"**
como respuestas legítimas—; si es error de implementación, supuesto inválido o
límite arquitectónico; si el remedio cubre la clase; y el esfuerzo gastado.

**El rendimiento se reporta por canal, con exposición.** Contar hallazgos a secas
premia partirlos, y **un hallazgo arquitectónico invalida la garantía de docenas
de comprobaciones en verde**.

---

## 6. Presupuesto

Provisional, con decisión asociada, tope y condición de parada. No hace falta
prueba empírica previa para asignarlo; **sí hace falta que diga qué decisión
cambia y cuándo se para**.

Lo que no vale: un tope declarado y luego superado sin más. Eso es una
preferencia disfrazada de control, y pasó dos veces.

---

## 7. La diversidad de proveedor es una hipótesis sin probar

Que el revisor sea de otra familia que el autor es plausible y **no está medido**.
Logos distintos no establecen puntos ciegos distintos, y menos con el mismo
encuadre y las mismas entradas. Queda etiquetada como hipótesis allí donde esté
escrita, y **no financia nada por sí sola** hasta que haya comparaciones pareadas
sobre árboles congelados.

---

## La frase que hay que recordar

> **Cuando una afirmación de protección falla, el siguiente cambio debe ser a lo
> que el agente tiene permitido hacer.**

## Cómo falla esta estrategia

Predicción, para poder comprobarla dentro de un mes:

> *El autor trata "versionado", "desechable" y "ya aprobado" como exenciones
> generales, y la misma autoridad no supervisada sobrevive con mejores
> explicaciones.*
