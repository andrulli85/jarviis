# Brief: `npm run stations` — comprobar la instalación de la fábrica de un vistazo

## Historia

Añadir un script `npm run stations` que imprima la tabla de las cinco estaciones con su
estado real (existe / sin enlazar / manual / por construir) sin necesitar una entrada, para
comprobar la instalación de la fábrica de un vistazo.

## Fuente

`docs/specs/anadir-un-script-npm-run.md` en el repo `jarviis` (fábrica personal de software,
`~/personal/claude-toolkit/jarviis`). Esqueleto creado por `/wayfinder` el 2026-09-11.

## Contexto del repo

- `package.json` tiene hoy dos scripts: `test` (node --test sobre `providers/test` y
  `skills/*/test`) y `ask` (`providers/bin/ask.mjs`). Node >= 20, ESM.
- `skills/wayfinder/scripts/route.mjs` ya calcula el estado de cada estación mirando el disco:
  qué skills existen (personales en `~/.claude/skills/<nombre>` y de plugins) y qué proveedores
  responden (claude / codex / openrouter). Pero exige una entrada (idea, spec, issue, PR) y sale
  con código 2 si está vacía.
- `skills/wayfinder/stations.json` es la única fuente de la tabla de estaciones (5 estaciones,
  skills por estación, proveedor por estación).
- Las skills de la fábrica viven en `skills/<nombre>/` y se enlazan con `ln -s` a
  `~/.claude/skills/<nombre>`. Un enlace nuevo no se ve hasta reiniciar la sesión.
- Estados que hoy imprime el wayfinder: `existe`, `manual`, `por construir`, más
  `proveedor: <canal>` o `proveedor no disponible` con causa.

## Ya decidido

- Se invoca como `npm run stations` desde la raíz del repo.
- No recibe entrada: imprime la tabla completa siempre.
- La fuente de la tabla sigue siendo `stations.json`; no se duplica la lista de estaciones.

## Abierto (atacar en el grill)

1. **Dónde vive la lógica.** ¿Se extrae de `route.mjs` la parte que inspecciona el disco como
   función exportada y el script la importa, o el nuevo script es independiente? Dos copias de
   la lógica de estado divergirían en el primer cambio.
2. **El estado "sin enlazar".** No existe hoy. Significa: el directorio `skills/<x>/` está en
   el repo pero `~/.claude/skills/<x>` no apunta a él (o apunta a otro sitio). ¿Lo distingue
   también el wayfinder en su ruta, o es exclusivo de este script? ¿Qué pasa si el enlace existe
   pero apunta a otra copia del skill (p. ej. el toolkit viejo)?
3. **Proveedores.** ¿Muestra también el estado de claude / codex / openrouter por estación, como
   hace el wayfinder, o solo skills? Comprobar proveedores puede tardar (binarios, cuota, clave).
4. **Formato.** ¿Tabla markdown solo, o también `--json` para que un agente lo consuma?
5. **Código de salida.** ¿Sale con != 0 si alguna estación no está `existe`, para usarlo como
   check de instalación en un script, o siempre 0 y el humano lee?
6. **Ubicación del script.** ¿`skills/wayfinder/scripts/stations.mjs` (junto a la lógica) o
   `providers/bin/`/`bin/` (junto a `ask.mjs`, como comando del repo)?
7. **Tests.** El repo corre `node --test`. ¿Qué se prueba: un fixture con enlaces rotos en un
   HOME temporal, o solo el formateo de la tabla?

## Qué debe salir del grill

Un plan: decisiones sobre los 7 puntos, supuestos no confirmados, y qué queda abierto con dueño.
