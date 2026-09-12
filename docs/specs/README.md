# specs

Una spec por trabajo, en `docs/specs/<slug>.md`. Es el artefacto que produce
la estación Shape y consume Slice; la PR y la spec van en el mismo diff.

- El `wayfinder` crea aquí el esqueleto cuando la entrada es una idea; es su
  único efecto secundario.
- `/buzz-kickoff docs/specs/<slug>.md` o `/grilling` la interrogan.
- `to-tickets-linear` la rompe en issues; cada issue enlaza a este archivo.
- `/learnings`, al cerrar el último issue, deja `learnings:` con las entradas
  del vault que salieron del trabajo (rutas desde la raíz del vault, con el
  prefijo `vault/`) y pasa `status` a `shipped`. Los learnings viven en el
  vault porque son reglas que cruzan proyectos; la spec solo apunta.
