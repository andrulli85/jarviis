import { test } from "node:test";
import assert from "node:assert/strict";
import { collectStations, failures, renderStations } from "../scripts/stations.mjs";
import { stationRow } from "../scripts/route.mjs";
import { fakeWorld } from "./helpers.mjs";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALL = ["buzz-kickoff", "grilling", "to-tickets-linear", "build-kickoff", "tdd", "git-conventions", "adversarial-review", "code-review", "learnings"];

/* La salud de los proveedores se inyecta ya calculada (health() tiene sus
   propios tests en providers/test/health.test.mjs): aquí se prueba qué hace
   stations con cada estado, sin exec, sin sondeo y con el reloj fijo. */
const NOW = "2026-09-12T12:00:00-03:00";
const ok = (bin, at = "2026-09-10T09:30:00-03:00", latency) => ({ bin, status: "ok", at, ...(latency != null ? { latency } : {}) });
const HEALTHY = { claude: ok("/b/claude", "2026-09-12T10:00:00-03:00", 1.8), codex: ok("/b/codex"), openrouter: ok(null, "2026-09-11T08:00:00-03:00", 0.4), ignored: 0 };
const AUTHOR = { family: "claude", how: "t" };
const world = (extra = {}, w = {}) => ({ ...fakeWorld({ linked: ALL, ...w }), health: HEALTHY, author: AUTHOR, now: NOW, ...extra });

test("todo enlazado y los tres canales ok: cinco estaciones en existe, providers es la salud, sin fallos", async () => {
  const w = world();
  const r = await collectStations(w);
  assert.deepEqual(r.stations.map((s) => s.id), ["shape", "slice", "build", "review", "ship"]);
  assert.deepEqual(r.stations.map((s) => s.status), ["existe", "existe", "existe", "existe", "existe"]);
  assert.equal(r.cwd, w.cwd);
  assert.deepEqual(r.providers, HEALTHY);
  assert.equal(r.providers.codex.status, "ok");
  assert.equal(r.providers.ignored, 0);
  assert.deepEqual(r.author, AUTHOR);
  assert.deepEqual(failures(r), []);
});

