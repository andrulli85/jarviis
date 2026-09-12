import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { classify, slugify, buildRoute, renderMarkdown, stationStatus, stationRow, STATIONS } from "../scripts/route.mjs";
import { fakeWorld } from "./helpers.mjs";

/* ------------------------------------------------------------ classify --- */

test("una clave de Linear en el texto es un issue, con la clave en mayúsculas", () => {
  assert.deepEqual(classify("implementa JAR-12"), { kind: "issue", key: "JAR-12" });
  assert.deepEqual(classify("jar-7"), { kind: "idea" }, "sin prefijo configurado, minúsculas no es clave");
  assert.deepEqual(classify("jar-7", { linearPrefix: "JAR" }), { kind: "issue", key: "JAR-7" });
  assert.deepEqual(classify("ABC-3", { linearPrefix: "JAR" }), { kind: "idea" }, "con prefijo, solo ese prefijo");
});

test("una clave en mayúsculas sin prefijo configurado se enruta pero se pregunta", () => {
  const r = buildRoute("Soportar UTF-8 en el parser", fakeWorld());
  assert.equal(r.kind, "issue");
  assert.ok(r.questions.some((q) => /UTF-8.*técnico/s.test(q)));
  const r2 = buildRoute("JAR-12", { ...fakeWorld(), linearPrefix: "JAR" });
  assert.ok(!r2.questions.some((q) => /técnico/.test(q)));
});

test("tokens técnicos con guion no son claves de issue", () => {
  assert.equal(classify("soporte utf-8 en el parser").kind, "idea");
  assert.equal(classify("migrar a gpt-5").kind, "idea");
  assert.equal(classify("usar sha-256 para el token").kind, "idea");
});

test("un #N suelto no es una PR", () => {
  assert.equal(classify("top #1 feature del roadmap").kind, "idea");
  assert.deepEqual(classify("pull request 8"), { kind: "pr", pr: "8" });
});

test("mergeó con acento cuenta como merged", () => {
  assert.deepEqual(classify("la PR 4 se mergeó"), { kind: "merged", pr: "4" });
});

test("una PR por URL o por número es una pr; mergeada es merged", () => {
  assert.deepEqual(classify("https://github.com/a/b/pull/42"), { kind: "pr", pr: "42" });
  assert.deepEqual(classify("revisa la PR #42"), { kind: "pr", pr: "42" });
  assert.deepEqual(classify("PR 42 ya está mergeada"), { kind: "merged", pr: "42" });
  assert.deepEqual(classify("merged https://github.com/a/b/pull/9"), { kind: "merged", pr: "9" });
});

test("una ruta a docs/specs es una spec", () => {
  assert.deepEqual(classify("docs/specs/login-magico.md"), { kind: "spec", spec: "docs/specs/login-magico.md" });
  assert.deepEqual(classify("sigue con docs/specs/login-magico.md por favor"), { kind: "spec", spec: "docs/specs/login-magico.md" });
});

test("texto libre es una idea; vacío es un error", () => {
  assert.deepEqual(classify("quiero login con enlace mágico por email"), { kind: "idea" });
  assert.deepEqual(classify("   "), { kind: "invalid" });
});

test("un issue gana a una idea que lo menciona; una PR gana a un issue", () => {
  assert.equal(classify("JAR-12 quiero login mágico").kind, "issue");
  assert.equal(classify("JAR-12 en la PR #3").kind, "pr");
});

/* ------------------------------------------------------------- slugify --- */

test("slug ASCII, kebab, corto", () => {
  assert.equal(slugify("Login con enlace mágico por email para el panel"), "login-con-enlace-magico-por");
  assert.equal(slugify("JAR-12"), "jar-12");
  assert.equal(slugify("¡¡¡!!!"), "sin-titulo");
});

/* ---------------------------------------------------------- buildRoute --- */

