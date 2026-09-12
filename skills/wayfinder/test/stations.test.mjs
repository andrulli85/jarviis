import { test } from "node:test";
import assert from "node:assert/strict";
import { collectStations, failures, renderStations } from "../scripts/stations.mjs";
import { stationRow } from "../scripts/route.mjs";
import { fakeWorld } from "./helpers.mjs";

const ALL = ["buzz-kickoff", "grilling", "to-tickets-linear", "build-kickoff", "tdd", "git-conventions", "adversarial-review", "code-review", "learnings"];

test("todo enlazado a la fábrica: cinco estaciones en existe y sin fallos", () => {
  const w = fakeWorld({ linked: ALL });
  const r = collectStations(w);
  assert.deepEqual(r.stations.map((s) => s.id), ["shape", "slice", "build", "review", "ship"]);
  assert.deepEqual(r.stations.map((s) => s.status), ["existe", "existe", "existe", "existe", "existe"]);
  assert.equal(r.cwd, w.cwd);
  assert.deepEqual(r.providers, w.providers);
  assert.deepEqual(failures(r), []);
});

test("una sin enlazar, una en otra copia y una por construir: estados, tres fallos y los ln en Arreglos", () => {
  const rest = ALL.filter((s) => !["grilling", "build-kickoff", "learnings"].includes(s));
  const w = fakeWorld({ linked: rest, factory: ["grilling", "build-kickoff"], elsewhere: ["build-kickoff"] });
  const r = collectStations(w);
  const by = Object.fromEntries(r.stations.map((s) => [s.id, s.status]));
  assert.deepEqual(by, { shape: "sin enlazar", slice: "existe", build: "otra copia", review: "existe", ship: "por construir" });
  const f = failures(r);
  assert.equal(f.length, 3);
  assert.ok(f.some((x) => /grilling.*sin enlazar/.test(x)));
  assert.ok(f.some((x) => /build-kickoff.*otra copia/.test(x)));
  assert.ok(f.some((x) => /learnings.*por construir/.test(x)));
  const md = renderStations(r);
  const arreglos = md.slice(md.indexOf("Arreglos"));
  assert.match(arreglos, /`ln -s .*factory\/grilling .*skills\/grilling`/);
  assert.match(arreglos, /`ln -sfn .*factory\/build-kickoff .*skills\/build-kickoff`/);
  assert.doesNotMatch(arreglos, /learnings/, "por construir no tiene arreglo con ln");
});

test("sin codex y sin autor: Review muestra ambas familias con codex ✗, el pie lo dice y es un fallo", () => {
  const w = fakeWorld({ linked: ALL, providers: { claude: "/b/claude", codex: null, openrouter: null, author: null } });
  const r = collectStations(w);
  const md = renderStations(r);
  const review = md.split("\n").find((l) => l.startsWith("| 4 |"));
  assert.match(review, /opuesta al autor: claude ✓ · codex ✗/);
  assert.match(md, /^Proveedores: claude \/b\/claude · codex — · openrouter — · autor —$/m);
  const f = failures(r);
  assert.equal(f.length, 1);
  assert.match(f[0], /Review.*codex/);
});

test("sin codex con autor claude: Review no tiene opuesto disponible y es un fallo", () => {
  const w = fakeWorld({ linked: ALL, providers: { claude: "/b/claude", codex: null, openrouter: "clave presente", author: { family: "claude", how: "t" } } });
  const r = collectStations(w);
  assert.match(renderStations(r), /^Proveedores: claude \/b\/claude · codex — · openrouter clave presente · autor claude$/m);
  const f = failures(r);
  assert.equal(f.length, 1);
  assert.match(f[0], /Review.*hace falta codex/);
});

test("renderStations es la tabla del wayfinder sin Siguiente paso", () => {
  const w = fakeWorld({ linked: ALL });
  const r = collectStations(w);
  const md = renderStations(r);
  assert.doesNotMatch(md, /Siguiente paso/);
  assert.doesNotMatch(md, /Arreglos/, "sin nada que enlazar no hay lista de arreglos");
  assert.match(md, /^\| # \| Estación \| Entrada → Salida \| Skills \| Estado \|$/m);
  assert.equal(md.split("\n").filter((l) => /^\| \d \|/.test(l)).length, 5);
  assert.ok(md.split("\n").includes(stationRow(r.stations[2])), "la fila de Build es la de stationRow");
});
