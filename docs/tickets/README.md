# tickets

Borradores de issues antes de publicarlos en Linear, en
`docs/tickets/<slug>.json`, uno por spec y con el mismo `<slug>`. Los
escribe `to-tickets-linear` en el formato que consume su script
(`ref`, `title`, `description`, `blockedBy`, `subtasks`), así que un borrador
se puede volver a publicar tal cual.

La fuente de verdad de un issue es su clave de Linear (`JAR-n`), nunca este
archivo. Tras publicar, cada issue del borrador lleva `"key": "JAR-n"`; un
borrador sin claves es uno que aún no salió.