test("una skill del proyecto (.claude/skills) existe; una de la fábrica sin enlazar se distingue y da el ln", () => {
  const w = fakeWorld({ project: ["git-conventions"], factory: ["build-kickoff"], plugin: ["tdd"] });
  const build = buildRoute("JAR-1", w).stations.find((s) => s.id === "build");
  assert.equal(build.skills.find((k) => k.name === "git-conventions").status, "existe");
  const bk = build.skills.find((k) => k.name === "build-kickoff");
  assert.equal(bk.status, "sin enlazar");
  assert.match(bk.link, /^ln -s .*build-kickoff .*skills\/build-kickoff$/);
  assert.equal(build.status, "sin enlazar");
  const md = renderMarkdown(buildRoute("JAR-1", w));
  assert.match(md, /no está enlazada/);
  assert.match(md, /ln -s/);
  assert.match(md, /reinicia la sesión/);
});

test("una idea recorre las cinco estaciones desde Shape", () => {
  const w = fakeWorld();
  const r = buildRoute("login con enlace mágico", w);
  assert.equal(r.kind, "idea");
  assert.equal(r.slug, "login-con-enlace-magico");
  assert.deepEqual(r.stations.map((s) => s.id), ["shape", "slice", "build", "review", "ship"]);
  assert.equal(r.next.station, "shape");
  assert.equal(r.spec, "docs/specs/login-con-enlace-magico.md");
});

test("un issue entra por Build y no crea spec", () => {
  const r = buildRoute("JAR-12", fakeWorld());
  assert.deepEqual(r.stations.map((s) => s.id), ["build", "review", "ship"]);
  assert.equal(r.next.station, "build");
  assert.equal(r.key, "JAR-12");
  assert.equal(r.spec, null);
  assert.match(r.next.command, /JAR-12/);
});

test("una spec existente entra por Slice; una que no existe vuelve a Shape y lo dice", () => {
  const w = fakeWorld({ specs: ["login.md"] });
  assert.equal(buildRoute("docs/specs/login.md", w).next.station, "slice");
  const r = buildRoute("docs/specs/otra.md", w);
  assert.equal(r.next.station, "shape");
  assert.ok(r.questions.some((q) => /no existe/.test(q)));
});

test("pr entra por Review; merged por Ship", () => {
  assert.equal(buildRoute("PR #4", fakeWorld()).next.station, "review");
  assert.equal(buildRoute("PR #4 merged", fakeWorld()).next.station, "ship");
});

test("estado vivo de cada skill: personal, plugin, por construir", () => {
  const w = fakeWorld({ personal: ["buzz-kickoff", "adversarial-review", "learnings"], plugin: ["grilling", "tdd"] });
  const r = buildRoute("una idea", w);
  const shape = r.stations.find((s) => s.id === "shape");
  assert.equal(shape.skills.find((k) => k.name === "buzz-kickoff").status, "existe");
  assert.equal(shape.skills.find((k) => k.name === "grilling").status, "existe");
  const slice = r.stations.find((s) => s.id === "slice");
  assert.equal(slice.skills.find((k) => k.name === "to-tickets-linear").status, "por construir");
  assert.equal(slice.status, "por construir");
  assert.equal(shape.status, "existe");
});

test("Build sin build-kickoff está por construir; con las tres skills, existe y sin paso manual", () => {
  const sin = buildRoute("JAR-1", fakeWorld({ personal: ["git-conventions"], plugin: ["tdd"] })).stations.find((s) => s.id === "build");
  assert.equal(sin.status, "por construir");
  const con = buildRoute("JAR-1", fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] })).stations.find((s) => s.id === "build");
  assert.equal(con.status, "existe");
  assert.equal(con.manual, null);
  assert.equal(con.command, "/build-kickoff JAR-1");
});

test("proveedores: autor de familia desconocida no tiene opuesto", () => {
  const w = fakeWorld({ providers: { claude: "/b/claude", codex: "/b/codex", openrouter: null, author: { family: "gemini", how: "t" } } });
  const review = buildRoute("PR #1", w).stations.find((s) => s.id === "review");
  assert.equal(review.provider.available, false);
  assert.match(review.provider.why, /gemini/);
});

test("proveedores: Review necesita la familia opuesta y lo reporta", () => {
  const w = fakeWorld({ providers: { claude: "/b/claude", codex: null, openrouter: null, author: { family: "claude", how: "t" } } });
  const review = buildRoute("PR #1", w).stations.find((s) => s.id === "review");
  assert.equal(review.provider.need, "agent");
  assert.equal(review.provider.opposite, "claude");
  assert.equal(review.provider.available, false);
  assert.match(review.provider.why, /codex/);
});

