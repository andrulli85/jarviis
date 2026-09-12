import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEvidence } from "../evidence.mjs";

/* Un ~/.claude/adversarial-reviews de mentira. Cada fixture es un archivo
   con nombre y cuerpo elegidos; `mtime` se fija cuando el nombre no lleva
   fecha, que es el caso en que cuenta. */
function evidenceDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "evidence-"));
  for (const [name, body, mtime] of files) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
    if (mtime) utimesSync(join(dir, name), mtime, mtime);
  }
  return dir;
}
const NOW = new Date("2026-09-12T12:00:00Z");
const review = (extra) => ({ agent: "codex", ok: true, why: null, to: "abc1234", verdict: { findings: [] }, ...extra });

test("el instante sale del timestamp del nombre (UTC) y el registro trae agent, ok, why, to, verdict y file", () => {
  const dir = evidenceDir([["2026-09-11T22-00-30-700-tooled-7dad57b-6e18106.json", review({ to: "6e18106", why: null })]]);
  const r = readEvidence({ evidenceDir: dir, now: NOW });
  assert.equal(r.ignored, 0);
  assert.equal(r.records.length, 1);
  const [e] = r.records;
  assert.equal(e.at.toISOString(), "2026-09-11T22:00:30.700Z");
  assert.deepEqual([e.agent, e.ok, e.why, e.to], ["codex", true, null, "6e18106"]);
  assert.deepEqual(e.verdict, { findings: [] });
  assert.equal(e.file, join(dir, "2026-09-11T22-00-30-700-tooled-7dad57b-6e18106.json"));
});

test("sin timestamp en el nombre manda el mtime", () => {
  const stamp = new Date("2026-09-10T08:00:00Z");
  const dir = evidenceDir([["revision-suelta.json", review(), stamp]]);
  const r = readEvidence({ evidenceDir: dir, now: NOW });
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].at.getTime(), stamp.getTime());
});

test("corrupto, sin agent y con fecha futura van a ignored y no a records", () => {
  const dir = evidenceDir([
    ["2026-09-11T10-00-00-000-roto.json", "{ no es json"],
    ["2026-09-11T11-00-00-000-sin-agent.json", { ok: true, to: "x" }],
    ["2026-09-13T11-00-00-000-futuro.json", review()],
    ["2026-09-11T12-00-00-000-bueno.json", review()],
    ["notas.txt", "no es evidencia"],
  ]);
  const r = readEvidence({ evidenceDir: dir, now: NOW });
  assert.equal(r.ignored, 3);
  assert.deepEqual(r.records.map((e) => e.file.split("/").pop()), ["2026-09-11T12-00-00-000-bueno.json"]);
});

test("un fallo conserva su why y ok:false; los registros salen del más reciente al más viejo", () => {
  const dir = evidenceDir([
    ["2026-09-10T10-00-00-000-a.json", review({ ok: true })],
    ["2026-09-11T10-00-00-000-b.json", review({ ok: false, why: "exited 1 — try again at Sep 16th, 2026 10:24 AM.", verdict: null })],
  ]);
  const r = readEvidence({ evidenceDir: dir, now: NOW });
  assert.deepEqual(r.records.map((e) => e.ok), [false, true]);
  assert.match(r.records[0].why, /try again at Sep 16th/);
  assert.equal(r.records[0].verdict, null);
});

test("evidenceDir inexistente: sin registros, sin ignorados, sin error", () => {
  const r = readEvidence({ evidenceDir: join(tmpdir(), "no-existe-" + Date.now()), now: NOW });
  assert.deepEqual(r, { records: [], ignored: 0 });
});

test("un directorio con nombre .json no es evidencia: se ignora sin romper", () => {
  const dir = evidenceDir([["2026-09-11T12-00-00-000-bueno.json", review()]]);
  mkdirSync(join(dir, "2026-09-11T13-00-00-000-carpeta.json"));
  const r = readEvidence({ evidenceDir: dir, now: NOW });
  assert.equal(r.records.length, 1);
  assert.equal(r.ignored, 1);
});

test("una fecha de calendario inválida en el nombre no se normaliza: no parsea y manda el mtime", () => {
  const stamp = new Date("2026-09-10T08:00:00Z");
  const dir = evidenceDir([["2026-02-31T10-00-00-000-x.json", review(), stamp]]);
  const r = readEvidence({ evidenceDir: dir, now: NOW });
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].at.getTime(), stamp.getTime(), "no es el 3 de marzo");
});
