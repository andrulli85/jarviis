import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, slugify, buildRoute, renderMarkdown, STATIONS } from "../scripts/route.mjs";

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

function fakeWorld({ personal = [], plugin = [], project = [], factory = [], specs = [], git = true, providers } = {}) {
  const root = mkdtempSync(join(tmpdir(), "wayfinder-"));
  const skillsDir = join(root, "skills"); mkdirSync(skillsDir);
  for (const s of personal) { mkdirSync(join(skillsDir, s)); writeFileSync(join(skillsDir, s, "SKILL.md"), "x"); }
  const pluginsDir = join(root, "plugins");
  for (const s of plugin) {
    const d = join(pluginsDir, "cache", "vendor", "pack", "1.0", "skills", "eng", s);
    mkdirSync(d, { recursive: true }); writeFileSync(join(d, "SKILL.md"), "x");
  }
  const cwd = join(root, "repo"); mkdirSync(cwd);
  if (git) mkdirSync(join(cwd, ".git"));
  for (const s of project) { mkdirSync(join(cwd, ".claude", "skills", s), { recursive: true }); writeFileSync(join(cwd, ".claude", "skills", s, "SKILL.md"), "x"); }
  const factoryDir = join(root, "factory"); mkdirSync(factoryDir);
  for (const s of factory) { mkdirSync(join(factoryDir, s)); writeFileSync(join(factoryDir, s, "SKILL.md"), "x"); }
  for (const s of specs) { mkdirSync(join(cwd, "docs", "specs"), { recursive: true }); writeFileSync(join(cwd, "docs", "specs", s), "x"); }
  return { skillsDir, pluginsDir, cwd, factoryDir, linearPrefix: null, providers: providers || { claude: "/b/claude", codex: "/b/codex", openrouter: "clave presente", author: { family: "claude", how: "t" } } };
}

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
