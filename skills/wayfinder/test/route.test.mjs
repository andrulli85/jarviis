import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { classify, slugify, buildRoute, renderMarkdown, stationStatus, stationRow, path, branches, entryForState, STATIONS } from "../scripts/route.mjs";
import { fakeWorld } from "./helpers.mjs";

/* ------------------------------------------------------------ classify --- */

test("una clave de Linear en el texto es un issue, con la clave en mayúsculas", () => {
  assert.deepEqual(classify("implementa JAR-12"), { kind: "issue", key: "JAR-12" });
  assert.deepEqual(classify("jar-7"), { kind: "idea" }, "sin prefijo configurado, minúsculas no es clave");
  assert.deepEqual(classify("jar-7", { linearPrefix: "JAR" }), { kind: "issue", key: "JAR-7" });
  assert.deepEqual(classify("ABC-3", { linearPrefix: "JAR" }), { kind: "idea" }, "con prefijo, solo ese prefijo");
});

test("una clave en mayúsculas sin prefijo configurado se enruta pero se pregunta", async () => {
  const r = await buildRoute("Soportar UTF-8 en el parser", fakeWorld());
  assert.equal(r.kind, "issue");
  assert.ok(r.questions.some((q) => /UTF-8.*técnico/s.test(q)));
  const r2 = await buildRoute("JAR-12", { ...fakeWorld(), linearPrefix: "JAR" });
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

test("una skill del proyecto (.claude/skills) existe; una de la fábrica sin enlazar se distingue y da el ln", async () => {
  const w = fakeWorld({ project: ["git-conventions"], factory: ["build-kickoff"], plugin: ["tdd"] });
  const build = (await buildRoute("JAR-1", w)).stations.find((s) => s.id === "build");
  assert.equal(build.skills.find((k) => k.name === "git-conventions").status, "existe");
  const bk = build.skills.find((k) => k.name === "build-kickoff");
  assert.equal(bk.status, "sin enlazar");
  assert.match(bk.link, /^ln -s .*build-kickoff .*skills\/build-kickoff$/);
  assert.equal(build.status, "sin enlazar");
  const md = renderMarkdown(await buildRoute("JAR-1", w));
  assert.match(md, /no está enlazada/);
  assert.match(md, /ln -s/);
  assert.match(md, /reinicia la sesión/);
});

test("una idea recorre las cinco estaciones desde Shape", async () => {
  const w = fakeWorld();
  const r = await buildRoute("login con enlace mágico", w);
  assert.equal(r.kind, "idea");
  assert.equal(r.slug, "login-con-enlace-magico");
  assert.deepEqual(r.stations.map((s) => s.id), ["shape", "slice", "build", "review", "ship"]);
  assert.equal(r.next.station, "shape");
  assert.equal(r.spec, "docs/specs/login-con-enlace-magico.md");
});

test("un issue entra por Build y no crea spec", async () => {
  const r = await buildRoute("JAR-12", fakeWorld());
  assert.deepEqual(r.stations.map((s) => s.id), ["build", "review", "ship"]);
  assert.equal(r.next.station, "build");
  assert.equal(r.key, "JAR-12");
  assert.equal(r.spec, null);
  assert.match(r.next.command, /JAR-12/);
});

test("una spec existente entra por Slice; una que no existe vuelve a Shape y lo dice", async () => {
  const w = fakeWorld({ specs: ["login.md"] });
  assert.equal((await buildRoute("docs/specs/login.md", w)).next.station, "slice");
  const r = await buildRoute("docs/specs/otra.md", w);
  assert.equal(r.next.station, "shape");
  assert.ok(r.questions.some((q) => /no existe/.test(q)));
});

test("pr entra por Review; merged por Ship", async () => {
  assert.equal((await buildRoute("PR #4", fakeWorld())).next.station, "review");
  assert.equal((await buildRoute("PR #4 merged", fakeWorld())).next.station, "ship");
});

test("estado vivo de cada skill: personal, plugin, por construir", async () => {
  const w = fakeWorld({ personal: ["buzz-kickoff", "adversarial-review", "learnings"], plugin: ["grilling", "tdd"] });
  const r = await buildRoute("una idea", w);
  const shape = r.stations.find((s) => s.id === "shape");
  assert.equal(shape.skills.find((k) => k.name === "buzz-kickoff").status, "existe");
  assert.equal(shape.skills.find((k) => k.name === "grilling").status, "existe");
  const slice = r.stations.find((s) => s.id === "slice");
  assert.equal(slice.skills.find((k) => k.name === "to-tickets-linear").status, "por construir");
  assert.equal(slice.status, "por construir");
  assert.equal(shape.status, "existe");
});

test("Build sin build-kickoff está por construir; con las tres skills, existe y sin paso manual", async () => {
  const sin = (await buildRoute("JAR-1", fakeWorld({ personal: ["git-conventions"], plugin: ["tdd"] }))).stations.find((s) => s.id === "build");
  assert.equal(sin.status, "por construir");
  const con = (await buildRoute("JAR-1", fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] }))).stations.find((s) => s.id === "build");
  assert.equal(con.status, "existe");
  assert.equal(con.manual, null);
  assert.equal(con.command, "/build-kickoff JAR-1");
});

