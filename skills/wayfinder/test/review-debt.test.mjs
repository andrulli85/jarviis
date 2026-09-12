import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewDebt } from "../scripts/stations.mjs";

/* Un repo git real en un directorio temporal: la deuda de Review se decide
   con `git rev-list` y `git merge-base`, y falsear eso a mano sería probar
   la copia y no el original. Autor y reloj fijos para que los sha no
   dependan de la máquina. */
function repo() {
  const cwd = mkdtempSync(join(tmpdir(), "review-debt-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  let tick = 1700000000;
  const git = (...args) => execFileSync("git", args, { cwd, env: { ...env, GIT_AUTHOR_DATE: `${tick} +0000`, GIT_COMMITTER_DATE: `${tick++} +0000` }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", "main");
  const commit = (msg) => { git("commit", "-q", "--allow-empty", "-m", msg); return git("rev-parse", "HEAD"); };
  return { cwd, git, commit };
}

/* La evidencia como la deja adversarial-review: el nombre lleva el instante
   en UTC y el cuerpo `agent`, `ok`, `to` y `verdict`. */
function evidence(dir, { at, to, ok = true, verdict = { findings: [] }, agent = "codex" }) {
  mkdirSync(dir, { recursive: true });
  const stamp = at.replace(/:/g, "-").replace(/\.(\d{3})Z$/, "-$1");
  writeFileSync(join(dir, `${stamp}-tooled-x.json`), JSON.stringify({ agent, ok, to, verdict, why: ok ? null : "exited 1" }));
}

test("cuatro commits y evidencia ok con to en el segundo: dos pendientes, último review y comando desde el to", () => {
  const r = repo();
  r.commit("1"); const c2 = r.commit("2"); const c3 = r.commit("3"); const c4 = r.commit("4");
  const evidenceDir = join(r.cwd, "reviews");
  evidence(evidenceDir, { at: "2026-09-12T16:53:19.737Z", to: c2 });
  const d = reviewDebt({ cwd: r.cwd, evidenceDir });
  assert.deepEqual(d.pending, [c4, c3]);
  assert.equal(d.lastReviewed.length, 1);
  assert.equal(d.lastReviewed[0].sha, c2);
  assert.equal(new Date(d.lastReviewed[0].at).getTime(), Date.parse("2026-09-12T16:53:19.737Z"));
  assert.equal(d.command, `/adversarial-review ${c2.slice(0, 7)}..HEAD`);
  assert.equal(d.note, "/code-review no deja evidencia y no cuenta");
});

test("dos ramas revisadas por separado y fusionadas: pendientes solo el merge y lo posterior; comando desde el merge-base con nota de cuántos ya revisados", () => {
  const r = repo();
  const base = r.commit("base");
  r.git("checkout", "-q", "-b", "a"); r.commit("a1"); const a2 = r.commit("a2");
  r.git("checkout", "-q", "main"); r.git("checkout", "-q", "-b", "b"); const b1 = r.commit("b1");
  r.git("checkout", "-q", "main"); r.git("merge", "-q", "--no-ff", "-m", "merge a", "a"); r.git("merge", "-q", "--no-ff", "-m", "merge b", "b");
  const merges = r.git("rev-list", "--merges", "HEAD").split("\n");
  const after = r.commit("after");
  const evidenceDir = join(r.cwd, "reviews");
  evidence(evidenceDir, { at: "2026-09-12T10:00:00.000Z", to: a2 });
  evidence(evidenceDir, { at: "2026-09-12T11:00:00.000Z", to: b1 });
  const d = reviewDebt({ cwd: r.cwd, evidenceDir });
  assert.deepEqual(d.lastReviewed.map((x) => x.sha), [b1, a2], "del más reciente al más viejo");
  assert.deepEqual(new Set(d.pending), new Set([after, ...merges]));
  assert.equal(d.pending.length, 3);
  assert.equal(d.command, `/adversarial-review ${base.slice(0, 7)}..HEAD`);
  assert.equal(d.note, "/code-review no deja evidencia y no cuenta; incluye 3 ya revisados");
});

test("un to que dejó de ser ancestro de HEAD (rebase) no cuenta; ok:false no cuenta; sin evidencia ok+veredicto no hay deuda ni comando", () => {
  const r = repo();
  r.commit("1");
  r.git("checkout", "-q", "-b", "wip"); const gone = r.commit("wip");
  r.git("checkout", "-q", "main"); const c2 = r.commit("2");
  r.git("branch", "-q", "-D", "wip");
  const evidenceDir = join(r.cwd, "reviews");
  evidence(evidenceDir, { at: "2026-09-12T10:00:00.000Z", to: gone });
  evidence(evidenceDir, { at: "2026-09-12T11:00:00.000Z", to: c2, ok: false, verdict: null });
  evidence(evidenceDir, { at: "2026-09-12T12:00:00.000Z", to: "0123456789abcdef0123456789abcdef01234567" });
  const d = reviewDebt({ cwd: r.cwd, evidenceDir });
  assert.deepEqual(d, { lastReviewed: [], pending: [], command: null, note: "/code-review no deja evidencia y no cuenta" });

  const empty = reviewDebt({ cwd: r.cwd, evidenceDir: join(r.cwd, "no-such-dir") });
  assert.deepEqual(empty, { lastReviewed: [], pending: [], command: null, note: "/code-review no deja evidencia y no cuenta" });
});

test("dos reviews en el mismo linaje: el to más nuevo manda el rango, sin nota de ya revisados; al día cuando el to es HEAD", () => {
  const r = repo();
  const c1 = r.commit("1"); r.commit("2"); const c3 = r.commit("3"); const c4 = r.commit("4");
  const evidenceDir = join(r.cwd, "reviews");
  evidence(evidenceDir, { at: "2026-09-12T10:00:00.000Z", to: c1 });
  evidence(evidenceDir, { at: "2026-09-12T11:00:00.000Z", to: c3 });
  const d = reviewDebt({ cwd: r.cwd, evidenceDir });
  assert.deepEqual(d.lastReviewed.map((x) => x.sha), [c3, c1]);
  assert.deepEqual(d.pending, [c4]);
  assert.equal(d.command, `/adversarial-review ${c3.slice(0, 7)}..HEAD`);
  assert.equal(d.note, "/code-review no deja evidencia y no cuenta");

  evidence(evidenceDir, { at: "2026-09-12T12:00:00.000Z", to: c4 });
  const upToDate = reviewDebt({ cwd: r.cwd, evidenceDir });
  assert.deepEqual(upToDate.pending, []);
  assert.equal(upToDate.lastReviewed[0].sha, c4);
  assert.equal(upToDate.command, null, "sin pendientes no hay rango que revisar");
});

test("fuera de un repo git no hay deuda: como sin evidencia", () => {
  const cwd = mkdtempSync(join(tmpdir(), "review-debt-norepo-"));
  const evidenceDir = join(cwd, "reviews");
  evidence(evidenceDir, { at: "2026-09-12T10:00:00.000Z", to: "0123456789abcdef0123456789abcdef01234567" });
  const d = reviewDebt({ cwd, evidenceDir, git: () => null });
  assert.deepEqual(d, { lastReviewed: [], pending: [], command: null, note: "/code-review no deja evidencia y no cuenta" });
});
