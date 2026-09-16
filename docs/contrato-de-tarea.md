# El contrato de tarea

Se escribe **antes** de empezar, no al terminar. Cinco campos:

```
## Contrato — <tarea>

**Hecho es:**        <evidencia del comportamiento acordado, comprobable por otro>
**Puedo sin pedir:** <frontera de acciones>
**Te pregunto si:**  <excepciones que exigen una decisión humana>
**Si no estás:**     <qué hago mientras no respondes>
**Tope:**            <presupuesto> → al agotarse, parar y entregar el estado
```

Corto es mejor, pero **la longitud no es la regla**: una tarea pequeña puede
tener permisos complicados y merece escribirlos.

## Por qué existe

De una sesión de dos días el 2026-09-16 donde un agente produjo trabajo bueno y
consumió a la persona entera. Un lector externo lo resumió así:

> *"One human cannot remain the factory's scheduler, permission system,
> acceptance oracle, and cleanup crew."*

El contrato decide esas cuatro funciones una vez al principio, en vez de veinte
veces por el camino.

---

## Hecho es

Lo que alguien puede **comprobar** para saber que la tarea terminó, sin volver a
hacerla.

Una batería en verde **sí es evidencia** cuando prueba el comportamiento que se
acordó. Deja de serlo cuando prueba otra cosa, o cuando se presenta como prueba
de algo que no mide:

| Encuadre equivocado | Lo que de verdad establece |
|---|---|
| "la batería pasa, luego está listo" | que el código hace lo que **esa batería** dice, nada más |
| "corre desde `origin/main`" | contexto de integración, **no** corrección |
| "el gate abrió" | que se siguieron los pasos |

Los tres son útiles y ninguno es suficiente solo. El campo se escribe nombrando
**el comportamiento**, no el procedimiento: *"los cuatro comandos del issue
devuelven exit 2 y los ocho controles siguen en 0"* dice algo; *"los tests
pasan"* no.

**Y el permiso que hace que sirva de algo:** cuando la evidencia de este campo
existe, **el agente declara la tarea terminada por su cuenta**. No la somete a
revisión. Un criterio de completado sin permiso de usarlo es una pregunta más.

## Puedo sin pedir

Una **frontera de acciones**, no una adivinanza sobre cuántas respuestas tiene
una decisión. Casi toda decisión de implementación tiene varias razonables, y
usar eso como criterio convierte el juicio ordinario en interrupciones.

Lo que decide es otra cosa:

1. **¿Está dentro del alcance autorizado?**
2. **¿Cuál es la consecuencia si sale mal?**
3. **¿Es reversible, y por quién?**

Dentro del alcance + consecuencia acotada + reversible → se hace y se anota.

## Te pregunto si

Las excepciones, escritas con avaricia: cada una es una interrupción futura.

**Acciones consecuentes, que necesitan autoridad explícita aunque parezcan
rutina**: mergear, desplegar, gastar dinero, escribir a otras personas. Que git
pueda revertir un commit **no hace reversibles sus consecuencias** — un merge que
alguien ya usó, un correo que alguien ya leyó.

Siempre presentes: publicar con defectos conocidos, saltarse un control, algo
irreversible fuera de git, algo que cambie el alcance acordado.

## Si no estás

El campo que faltaba y sin el cual los demás no aguantan una ausencia larga.

1. **Sigo con el trabajo autorizado que no depende de la respuesta.**
2. **Cuando se acaba ese trabajo, paro en un punto seguro** y entrego el estado.
3. **Nunca asumo la respuesta.** Una pregunta sin contestar no se convierte en un
   sí por llevar dos horas abierta.

## Tope

Un número —rondas, llamadas a modelos externos, tiempo—, no "hasta que salga
bien".

**El tope no predetermina el resultado.** No dice que al agotarse la tarea esté
entregada ni fallida: dice **cómo se para y qué se entrega**. Cuatro estados
terminales, y sólo estos cuatro:

| Estado | Cuándo | Qué se entrega |
|---|---|---|
| **Entregado** | la evidencia de *hecho es* existe | dónde mirarla |
| **Parado, incompleto** | se agotó el tope con trabajo útil sin terminar, sin bloqueo ni decisión pendiente | qué está guardado y dónde, qué falta, qué está verificado y qué no, **quién puede reanudarlo** |
| **Esperando** | falta **una** decisión concreta | la pregunta, las opciones y una recomendación |
| **Bloqueado** | algo externo impide seguir | qué es y qué se intentó |

"Sigo trabajando" no es un estado terminal. Una lista de pendientes sin dueño,
tampoco.

**Parado incompleto** es el que más se omite y el que más falta hace: el
presupuesto se acaba a mitad de algo útil mucho más a menudo de lo que aparece un
bloqueo limpio.

---

## Cómo se cierra

El informe final responde a los campos en orden y **nombra uno de los cuatro
estados**. Si *hecho es* no se cumple, el estado es *parado*, *esperando* o
*bloqueado* — nunca "entregado con matices".

Esa comprobación contra el contrato es obligatoria. Sin ella, esto es un
documento que se escribe y se ignora, que es el destino por defecto de los
documentos como éste.

## El antipatrón, con fecha

El 2026-09-16 a las 21:09 se fijó un contrato AFK con tres campos: qué se haría
sin la persona, qué no, y cuándo parar. Faltaban *hecho es* y *si no estás*.

El trabajo se hizo y al final el agente preguntó qué hacer — y la pregunta llegó
a alguien que estaba ausente precisamente porque el contrato existía para no
molestarle.

**Matiz honesto:** añadir *hecho es* no lo habría evitado por sí solo. Hacía falta
además el permiso explícito de **declarar el trabajo terminado sin someterlo a
revisión** cuando esa evidencia existe. El criterio sin el permiso es una pregunta
con otro nombre, y ése fue el fallo real.