test("proveedores: autor de familia desconocida no tiene opuesto", async () => {
  const w = fakeWorld({ providers: { claude: "/b/claude", codex: "/b/codex", openrouter: null, author: { family: "gemini", how: "t" } } });
  const review = (await buildRoute("PR #1", w)).stations.find((s) => s.id === "review");
  assert.equal(review.provider.available, false);
  assert.match(review.provider.why, /gemini/);
});

test("proveedores: Review necesita la familia opuesta y lo reporta", async () => {
  const w = fakeWorld({ providers: { claude: "/b/claude", codex: null, openrouter: null, author: { family: "claude", how: "t" } } });
  const review = (await buildRoute("PR #1", w)).stations.find((s) => s.id === "review");
  assert.equal(review.provider.need, "agent");
  assert.equal(review.provider.opposite, "claude");
  assert.equal(review.provider.available, false);
  assert.match(review.provider.why, /codex/);
});

test("preguntas abiertas: sin git, sin prefijo Linear", async () => {
  const r = await buildRoute("una idea", fakeWorld({ git: false }));
  assert.ok(r.questions.some((q) => /repositorio git/i.test(q)));
  assert.ok(r.questions.some((q) => /Linear/i.test(q)));
  const r2 = await buildRoute("una idea", { ...fakeWorld(), linearPrefix: "JAR" });
  assert.ok(!r2.questions.some((q) => /Linear/i.test(q)));
});

test("entrada inválida devuelve una ruta vacía con motivo", async () => {
  const r = await buildRoute("  ", fakeWorld());
  assert.equal(r.kind, "invalid");
  assert.deepEqual(r.stations, []);
  assert.match(r.why, /vac[ií][ao]/);
});

test("la tabla de estaciones es la de stations.json, en orden", () => {
  assert.deepEqual(STATIONS.map((s) => s.n), [1, 2, 3, 4, 5]);
});

test("renderMarkdown lista estaciones con estado y el siguiente comando", async () => {
  const md = renderMarkdown(await buildRoute("JAR-12", fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] })));
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

