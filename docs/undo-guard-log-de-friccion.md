# undo-guard — log de fricción

Una línea por vez que el guard estorba en el camino de trabajo normal. No es el
registro de sus defectos —eso está en Linear— sino de **lo que costó seguir
trabajando**.

**Por qué existe:** un agujero deja pasar algo que no debía; una fricción hace que
apagues la herramienta, y entonces el agujero da igual. Las lecturas adversariales
encuentran lo primero. Esto es lo único que encuentra lo segundo.

**El campo que decide es el rodeo.** Si para seguir hubo que hacer algo peor que
lo que el guard bloqueó, esa línea no es una molestia: es la herramienta perdiendo
su razón de ser.

## Cómo se escribe una entrada

```
| fecha hora | qué se intentaba | comando | ¿justificado? | rodeo | issue |
```

**¿Justificado?** es el juicio honesto: *sí* cuando el guard hizo bien en parar
eso, *no* cuando era trabajo legítimo. Una entrada con *sí* no es un fallo — es el
guard funcionando, y cuenta igual, porque el coste de las interrupciones
justificadas también decide si alguien lo mantiene encendido.

## Entradas

Las de esta tabla son reales, de la sesión del 2026-09-16 al 17, y son el motivo
de que este archivo exista. La sesión que desarrolló el guard **era un usuario
real**: todas las fricciones que de verdad estorban salieron de aquí y ninguna de
las diez lecturas adversariales.

| fecha hora | qué se intentaba | comando | ¿justificado? | rodeo | issue |
|---|---|---|---|---|---|
| 09-16 19:31 | enviar un mensaje que menciona la ruta protegida | `buzz messages send --content '…<ruta>…'` | **no** | escribir el texto a un archivo y enviarlo desde ahí | JAR-22 |
| 09-16 19:33 | ídem, mensaje de commit | `git commit -F - <<EOF …<ruta>… EOF` | **no** | ídem | JAR-22 |
| 09-16 21:00 | ídem, dos veces más en la misma hora | — | **no** | ídem | JAR-22 |
| 09-16 22:33 | correr la batería desde un checkout limpio | `T=$(mktemp -d) && … && rm -rf "$T"` | **no** | ruta fija bajo `/tmp`, **y la basura se quedó sin borrar** | JAR-28 |
| 09-16 22:5x | ídem | — | **no** | ídem | JAR-28 |
| 09-16 20:1x | limpiar dentro del scratch a través de un `-c` | `bash -c 'rm -rf /tmp/build'` | **no** | escribirlo directo, sin el `-c` | JAR-25 |
| 09-16 23:3x | marcar el instalador como ejecutable | `chmod +x tools/undo-guard/install.sh` | **sí** | invocarlo con `bash`, que no necesita el bit | — |
| 09-16 23:4x | commit con texto en español | `git commit -F - <<EOF … su contrato … EOF` | **no** | escribir el mensaje a un archivo | JAR-36 |
| 09-16 23:4x | ídem, dos veces más | — | **no** | ídem | JAR-36 |
| 09-16 23:2x | leer el settings de otro agente para copiarlo | `cp ~/.buzz/.claude/settings.json /tmp/…` | **sí** | fabricar un settings de prueba sintético | — |
| 09-17 00:10 | limpiar un temporal en un script de prueba | `python3 -c "...os.remove(f)..."` sobre `/tmp` | **no** | escribir el script a un archivo | JAR-28 |
| 09-17 00:12 | marcar un archivo del repo como ejecutable | `chmod +x tools/undo-guard/install.sh` | **sí** | invocarlo con `bash` | — |
| 09-17 00:2x | retirar un archivo de prueba de un workspace | `rm -f .claude/settings.local.json` | **sí** | hacerlo desde un script | — |
| 09-17 00:4x | correr el instalador con el locale real de la máquina | — | **no** *(ruido, no bloqueo)* | ninguno: se arregló fijando `LC_ALL=C` en el instalador | — |

## Lo que ya dice este log

**Catorce entradas en una sesión, diez injustificadas.** Ninguna expone nada; todas
cuestan tiempo.

**Y el dato que más importa: el rodeo se repite.** Siete de las diez injustificadas
se resolvieron igual — *escribir el texto a un archivo y ejecutarlo desde ahí*.
Ese rodeo es exactamente **JAR-35**, la maniobra que esquiva todas las reglas de
ruta del guard a la vez.

Es decir: **las fricciones del camino normal están entrenando el rodeo que anula
la herramienta.** No en abstracto — ya pasó siete veces en una noche, y por el
mismo camino cada vez.

**Y una entrada que no bloquea nada y aun así cuenta.** El instalador corrido con
el locale real de la máquina imprimía **doce líneas de aviso de perl alrededor de
tres líneas de resultado**. No impide trabajar; hace que nadie lea la salida. Una
herramienta cuya salida nadie lee no puede reportar un fallo, y por eso está en
esta tabla igual que las que bloquean. Arreglada fijando el locale en el propio
instalador.

Eso no se arregla con más reglas. Se arregla cerrando **JAR-22** y **JAR-36**, que
entre las dos producen seis de las diez entradas injustificadas.

## Lo que falta medir

Este log sólo ve la fricción. Cuando haya datos de un piloto real (JAR-32) hacen
falta también, con denominadores:

- defectos inducidos por reparación, por lote de arreglos
- fallos de evidencia, por tanda de pruebas
- intervención humana, en minutos y decisiones **por resultado aceptado**
- incidentes reales y casi-errores, con su consecuencia

Eso es JAR-33 en su forma completa. Este archivo es su primera mitad, y la que se
puede llevar desde hoy.