test("preguntas abiertas: sin git, sin prefijo Linear", () => {
  const r = buildRoute("una idea", fakeWorld({ git: false }));
  assert.ok(r.questions.some((q) => /repositorio git/i.test(q)));
  assert.ok(r.questions.some((q) => /Linear/i.test(q)));
  const r2 = buildRoute("una idea", { ...fakeWorld(), linearPrefix: "JAR" });
  assert.ok(!r2.questions.some((q) => /Linear/i.test(q)));
});

test("entrada inválida devuelve una ruta vacía con motivo", () => {
  const r = buildRoute("  ", fakeWorld());
  assert.equal(r.kind, "invalid");
  assert.deepEqual(r.stations, []);
  assert.match(r.why, /vac[ií][ao]/);
});

test("la tabla de estaciones es la de stations.json, en orden", () => {
  assert.deepEqual(STATIONS.map((s) => s.n), [1, 2, 3, 4, 5]);
});

test("renderMarkdown lista estaciones con estado y el siguiente comando", () => {
  const md = renderMarkdown(buildRoute("JAR-12", fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] })));
  assert.match(md, /Build/);
  assert.match(md, /Siguiente/);
  assert.match(md, /`\/build-kickoff JAR-12`/);
  assert.doesNotMatch(md, /manual/);
  assert.doesNotMatch(md, /Shape/);
});

/* ------------------------------------------------------- stationStatus --- */

test("stationStatus sobre una estación devuelve la misma forma que buildRoute construye", () => {
  const w = fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] });
  const s = stationStatus(STATIONS.find((s) => s.id === "build"), w);
  assert.deepEqual(Object.keys(s), ["n", "id", "name", "in", "out", "skills", "manual", "provider", "status", "command"]);
  assert.equal(s.n, 3);
  assert.equal(s.status, "existe");
  assert.deepEqual(s.skills.map((k) => k.name), ["build-kickoff", "tdd", "git-conventions"]);
  assert.equal(s.provider.channel, "claude");
  assert.equal(s.command, "/build-kickoff <key>", "sin ruta no hay clave que rellenar");
});

/* ---------------------------------------------------------- otra copia --- */

test("una skill personal que apunta a otra copia distinta de la fábrica es 'otra copia' y da el ln -sfn", () => {
  const w = fakeWorld({ elsewhere: ["build-kickoff"], factory: ["build-kickoff"], linked: ["git-conventions"], plugin: ["tdd"] });
  const build = buildRoute("JAR-1", w).stations.find((s) => s.id === "build");
  const bk = build.skills.find((k) => k.name === "build-kickoff");
  assert.equal(bk.status, "otra copia");
  assert.match(bk.where, /elsewhere\/build-kickoff\/SKILL\.md$/, "where es la ruta real, no el enlace");
  assert.equal(bk.link, `ln -sfn ${join(w.factoryDir, "build-kickoff")} ${join(w.skillsDir, "build-kickoff")}`);
  assert.equal(build.skills.find((k) => k.name === "git-conventions").status, "existe", "un enlace a la fábrica es existe");
  assert.equal(build.status, "otra copia");
});

test("otra copia agrega por debajo de sin enlazar y por encima de manual", () => {
  const w = fakeWorld({ elsewhere: ["build-kickoff"], factory: ["build-kickoff", "tdd"], linked: ["git-conventions"] });
  assert.equal(stationStatus(STATIONS.find((s) => s.id === "build"), w).status, "sin enlazar");
  const w2 = fakeWorld({ elsewhere: ["build-kickoff"], factory: ["build-kickoff"], linked: ["git-conventions"], plugin: ["tdd"] });
  assert.equal(stationStatus({ ...STATIONS.find((s) => s.id === "build"), manual: "algo" }, w2).status, "otra copia");
});

