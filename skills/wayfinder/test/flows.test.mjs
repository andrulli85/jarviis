import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { collectFlows, renderFlows, FLOWS_PATH } from "../scripts/flows.mjs";

/* Un stations.json y un docs/specs de mentira en un directorio temporal:
   ningún test de fixture mira el repo real. */
function fakeFlows({ stations, specs = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "flows-"));
  const stationsPath = join(root, "stations.json");
  writeFileSync(stationsPath, JSON.stringify({ _: "fixture", stations }));
  const specsDir = join(root, "specs"); mkdirSync(specsDir);
  for (const [name, body] of Object.entries(specs)) writeFileSync(join(specsDir, name), body);
  return { stationsPath, specsDir };
}

const station = (n, id, name, extra = {}) => ({ n, id, name, in: id, out: id, entry: [], skills: [], command: `/${id}`, manual: null, provider: null, transitions: [], ...extra });

const TRES = [
  station(1, "a", "A", { entry: ["idea"], transitions: [{ to: "b", command: "/b <x>" }] }),
  station(2, "b", "B", { transitions: [
    { to: "c", command: "/c" },
    { to: "a", when: "falta algo en el plan", command: "/a otra vez", skill: "a-skill" },
  ] }),
  station(3, "c", "C", { transitions: [{ to: "end", command: null }] }),
];

test("tres estaciones y una rama: tres nodos, camino feliz continuo, rama punteada con su when, una fila en ramas", () => {
  const r = collectFlows(fakeFlows({ stations: TRES }));
  assert.deepEqual(r.stations.map((s) => s.id), ["a", "b", "c"]);
  assert.equal(r.transitions.length, 4);
  const md = renderFlows(r);
  const mermaid = md.slice(md.indexOf("```mermaid"), md.indexOf("```", md.indexOf("```mermaid") + 3));
  assert.match(mermaid, /^flowchart LR$/m);
  for (const l of ['a["A"]', 'b["B"]', 'c["C"]']) assert.ok(mermaid.includes(l), `nodo ${l}`);
  assert.match(mermaid, /^\s*a --> b$/m, "camino feliz continuo");
  assert.match(mermaid, /^\s*b --> c$/m);
  assert.match(mermaid, /^\s*b -\.->\|"falta algo en el plan"\| a$/m, "rama punteada con el when");
  assert.doesNotMatch(mermaid, /\bend\b/, "`end` es palabra reservada en Mermaid");
  const ramas = md.slice(md.indexOf("## Ramas"), md.indexOf("## Entradas"));
  const filas = ramas.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Desde") );
  assert.equal(filas.length, 1);
  assert.equal(filas[0], "| B | falta algo en el plan | A | `/a otra vez` | `a-skill` |");
});

test("una transición a algo que no es estación ni end/outside lanza con la estación y el destino", () => {
  const stations = [station(1, "a", "A", { transitions: [{ to: "zeta", command: "/z" }] })];
  assert.throws(() => collectFlows(fakeFlows({ stations })), (e) => /A/.test(e.message) && /zeta/.test(e.message));
});

test("la tabla de entradas sale de entry, una fila por entrada, sin duplicarse como transiciones", () => {
  const stations = [
    station(1, "a", "A", { entry: ["idea", "spec"], transitions: [{ to: "b", command: "/b" }] }),
    station(2, "b", "B", { entry: ["issue"], transitions: [{ to: "end", command: null }] }),
  ];
  const md = renderFlows(collectFlows(fakeFlows({ stations })));
  const entradas = md.slice(md.indexOf("## Entradas"), md.indexOf("## Recorridos"));
  const filas = entradas.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Entrada"));
  assert.deepEqual(filas, ["| idea | A | `/a` |", "| spec | A | `/a` |", "| issue | B | `/b` |"]);
});

test("Recorridos: una fila por spec con issue, con título enlazado, estado, claves, grill y learnings enlazados", () => {
  const specs = {
    "README.md": "# specs\n\nsin frontmatter\n",
    "hecha.md": [
      "---",
      'title: "Script npm run stations: la tabla con su estado real"',
      "status: shipped",
      "date: 2026-09-11",
      "issue: [JAR-5, JAR-8]",
      "grill: docs/grill/npm-run-stations/verdict.md",
      "learnings: [vault/learnings/2026-09-12-uno.md, vault/learnings/2026-09-12-dos.md]",
      "---",
      "",
      "# cuerpo",
    ].join("\n"),
    "idea.md": "---\ntitle: Una idea sin rebanar\nstatus: draft\ndate: 2026-09-12\nissue: null\ngrill: null\n---\n\n# cuerpo\n",
  };
  const r = collectFlows(fakeFlows({ stations: TRES, specs }));
  assert.equal(r.runs.length, 1);
  assert.deepEqual(r.runs[0], {
    file: "hecha.md", title: "Script npm run stations: la tabla con su estado real", status: "shipped",
    issue: ["JAR-5", "JAR-8"], grill: "docs/grill/npm-run-stations/verdict.md",
    learnings: ["vault/learnings/2026-09-12-uno.md", "vault/learnings/2026-09-12-dos.md"],
  });
  const md = renderFlows(r);
  const recorridos = md.slice(md.indexOf("## Recorridos"));
  const filas = recorridos.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Trabajo"));
  assert.equal(filas.length, 1);
  assert.equal(filas[0], "| [Script npm run stations: la tabla con su estado real](specs/hecha.md) | shipped | JAR-5, JAR-8 | [grill](grill/npm-run-stations/verdict.md) | [2026-09-12-uno](vault/learnings/2026-09-12-uno.md), [2026-09-12-dos](vault/learnings/2026-09-12-dos.md) |");
  assert.doesNotMatch(recorridos, /idea sin rebanar/);
});

/* ------------------------------------------------------------- golden --- */

/* El repo real: lo commiteado en docs/flows.md es exactamente lo que genera
   stations.json + docs/specs hoy. Si cambia la fuente sin regenerar, este
   test es el aviso (Q10). */
test("docs/flows.md commiteado coincide byte a byte con lo generado", () => {
  const generado = renderFlows(collectFlows());
  const commiteado = readFileSync(FLOWS_PATH, "utf8");
  assert.equal(commiteado, generado, "docs/flows.md está viejo: npm run flows");
});

test("stations.json real: las cinco estaciones tienen camino feliz y Ship sale de la línea", () => {
  const r = collectFlows();
  for (const s of r.stations) assert.ok(r.transitions.some((t) => t.from === s.id && !t.when), `${s.name} sin camino feliz`);
  assert.ok(r.transitions.some((t) => t.from === "ship" && t.to === "end"));
  assert.ok(r.transitions.filter((t) => t.when).length >= 4, "las ramas de la spec (Q11)");
});
