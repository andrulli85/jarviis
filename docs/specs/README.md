# specs

Una spec por trabajo, en `docs/specs/<slug>.md`. Es el artefacto que produce
la estación Shape y consume Slice; la PR y la spec van en el mismo diff.

- El `wayfinder` crea aquí el esqueleto cuando la entrada es una idea; es su
  único efecto secundario.
- `/buzz-kickoff docs/specs/<slug>.md` o `/grilling` la interrogan.
- `to-tickets-linear` la rompe en issues; cada issue enlaza a este archivo.