test("proveedores: Review sin autor no sabe la familia opuesta y muestra ambos canales", () => {
  const w = fakeWorld({ providers: { claude: "/b/claude", codex: null, openrouter: null, author: null } });
  const review = buildRoute("PR #1", w).stations.find((s) => s.id === "review");
  assert.deepEqual(review.provider, {
    need: "agent", opposite: null, available: null,
    channels: { claude: "/b/claude", codex: null },
    why: "no sé quién escribió el cambio (CE_REVIEW_AUTHOR)",
  });
  assert.match(renderMarkdown(buildRoute("PR #1", w)), /\*\*proveedor no disponible\*\*: no sé quién escribió/);
});

test("renderMarkdown con otra copia en la primera estación da el comando y el ln -sfn sin bloquear", () => {
  const w = fakeWorld({ elsewhere: ["build-kickoff"], factory: ["build-kickoff"], linked: ["git-conventions"], plugin: ["tdd"] });
  const md = renderMarkdown(buildRoute("JAR-1", w));
  assert.match(md, /`build-kickoff` \(otra copia\)/);
  assert.match(md, /## Siguiente paso\n\n`\/build-kickoff JAR-1`/);
  assert.match(md, /`ln -sfn .*build-kickoff .*skills\/build-kickoff`/);
  assert.doesNotMatch(md, /no está enlazada/);
});

test("stationRow es la fila de la tabla que renderMarkdown imprime", () => {
  const r = buildRoute("JAR-12", fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] }));
  const row = stationRow(r.stations[0]);
  assert.equal(row, "| 3 | Build | issue → workspace de Conductor en la rama del issue → PR que referencia la clave | `build-kickoff`, `tdd`, `git-conventions` | existe · proveedor: claude |");
  assert.ok(renderMarkdown(r).split("\n").includes(row));
});

/* ------------------------------------------------------ FACTORY_SKILLS --- */

/* FACTORY_SKILLS sale de import.meta.url, así que la única forma de probarlo
   desde un worktree es importar una copia del módulo que viva en uno: se
   copia la fábrica mínima (skills/ y providers/) a un repo git temporal, se
   añade un worktree y se importa route.mjs desde el worktree. */
const REPO_ROOT = join(here(), "..", "..", "..");
function here() { return dirname(fileURLToPath(import.meta.url)); }
function fakeFactory({ git = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wayfinder-factory-")));
  const main = join(root, "main"); mkdirSync(main);
  cpSync(join(REPO_ROOT, "skills"), join(main, "skills"), { recursive: true });
  cpSync(join(REPO_ROOT, "providers"), join(main, "providers"), { recursive: true });
  if (!git) return { root, main };
  const run = (...args) => execFileSync("git", args, { cwd: main, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  run("init", "-q", "-b", "main");
  run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "base");
  const worktree = join(root, "wt");
  run("worktree", "add", "-q", worktree);
  cpSync(join(main, "skills"), join(worktree, "skills"), { recursive: true });
  cpSync(join(main, "providers"), join(worktree, "providers"), { recursive: true });
  return { root, main, worktree };
}
const importRoute = (dir) => import(pathToFileURL(join(dir, "skills", "wayfinder", "scripts", "route.mjs")).href);

test("desde un worktree, FACTORY_SKILLS apunta al checkout principal y findSkill juzga contra él", async () => {
  const { root, main, worktree } = fakeFactory();
  const { FACTORY_SKILLS, findSkill } = await importRoute(worktree);
  assert.equal(FACTORY_SKILLS, join(main, "skills"));
  const skillsDir = join(root, "personal"); mkdirSync(skillsDir);
  symlinkSync(join(main, "skills", "wayfinder"), join(skillsDir, "wayfinder"));
  const w = { skillsDir, pluginsDir: join(root, "plugins"), cwd: null };
  assert.equal(findSkill("wayfinder", w).status, "existe", "una skill enlazada al principal no es otra copia");
  const sin = findSkill("build-kickoff", w);
  assert.equal(sin.status, "sin enlazar");
  assert.equal(sin.link, `ln -s ${join(main, "skills", "build-kickoff")} ${join(skillsDir, "build-kickoff")}`, "el ln apunta al principal, no al worktree");
});

test("sin .git alrededor, FACTORY_SKILLS sigue siendo here/../..", async () => {
  const { main } = fakeFactory({ git: false });
  const { FACTORY_SKILLS } = await importRoute(main);
  assert.equal(FACTORY_SKILLS, join(main, "skills"));
});