test("una sin enlazar, una en otra copia y una por construir: estados, tres fallos y los ln en Arreglos", async () => {
  const rest = ALL.filter((s) => !["grilling", "build-kickoff", "learnings"].includes(s));
  const w = world({}, { linked: rest, factory: ["grilling", "build-kickoff"], elsewhere: ["build-kickoff"] });
  const r = await collectStations(w);
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

/* ---------------------------------------------------- salud por canal --- */

test("fila y pie: ok con fecha y latencia, sin cuota hasta, sin sondear, down con el why; ignorados solo si hay", async () => {
  const health = {
    claude: ok("/b/claude", "2026-09-12T10:00:00-03:00", 1.8),
    codex: { bin: "/b/codex", status: "quota", at: "2026-09-11T22:00:30-03:00", until: "2026-09-16T10:24:00-03:00", why: "exited 1 — try again at Sep 16th, 2026 10:24 AM." },
    openrouter: { bin: null, status: "unprobed" },
    ignored: 2,
  };
  const r = await collectStations(world({ health }));
  const md = renderStations(r);
  const build = md.split("\n").find((l) => l.startsWith("| 3 |"));
  assert.match(build, /existe · proveedor: claude ok \(2026-09-12, 1\.8 s\) \|$/);
  const review = md.split("\n").find((l) => l.startsWith("| 4 |"));
  assert.match(review, /existe · proveedor: codex sin cuota hasta 2026-09-16 10:24 \|$/);
  assert.match(md, /^Proveedores: claude ok \(hoy\) · codex sin cuota hasta 2026-09-16 10:24 · openrouter sin sondear · autor claude · ignorados: 2$/m);

  const r2 = await collectStations(world({ health: { ...HEALTHY, codex: { bin: "/b/codex", status: "down", at: "2026-09-11T22:00:30-03:00", why: "salió con código 1: boom" } } }));
  const md2 = renderStations(r2);
  assert.match(md2.split("\n").find((l) => l.startsWith("| 4 |")), /proveedor: codex down: salió con código 1: boom \|$/);
  assert.match(md2, /^Proveedores: claude ok \(hoy\) · codex down: salió con código 1: boom · openrouter ok \(hace 1 d\) · autor claude$/m);
});

test("failures cuenta quota, down y unprobed por canal, con el mensaje de cada uno; ok no cuenta", async () => {
  const health = {
    claude: { bin: "/b/claude", status: "unprobed" },
    codex: { bin: "/b/codex", status: "quota", at: "2026-09-11T22:00:30-03:00", until: "2026-09-16T10:24:00-03:00", why: "x" },
    openrouter: { bin: null, status: "down", why: "http 401 User not found" },
    ignored: 0,
  };
  const r = await collectStations(world({ health }));
  const f = failures(r);
  assert.deepEqual(f, [
    "claude: sin evidencia reciente (7 d); corre npm run stations -- --probe",
    "codex: sin cuota hasta 2026-09-16 10:24",
    "openrouter: down: http 401 User not found",
  ]);
  const md = renderStations(r);
  assert.match(md, /## Arreglos/);
  for (const line of f) assert.ok(md.includes(line), `Arreglos lista: ${line}`);
  assert.doesNotMatch(md, /Enlaza y reinicia/, "sin skills que enlazar no se pide enlazar");
});

test("sin codex y sin autor: Review muestra ambas familias con su salud, el pie lo dice y es un fallo por familia y por canal", async () => {
  const health = { ...HEALTHY, codex: { bin: null, status: "down", why: "no hay binario de codex: ni CE_CODEX_BIN ni Conductor lo tienen" } };
  const r = await collectStations(world({ health, author: null }));
  const md = renderStations(r);
  const review = md.split("\n").find((l) => l.startsWith("| 4 |"));
  assert.match(review, /opuesta al autor: claude ok \(2026-09-12, 1\.8 s\) · codex down: no hay binario/);
  assert.match(md, /^Proveedores: claude ok \(hoy\) · codex down: no hay binario de codex.* · openrouter ok \(hace 1 d\) · autor —$/m);
  const f = failures(r);
  assert.equal(f.length, 2);
  assert.match(f[0], /Review.*falta codex/);
  assert.match(f[1], /^codex: down: no hay binario/);
});

test("sin codex con autor claude: Review no tiene opuesto disponible y es un fallo, además del canal", async () => {
  const health = { ...HEALTHY, codex: { bin: null, status: "down", why: "no hay binario de codex" } };
  const r = await collectStations(world({ health }));
  const f = failures(r);
  assert.equal(f.length, 2);
  assert.match(f[0], /Review.*hace falta codex/);
  assert.match(f[1], /^codex: down/);
});

test("collectStations pide la salud a health() con lo inyectado: --probe sondea por ask y deja stateFile", async () => {
  const base = fakeWorld({ linked: ALL });
  const bin = join(base.cwd, "claude"); writeFileSync(bin, "#!/bin/sh\nexit 0\n"); chmodSync(bin, 0o755);
  const env = { HOME: base.cwd, CE_CLAUDE_BIN: bin, CE_CODEX_BIN: "", CE_AGENT_BINARIES_DIR: "/nonexistent", OPENROUTER_API_KEY: "", OPENROUTER_KEY_FILE: "/nonexistent/key" };
  const asked = [];
  const stateFile = join(base.cwd, "health.json");
  const w = { ...base, env, now: NOW, author: AUTHOR, probe: true, evidenceDir: join(base.cwd, "reviews"), stateFile, exec: async () => ({ code: 0, stdout: "", stderr: "" }), ask: async (c) => { asked.push(c); return { ok: true, seconds: 1 }; } };
  const r = await collectStations(w);
  assert.deepEqual(asked, ["claude"], "solo se sondea el canal que pasa los detectores");
  assert.equal(r.providers.claude.status, "ok");
  assert.equal(r.providers.claude.latency, 1);
  assert.equal(r.providers.codex.status, "down");
  assert.equal(r.providers.openrouter.status, "down");
  assert.equal(JSON.parse(readFileSync(stateFile, "utf8")).claude.status, "ok");
  assert.equal(new Date(r.now).getTime(), new Date(NOW).getTime());
});

test("renderStations es la tabla del wayfinder sin Siguiente paso", async () => {
  const w = world();
  const r = await collectStations(w);
  const md = renderStations(r);
  assert.doesNotMatch(md, /Siguiente paso/);
  assert.doesNotMatch(md, /Arreglos/, "sin nada que enlazar ni canal en rojo no hay lista de arreglos");
  assert.match(md, /^\| # \| Estación \| Entrada → Salida \| Skills \| Estado \|$/m);
  assert.equal(md.split("\n").filter((l) => /^\| \d \|/.test(l)).length, 5);
  assert.ok(md.split("\n").includes(stationRow(r.stations[2], { provider: () => " · proveedor: claude ok (2026-09-12, 1.8 s)" })), "la fila de Build es la de stationRow con la celda de salud");
});

/* ---------------------------------------------------- Review pendiente --- */

/* La deuda se inyecta ya calculada (reviewDebt() tiene sus propios tests
   con repos git reales en review-debt.test.mjs): aquí se prueba qué hace
   stations con cada forma. */
const NOTE = "/code-review no deja evidencia y no cuenta";
const SHA = (n) => `${n}`.repeat(40);

test("Review pendiente con deuda: N commits desde el último review, el comando y la nota; va bajo Arreglos, en --json como review y no toca failures", async () => {
  const review = { lastReviewed: [{ sha: SHA("a"), at: "2026-09-12T13:53:19-03:00" }, { sha: SHA("b"), at: "2026-09-11T09:00:00-03:00" }], pending: [SHA("c"), SHA("d")], command: `/adversarial-review ${"9".repeat(7)}..HEAD`, note: `${NOTE}; incluye 3 ya revisados` };
  const health = { ...HEALTHY, codex: { bin: "/b/codex", status: "unprobed" } };
  const r = await collectStations(world({ health, review }));
  assert.deepEqual(r.review, review);
  assert.deepEqual(failures(r), ["codex: sin evidencia reciente (7 d); corre npm run stations -- --probe"], "la deuda de Review no es un fallo");
  const md = renderStations(r);
  assert.ok(md.indexOf("## Arreglos") < md.indexOf("## Review pendiente"), "Review pendiente va bajo Arreglos");
  assert.match(md, /^2 commits sin review adversarial desde aaaaaaa \(2026-09-12\): `\/adversarial-review 9999999\.\.HEAD`$/m);
  assert.match(md, /^\/code-review no deja evidencia y no cuenta; incluye 3 ya revisados$/m);
});

test("Review pendiente al día y sin evidencia; un solo commit va en singular", async () => {
  const r = await collectStations(world({ review: { lastReviewed: [{ sha: SHA("a"), at: "2026-09-12T13:53:19-03:00" }], pending: [], command: null, note: NOTE } }));
  const md = renderStations(r);
  assert.match(md, /^## Review pendiente$/m);
  assert.match(md, /^al día \(último review aaaaaaa, 2026-09-12\)$/m);
  assert.match(md, /^\/code-review no deja evidencia y no cuenta$/m);
  assert.deepEqual(failures(r), []);

  const none = renderStations(await collectStations(world({ review: { lastReviewed: [], pending: [], command: null, note: NOTE } })));
  assert.match(none, /^sin evidencia de review en este repo$/m);

  const one = renderStations(await collectStations(world({ review: { lastReviewed: [{ sha: SHA("a"), at: "2026-09-12T13:53:19-03:00" }], pending: [SHA("c")], command: "/adversarial-review aaaaaaa..HEAD", note: NOTE } })));
  assert.match(one, /^1 commit sin review adversarial desde aaaaaaa \(2026-09-12\): `\/adversarial-review aaaaaaa\.\.HEAD`$/m);
});

test("collectStations calcula la deuda con reviewDebt sobre cwd y evidenceDir: sin evidencia en el mundo falso sale sin evidencia", async () => {
  const r = await collectStations(world());
  assert.deepEqual(r.review, { lastReviewed: [], pending: [], command: null, note: NOTE });
});
