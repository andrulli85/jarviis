# Flujos de la fábrica

Generado por `npm run flows` desde `skills/wayfinder/stations.json`; no se edita a mano.

```mermaid
flowchart LR
  shape["Shape"]
  slice["Slice"]
  build["Build"]
  review["Review"]
  ship["Ship / Learn"]
  fin(["fin"])
  fuera(["no aterriza"])
  shape --> slice
  shape -.->|"la historia es del plano de trabajo (tracker corporativo, ~/work/, nombres de empresa)"| fuera
  slice --> build
  build --> review
  build -.->|"el issue destapa un bloqueador que no está en el plan"| slice
  build -.->|"una PR cierra varios issues de la misma spec"| review
  review --> ship
  review -.->|"no hay reviewer de la otra familia (cuota, binario)"| ship
  ship --> fin
```

## Ramas

| Desde | Cuándo | Adónde | Comando | Skill |
|---|---|---|---|---|
| Shape | la historia es del plano de trabajo (tracker corporativo, ~/work/, nombres de empresa) | *(no aterriza)* | `/buzz-kickoff <spec> (los artefactos quedan en el agente y se aterrizan desde el otro plano)` | `buzz-kickoff` |
| Build | el issue destapa un bloqueador que no está en el plan | Slice | `/to-tickets-linear <equipo> (un issue que bloquea al actual; luego Build sobre el nuevo)` | `to-tickets-linear` |
| Build | una PR cierra varios issues de la misma spec | Review | `gh pr create --base main (Closes <clave> por cada issue, sin rama nueva)` | `build-kickoff` |
| Review | no hay reviewer de la otra familia (cuota, binario) | Ship / Learn | `/learnings <key> (con deuda: anotar el rango sin revisar)` | `adversarial-review` |

## Entradas

| Entrada | Estación | Comando |
|---|---|---|
| idea | Shape | `/buzz-kickoff <spec>` |
| spec | Slice | `/to-tickets-linear <spec>` |
| issue | Build | `/build-kickoff <key>` |
| pr | Review | `/adversarial-review` |
| merged | Ship / Learn | `/learnings <key>` |

## Recorridos

| Trabajo | Estado | Issues | Grill | Learnings |
|---|---|---|---|---|
| [Script npm run stations que imprime la tabla de estaciones con su estado real](specs/anadir-un-script-npm-run.md) | shipped | JAR-5, JAR-8, JAR-6, JAR-7 | [grill](grill/npm-run-stations/verdict.md) | [2026-09-12-npm-11-no-longer-prints-npm-error-on-script-exit](vault/learnings/2026-09-12-npm-11-no-longer-prints-npm-error-on-script-exit.md) |