test("una skill personal que apunta a otra copia distinta de la fábrica es 'otra copia' y da el ln -sfn", async () => {
  const w = fakeWorld({ elsewhere: ["build-kickoff"], factory: ["build-kickoff"], linked: ["git-conventions"], plugin: ["tdd"] });
  const build = (await buildRoute("JAR-1", w)).stations.find((s) => s.id === "build");
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

test("proveedores: Review sin autor no sabe la familia opuesta y muestra ambos canales", async () => {
  const w = fakeWorld({ providers: { claude: "/b/claude", codex: null, openrouter: null, author: null } });
  const review = (await buildRoute("PR #1", w)).stations.find((s) => s.id === "review");
  assert.deepEqual(review.provider, {
    need: "agent", opposite: null, available: null,
    channels: { claude: "/b/claude", codex: null },
    why: "no sé quién escribió el cambio (CE_REVIEW_AUTHOR)",
  });
  assert.match(renderMarkdown(await buildRoute("PR #1", w)), /\*\*proveedor no disponible\*\*: no sé quién escribió/);
});

test("renderMarkdown con otra copia en la primera estación da el comando y el ln -sfn sin bloquear", async () => {
  const w = fakeWorld({ elsewhere: ["build-kickoff"], factory: ["build-kickoff"], linked: ["git-conventions"], plugin: ["tdd"] });
  const md = renderMarkdown(await buildRoute("JAR-1", w));
  assert.match(md, /`build-kickoff` \(otra copia\)/);
  assert.match(md, /## Siguiente paso\n\n`\/build-kickoff JAR-1`/);
  assert.match(md, /`ln -sfn .*build-kickoff .*skills\/build-kickoff`/);
  assert.doesNotMatch(md, /no está enlazada/);
});

test("stationRow es la fila de la tabla que renderMarkdown imprime", async () => {
  const r = await buildRoute("JAR-12", fakeWorld({ personal: ["git-conventions", "build-kickoff"], plugin: ["tdd"] }));
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

/* --------------------------------------------------------- transitions --- */

/* Tres estaciones y un `end`: a → b → c → end. Una rama en `a` (la entrada)
   y otra en `b`, para comprobar que branches solo mira la entrada. El
   comando de la transición a `b` difiere del `command` de `b` a propósito:
   el paso lleva el comando de la transición que llega a él. */
const fixtureStation = (n, id, name, extra = {}) => ({ n, id, name, in: id, out: id, entry: [], skills: [], command: `/${id} <key>`, manual: null, provider: null, transitions: [], ...extra });
const TRES = [
  fixtureStation(1, "a", "A", { transitions: [
    { to: "b", command: "/b <key> (desde a)" },
    { to: "outside", when: "la cosa es de otro plano", command: "/fuera <spec>", skill: "fuera-skill" },
  ] }),
  fixtureStation(2, "b", "B", { transitions: [
    { to: "c", command: "/c" },
    { to: "a", when: "falta algo en el plan", command: "/a otra vez" },
  ] }),
  fixtureStation(3, "c", "C", { transitions: [{ to: "end", command: null }] }),
];

test("path sigue la transición sin when desde cada entrada hasta end, con los comandos rellenos", () => {
  const fill = (t) => t && t.replace("<key>", "JAR-1");
  assert.deepEqual(path("a", TRES, fill), [
    { station: "a", name: "A", command: "/a JAR-1" },
    { station: "b", name: "B", command: "/b JAR-1 (desde a)" },
    { station: "c", name: "C", command: "/c" },
  ]);
  assert.deepEqual(path("b", TRES, fill).map((p) => p.station), ["b", "c"]);
  assert.deepEqual(path("c", TRES, fill), [{ station: "c", name: "C", command: "/c JAR-1" }]);
});

test("branches trae solo las transiciones con when de la estación de entrada, con el comando relleno", () => {
  const fill = (t) => t && t.replace("<spec>", "docs/specs/x.md");
  assert.deepEqual(branches("a", TRES, fill), [
    { when: "la cosa es de otro plano", to: "outside", command: "/fuera docs/specs/x.md", skill: "fuera-skill" },
  ]);
  assert.deepEqual(branches("b", TRES, fill), [{ when: "falta algo en el plan", to: "a", command: "/a otra vez", skill: null }]);
  assert.deepEqual(branches("c", TRES, fill), []);
});

test("una estación intermedia sin transición sin when es un error con su nombre, no una ruta corta", () => {
  const rota = [TRES[0], { ...TRES[1], transitions: [{ to: "a", when: "solo rama", command: "/a" }] }, TRES[2]];
  assert.throws(() => path("a", rota), (e) => /\bB\b/.test(e.message) && /when/.test(e.message));
  assert.throws(() => path("a", [TRES[0], { ...TRES[1], transitions: [] }]), /\bB\b/);
});

test("buildRoute trae path y branches sobre el stations.json real; la tabla son las estaciones del path", async () => {
  const r = await buildRoute("JAR-8", { ...fakeWorld(), linearPrefix: "JAR" });
  assert.deepEqual(r.path, [
    { station: "build", name: "Build", command: "/build-kickoff JAR-8" },
    { station: "review", name: "Review", command: "/adversarial-review" },
    { station: "ship", name: "Ship / Learn", command: "/learnings JAR-8" },
  ]);
  assert.deepEqual(r.stations.map((s) => s.id), r.path.map((p) => p.station));
  assert.ok(r.branches.length >= 1);
  const bloqueador = r.branches.find((b) => /bloqueador/.test(b.when));
  assert.equal(bloqueador.to, "slice");
  assert.equal(bloqueador.skill, "to-tickets-linear");
  assert.match(bloqueador.command, /<equipo>/, "un placeholder sin dato queda visible");
  assert.deepEqual((await buildRoute("JAR-8", { ...fakeWorld(), linearPrefix: "JAR" })).next, r.next, "next no cambia");
});

test("una PR entra por Review y su path deja <key> visible en Ship; una idea recorre las cinco", async () => {
  const pr = await buildRoute("PR #4", fakeWorld());
  assert.deepEqual(pr.path.map((p) => p.command), ["/adversarial-review", "/learnings <key>"]);
  assert.equal(pr.branches.length, 1);
  assert.match(pr.branches[0].when, /reviewer/);
  const idea = await buildRoute("login mágico", fakeWorld());
  assert.deepEqual(idea.path.map((p) => p.station), ["shape", "slice", "build", "review", "ship"]);
  assert.equal(idea.path[0].command, "/buzz-kickoff docs/specs/login-magico.md");
  assert.equal(idea.path[1].command, "/to-tickets-linear docs/specs/login-magico.md");
  assert.deepEqual(idea.branches.map((b) => b.to), ["outside"]);
  const invalid = await buildRoute("", fakeWorld());
  assert.deepEqual([invalid.path, invalid.branches], [[], []]);
});

/* -------------------------------------------------------------- golden --- */

/* test/golden/*.md es la salida de renderMarkdown ANTES de que el wayfinder
   leyera transitions (capturada el 2026-09-12 con este mismo mundo). La
   salida de hoy es esa más las secciones "Ruta" y "Si te sales del camino"
   y, para un issue sin lector de Linear, la pregunta abierta "sin clave":
   quitándolas, tiene que ser idéntica (tabla y último renglón incluidos). */
const TODAS = ["buzz-kickoff", "grilling", "to-tickets-linear", "build-kickoff", "tdd", "git-conventions", "adversarial-review", "code-review", "learnings"];
const goldenWorld = () => ({ ...fakeWorld({ personal: TODAS }), linearPrefix: "JAR" });
const golden = (name) => readFileSync(join(here(), "golden", name), "utf8");
const sinSeccionesNuevas = (md) => md.replace(/## Ruta\n\n(?:.+\n)+\n/, "").replace(/## Si te sales del camino\n\n(?:.+\n)+\n/, "")
  .replace(/## Preguntas abiertas\n\n- no pude leer el estado de .+\n\n/, "");

test("golden JAR-8: la salida de hoy más Ruta y ramas, antes de Siguiente paso; el último renglón es el comando", async () => {
  const md = renderMarkdown(await buildRoute("JAR-8", goldenWorld()));
  assert.equal(sinSeccionesNuevas(md), golden("jar-8.md"));
  assert.match(md, /## Preguntas abiertas\n\n- no pude leer el estado de JAR-8 en Linear \(sin clave\); si ya está en revisión o mergeado, entra por Review o Ship\n/);
  assert.doesNotMatch(md, /está \*\*/, "sin lectura no hay línea de estado");
  assert.match(md, /## Ruta\n\n1\. Build — `\/build-kickoff JAR-8`\n2\. Review — `\/adversarial-review`\n3\. Ship \/ Learn — `\/learnings JAR-8`\n\n## Si te sales del camino\n\n- Si el issue destapa un bloqueador que no está en el plan: `\/to-tickets-linear <equipo> \(un issue que bloquea al actual; luego Build sobre el nuevo\)`\n- Si una PR cierra varios issues de la misma spec: `gh pr create --base main \(Closes <clave> por cada issue, sin rama nueva\)`\n\n## Preguntas abiertas/);
  assert.ok(md.indexOf("|---|") < md.indexOf("## Ruta"), "la tabla va antes de la ruta");
  assert.equal(md.trimEnd().split("\n").at(-1), "`/build-kickoff JAR-8`");
});

test("golden idea: cinco pasos con la spec rellena y la rama del otro plano", async () => {
  const md = renderMarkdown(await buildRoute("login con enlace mágico por email", goldenWorld()));
  assert.equal(sinSeccionesNuevas(md), golden("idea.md"));
  assert.match(md, /## Ruta\n\n1\. Shape — `\/buzz-kickoff docs\/specs\/login-con-enlace-magico-por\.md`\n2\. Slice — `\/to-tickets-linear docs\/specs\/login-con-enlace-magico-por\.md`\n3\. Build — `\/build-kickoff <key>`\n4\. Review — `\/adversarial-review`\n5\. Ship \/ Learn — `\/learnings <key>`\n/);
  assert.match(md, /## Si te sales del camino\n\n- Si la historia es del plano de trabajo/);
  assert.equal(md.trimEnd().split("\n").at(-1), "`/buzz-kickoff docs/specs/login-con-enlace-magico-por.md`");
});

test("golden PR mergeada: un solo paso y sin sección de ramas", async () => {
  const md = renderMarkdown(await buildRoute("PR #4 merged", goldenWorld()));
  assert.equal(sinSeccionesNuevas(md), golden("pr-merged.md"));
  assert.match(md, /## Ruta\n\n1\. Ship \/ Learn — `\/learnings <key>`\n\n## Siguiente paso/);
  assert.doesNotMatch(md, /Si te sales del camino/);
  assert.equal(md.trimEnd().split("\n").at(-1), "`/learnings <key>`");
});

test("las secciones nuevas van antes de las preguntas abiertas", async () => {
  const md = renderMarkdown(await buildRoute("una idea", fakeWorld({ git: false })));
  assert.ok(md.indexOf("## Ruta") < md.indexOf("## Si te sales del camino"));
  assert.ok(md.indexOf("## Si te sales del camino") < md.indexOf("## Preguntas abiertas"));
  assert.ok(md.indexOf("## Preguntas abiertas") < md.indexOf("## Siguiente paso"));
});

test("un ciclo en el camino feliz o dos transiciones sin when son stations.json roto, con el nombre de la estación", () => {
  const ciclo = [TRES[0], { ...TRES[1], transitions: [{ to: "a", command: "/a" }] }, TRES[2]];
  assert.throws(() => path("a", ciclo), (e) => /\bB\b/.test(e.message) && /ciclo/.test(e.message));
  const dos = [{ ...TRES[0], transitions: [{ to: "b", command: "/b" }, { to: "c", command: "/c" }] }, TRES[1], TRES[2]];
  assert.throws(() => path("a", dos), (e) => /\bA\b/.test(e.message) && /2 transiciones sin when/.test(e.message));
});

/* ------------------------------------------------------- entryForState --- */

/* La tabla del mapeo de la spec, fila a fila. Por categoría (`type`), nunca
   por nombre: el nombre lo edita un admin y la categoría no. */
test("entryForState: backlog y unstarted entran por Build, tengan o no PR abierta", () => {
  assert.equal(entryForState({ type: "backlog", name: "Backlog", pr: null }), "build");
  assert.equal(entryForState({ type: "unstarted", name: "Todo", pr: null }), "build");
  assert.equal(entryForState({ type: "backlog", name: "Backlog", pr: "open" }), "build");
});

test("entryForState: started sin PR es Build; started con PR abierta es Review", () => {
  assert.equal(entryForState({ type: "started", name: "In Progress", pr: null }), "build");
  assert.equal(entryForState({ type: "started", name: "In Review", pr: "open" }), "review");
});

test("entryForState: PR mergeada o completed entran por Ship", () => {
  assert.equal(entryForState({ type: "started", name: "In Review", pr: "merged" }), "ship");
  assert.equal(entryForState({ type: "backlog", name: "Backlog", pr: "merged" }), "ship");
  assert.equal(entryForState({ type: "completed", name: "Done", pr: null }), "ship");
  assert.equal(entryForState({ type: "completed", name: "Done", pr: "merged" }), "ship");
});

test("entryForState: canceled y duplicate no tienen ruta, ni con PR mergeada", () => {
  assert.equal(entryForState({ type: "canceled", name: "Canceled", pr: null }), null);
  assert.equal(entryForState({ type: "duplicate", name: "Duplicate", pr: null }), null);
  assert.equal(entryForState({ type: "canceled", name: "Canceled", pr: "merged" }), null);
});

/* ------------------------------------------------- estado desde Linear --- */

/* Un lector de estado de mentira: devuelve lo que se le da (o lanza) y
   cuenta cuántas veces se le llamó, para afirmar que ideas, specs y PRs no
   tocan Linear. */
function fakeReader(result) {
  const reader = async (key) => { reader.calls.push(key); if (result instanceof Error) throw result; return result; };
  reader.calls = [];
  return reader;
}
const linearWorld = (result) => ({ ...goldenWorld(), issueState: fakeReader(result) });

test("Done con PR mergeada entra por Ship: la salida dice de dónde salió el estado y termina con /learnings", async () => {
  const w = linearWorld({ type: "completed", name: "Done", pr: "merged" });
  const r = await buildRoute("JAR-8", w);
  assert.deepEqual(w.issueState.calls, ["JAR-8"]);
  assert.equal(r.entry, "ship");
  assert.deepEqual(r.stations.map((s) => s.id), ["ship"]);
  assert.deepEqual(r.path.map((p) => p.command), ["/learnings JAR-8"]);
  assert.deepEqual(r.branches, []);
  assert.equal(r.next.command, "/learnings JAR-8");
  assert.deepEqual(r.state, { source: "linear", type: "completed", name: "Done", pr: "merged" });
  assert.deepEqual(r.questions, []);
  const md = renderMarkdown(r);
  assert.match(md, /^JAR-8 está \*\*Done\*\* en Linear \(PR mergeada\) → entra por \*\*Ship \/ Learn\*\*$/m);
  assert.ok(md.indexOf("está **Done**") < md.indexOf("|---|"), "la línea de estado va antes de la tabla");
  assert.equal(md.trimEnd().split("\n").at(-1), "`/learnings JAR-8`");
});

test("started con PR abierta entra por Review; started sin PR y backlog siguen en Build, con la línea de estado", async () => {
  const review = await buildRoute("JAR-8", linearWorld({ type: "started", name: "In Review", pr: "open" }));
  assert.equal(review.entry, "review");
  assert.deepEqual(review.path.map((p) => p.station), ["review", "ship"]);
  assert.equal(review.next.command, "/adversarial-review");
  assert.match(renderMarkdown(review), /^JAR-8 está \*\*In Review\*\* en Linear \(PR abierta\) → entra por \*\*Review\*\*$/m);

  const started = await buildRoute("JAR-8", linearWorld({ type: "started", name: "In Progress", pr: null }));
  assert.equal(started.entry, "build");
  assert.equal(started.next.command, "/build-kickoff JAR-8");
  assert.deepEqual(started.state, { source: "linear", type: "started", name: "In Progress", pr: null });
  assert.match(renderMarkdown(started), /^JAR-8 está \*\*In Progress\*\* en Linear → entra por \*\*Build\*\*$/m, "sin PR no hay paréntesis");

  const backlog = await buildRoute("JAR-8", linearWorld({ type: "backlog", name: "Backlog", pr: null }));
  assert.equal(backlog.entry, "build");
  assert.deepEqual(backlog.questions, []);
  assert.equal(renderMarkdown(backlog).trimEnd().split("\n").at(-1), "`/build-kickoff JAR-8`");
});

test("canceled no tiene ruta: next null, una pregunta, y el markdown termina con la pregunta en vez de un comando", async () => {
  const r = await buildRoute("JAR-8", linearWorld({ type: "canceled", name: "Canceled", pr: null }));
  assert.equal(r.entry, null);
  assert.equal(r.next, null);
  assert.deepEqual([r.stations, r.path, r.branches], [[], [], []]);
  assert.deepEqual(r.state, { source: "linear", type: "canceled", name: "Canceled", pr: null });
  assert.deepEqual(r.questions, ["JAR-8 está cancelado en Linear: ¿reabrir o dejarlo?"]);
  const md = renderMarkdown(r);
  assert.match(md, /^JAR-8 está \*\*Canceled\*\* en Linear → sin ruta$/m);
  assert.doesNotMatch(md, /\|---\|/, "sin ruta no hay tabla");
  assert.doesNotMatch(md, /build-kickoff/);
  assert.equal(md.trimEnd().split("\n").at(-1), "JAR-8 está cancelado en Linear: ¿reabrir o dejarlo?");
  const dup = await buildRoute("JAR-8", linearWorld({ type: "duplicate", name: "Duplicate", pr: "merged" }));
  assert.equal(dup.next, null);
  assert.match(dup.questions[0], /duplicado/);
});

test("un lector que lanza no rompe la ruta: Build como siempre, state null y la causa en la pregunta", async () => {
  for (const [why, re] of [["sin red: timeout leyendo JAR-8 en Linear", /\(sin red: timeout/], ["JAR-8 no existe en Linear", /\(JAR-8 no existe en Linear\)/]]) {
    const r = await buildRoute("JAR-8", linearWorld(new Error(why)));
    assert.equal(r.entry, "build");
    assert.equal(r.state, null);
    assert.equal(r.next.command, "/build-kickoff JAR-8");
    assert.equal(r.questions.length, 1);
    assert.match(r.questions[0], /^no pude leer el estado de JAR-8 en Linear \(/);
    assert.match(r.questions[0], re);
    assert.match(r.questions[0], /entra por Review o Ship$/);
  }
});

test("sin lector (sin clave) no se llama a nada: Build, state null y la pregunta dice sin clave", async () => {
  const r = await buildRoute("JAR-8", { ...goldenWorld(), issueState: null });
  assert.equal(r.entry, "build");
  assert.equal(r.state, null);
  assert.deepEqual(r.questions, ["no pude leer el estado de JAR-8 en Linear (sin clave); si ya está en revisión o mergeado, entra por Review o Ship"]);
  const md = renderMarkdown(r);
  assert.doesNotMatch(md, /en Linear \(PR|está \*\*/);
  assert.equal(md.trimEnd().split("\n").at(-1), "`/build-kickoff JAR-8`");
});

test("por defecto, sin clave en el entorno, no hay lector: nada sale de la máquina", async () => {
  const w = { ...goldenWorld(), issueState: undefined, env: { HOME: "/nonexistent", LINEAR_KEY_FILE: "/nonexistent", JARVIIS_LINEAR_URL: "http://127.0.0.1:1/" } };
  const r = await buildRoute("JAR-8", w);
  assert.equal(r.state, null);
  assert.match(r.questions[0], /\(sin clave\)/);
});

test("idea, spec, PR y PR mergeada nunca invocan el lector; solo el issue", async () => {
  const reader = fakeReader({ type: "completed", name: "Done", pr: "merged" });
  const w = { ...fakeWorld({ specs: ["login.md"] }), issueState: reader };
  for (const input of ["login con enlace mágico", "docs/specs/login.md", "docs/specs/otra.md", "PR #4", "PR #4 merged", "JAR-12 en la PR #3", ""]) {
    const r = await buildRoute(input, w);
    assert.equal(r.state ?? null, null, input);
  }
  assert.deepEqual(reader.calls, []);
  await buildRoute("implementa JAR-12 ya", w);
  assert.deepEqual(reader.calls, ["JAR-12"]);
});

test("por defecto, con clave en el entorno, el lector es el cliente real de linear.mjs (aquí contra el stub)", async () => {
  const { linearStub } = await import("../../to-tickets-linear/test/stub.mjs");
  const stub = await linearStub({ issues: [{ identifier: "JAR-8", state: { name: "Done", type: "completed" }, attachments: [{ sourceType: "github", metadata: { status: "merged" } }] }] });
  try {
    const env = { HOME: "/nonexistent", LINEAR_API_KEY: "lin_test", JARVIIS_LINEAR_URL: stub.url };
    const r = await buildRoute("JAR-8", { ...goldenWorld(), issueState: undefined, env });
    assert.deepEqual(r.state, { source: "linear", type: "completed", name: "Done", pr: "merged" });
    assert.equal(r.next.command, "/learnings JAR-8");
    assert.deepEqual(stub.state.mutations, [], "el wayfinder no escribe en Linear");
  } finally { await stub.close(); }
});
