# Autoridad retirada — 2026-09-17

Aplicación de la regla de `docs/estrategia-de-revision-externa.md`. No es una
nota: es la lista de lo que **dejo de hacer sin supervisión desde hoy**.

## La comprobación que la produce

El `undo-guard` no puede mediar efectos que no observa (JAR-35). Así que la
pregunta no es *"¿puedo deshacerlo?"* sino:

> ¿queda alcanzable una consecuencia inaceptable sin la protección requerida?

Las consecuencias inaceptables, escritas primero y sin mirar lo que el mecanismo
intercepta: **perder trabajo no versionado**, **sacar datos de la máquina**,
**dejar la configuración o un guard en un estado que nadie pidió**, y **publicar
hacia fuera algo que no se puede retirar**.

## Retirado desde hoy

| Capacidad | Por qué queda retirada |
|---|---|
| **Ejecutar un script que yo mismo escribo y que toca rutas fuera del área desechable**, sin que un humano lo haya leído | Es exactamente la ruta de JAR-35, y ya la usé sin querer: escribí un instalador cuyo propósito declarado era que lo corriera una persona, lo ejecuté para comprobar que me rechazaba, y me instaló el guard |
| **Cualquier acción cuyo efecto no pueda revertir yo con git**, sin aprobación previa a esa acción concreta | La recuperación por git cubre contenido versionado. No cubre divulgación, ni efectos externos, ni lo no versionado |
| **Mandar datos de la máquina a cualquier destino**, aunque el destino esté en la lista de permitidos | La lista se comprueba sobre el texto del comando, y el texto del comando no es el efecto |

## Lo que sigue autorizado, y por qué cada uno

**No por categoría.** Cada línea con su razón, que es lo que la regla exige:

- **Escribir y leer dentro de `/tmp`, `/var/folders` y `.scratch/`** — la
  consecuencia inaceptable que su borrado no resuelve no existe: ahí no vive nada
  que alguien vaya a echar de menos.
- **Commits y ramas en repositorios con remoto** — la consecuencia es perder
  trabajo versionado, y el remoto la resuelve. *No* cubre publicar algo dañino:
  eso está en la tabla de arriba.
- **Abrir y mergear PRs**, por autorización explícita de Andy del 2026-09-16, que
  es aceptación informada de ese permiso concreto y no de una categoría.
- **Escribir en Linear y en Buzz** — reversible por mí y visible para él.

## Qué restaura lo retirado

**No lo restaura documentarlo mejor.** Sólo una de estas tres:

1. **Una frontera del sistema operativo**: la copia activa y las rutas protegidas
   propiedad de otra cuenta, de sólo lectura. Cierra la clase entera.
2. **Un experimento de frontera** que demuestre, con el registrador fuera de mi
   autoridad, que la ruta concreta está mediada. Restaura **esa ruta**, no la
   categoría.
3. **Aprobación explícita de Andy para esa acción concreta**, sabiendo qué
   protección falta. No vale una aprobación de la tarea que la contiene.

## Cuando no se sabe

**La acción espera.** El estado desconocido no se presume soportado, y no se
resuelve razonando que probablemente esté bien.

## Cómo se comprueba que esto no es papel

Dentro de un mes, la pregunta no es si este archivo existe. Es: **¿hay alguna
acción de la tabla de arriba que haya hecho igualmente?** Si la hay, la retirada
fue ceremonia y la predicción de fallo de la estrategia se cumplió.
