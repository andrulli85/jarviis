#!/usr/bin/env node
/* route.mjs: de una entrada en texto libre a una ruta por la fábrica.

   node route.mjs [--json] [--cwd DIR] "<idea | JAR-12 | PR #4 | docs/specs/x.md>"

   Todo lo que hay aquí es determinista: qué tipo de entrada es, por qué
   estación entra, qué camino feliz y qué ramas salen de ahí según las
   `transitions` de stations.json, qué skills existen en esta máquina y qué
   proveedores responden. Lo que requiere juicio (qué preguntas hacer sobre
   la idea, si la spec está madura, si una rama aplica) lo hace la sesión
   leyendo la ruta, no este script.

   No ejecuta ninguna estación ni escribe nada. Imprime. */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { status as providersStatus } from "../../../providers/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const STATIONS = JSON.parse(readFileSync(join(here, "..", "stations.json"), "utf8")).stations;

/* ------------------------------------------------------------ classify --- */

/* Una clave de Linear es PREFIJO-NÚMERO con el prefijo en mayúsculas. Sin
   prefijo configurado se exige eso literalmente, en mayúsculas, para que
   "utf-8" o "gpt-5" en una idea no la manden a Build; con
   JARVIIS_LINEAR_PREFIX se acepta solo ese prefijo, en cualquier caja, para
   que "jar-12" escrito deprisa siga siendo JAR-12. */
export const issueRegex = (prefix) => prefix
  ? new RegExp("(?<![\\p{L}\\d])(" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-\\d+)(?![\\p{L}\\d])", "iu")
  : /(?<![\p{L}\d])([A-Z]{2,10}-\d+)(?![\p{L}\d])/u;
const PR_URL = /github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/i;
/* "PR 4", "PR #4", "pull request 4". Un "#4" suelto no: en texto libre es un
   ordinal o una etiqueta más veces que una PR. */
const PR_REF = /(?<![\p{L}\d])(?:PR|pull request)\s*#?\s*(\d+)(?![\p{L}\d])/iu;
const SPEC = /\b(docs\/specs\/[\w.-]+\.md)\b/;
/* Con `u` y lookarounds: `\b` no sabe que ó es una letra y "mergeó" nunca
   cerraba palabra. */
const MERGED = /(?<!\p{L})(merged|mergead[ao]|mergeó|fusionad[ao])(?!\p{L})/iu;

/* Orden: PR gana a issue gana a spec gana a idea. Una PR que menciona su
   clave sigue siendo una PR; un issue que describe la idea sigue siendo un
   issue. Lo más avanzado en la línea manda, porque lo anterior ya pasó. */
export function classify(input, { linearPrefix = null } = {}) {
  const text = String(input || "").trim();
  if (!text) return { kind: "invalid" };
  const url = text.match(PR_URL);
  const ref = url ? null : text.match(PR_REF);
  const pr = url ? url[1] : ref ? ref[1] : null;
  if (pr) return { kind: MERGED.test(text) ? "merged" : "pr", pr };
  const issue = text.match(issueRegex(linearPrefix));
  if (issue && !/^docs\//.test(text)) return { kind: "issue", key: issue[1].toUpperCase() };
  const spec = text.match(SPEC);
  if (spec) return { kind: "spec", spec: spec[1] };
  return { kind: "idea" };
}

/* ------------------------------------------------------------- slugify --- */

export function slugify(text, max = 5) {
  const words = String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join("-") || "sin-titulo";
}

/* --------------------------------------------------------- availability --- */

/* Una skill existe si hay un SKILL.md bajo su nombre en ~/.claude/skills
   (personal, enlazada o no), en .claude/skills del repo actual, o bajo la
   caché de plugins. Se mira el disco y no la lista de la sesión porque la
   lista es una foto de arranque.

   Tercer estado: la skill está en skills/ de la fábrica pero no enlazada en
   ninguno de esos sitios. No es invocable, así que no "existe", pero
   tampoco hay que construirla: hay que enlazarla, y se dice cómo.

   Cuarto: la fábrica la tiene y la personal existe, pero su ruta real cae
   fuera de la fábrica (un enlace a otra copia, o una copia suelta). Es
   invocable, así que no bloquea, pero no es la que se mantiene aquí: se da
   el `ln -sfn` que la reapunta. */
export const FACTORY_SKILLS = factorySkillsDir(here);

/* skills/ del checkout principal, no del checkout desde el que corre este
   archivo: desde un worktree (Conductor) `here/../..` sería el skills/ del
   worktree, y toda skill enlazada al principal saldría "otra copia" con un
   `ln -sfn` a un directorio que desaparece al cerrar el workspace. El
   git-common-dir es `<principal>/.git` desde cualquier worktree; sin git
   alrededor, o sin `git`, se queda con lo que hay. */
function factorySkillsDir(from) {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: from, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return join(dirname(common), "skills");
  } catch { return join(from, "..", ".."); }
}
export function findSkill(name, { skillsDir, pluginsDir, cwd, factoryDir = FACTORY_SKILLS }) {
  const personal = join(skillsDir, name, "SKILL.md");
  const factory = join(factoryDir, name, "SKILL.md");
  if (existsSync(personal)) {
    if (existsSync(factory) && !insideFactory(personal, factoryDir)) {
      return { status: "otra copia", where: realpathSync(personal), link: `ln -sfn ${join(factoryDir, name)} ${join(skillsDir, name)}` };
    }
    return { status: "existe", where: personal };
  }
  if (cwd) {
    const project = join(cwd, ".claude", "skills", name, "SKILL.md");
    if (existsSync(project)) return { status: "existe", where: project };
  }
  const hit = walk(pluginsDir, name, 8);
  if (hit) return { status: "existe", where: hit };
  if (existsSync(factory)) return { status: "sin enlazar", where: factory, link: `ln -s ${join(factoryDir, name)} ${join(skillsDir, name)}` };
  return { status: "por construir", where: null };
}

/* Rutas reales a ambos lados y `relative`, no `startsWith`: /a/jarviis
   aceptaría /a/jarviis-old/... como propio. */
function insideFactory(file, factoryDir) {
  const rel = relative(realpathSync(factoryDir), realpathSync(file));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function walk(dir, name, depth) {
  if (depth < 0 || !dir || !existsSync(dir)) return null;
  let entries;
  try { entries = readdirSync(dir); } catch { return null; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (e === name && existsSync(join(p, "SKILL.md"))) return join(p, "SKILL.md");
    const deeper = walk(p, name, depth - 1);
    if (deeper) return deeper;
  }
  return null;
}

function providerFor(spec, providers) {
  if (!spec) return null;
  const out = { need: spec.need };
  if (spec.opposite === "author") {
    const author = providers.author?.family || null;
    out.opposite = author;
    /* Sin autor no hay opuesto que elegir: `null` (no "no disponible") y
       los dos canales, para que quien lea decida con qué familia revisar. */
    if (!author) return { ...out, available: null, channels: { claude: providers.claude || null, codex: providers.codex || null }, why: "no sé quién escribió el cambio (CE_REVIEW_AUTHOR)" };
    const channel = { claude: "codex", gpt: "claude" }[author];
    if (!channel) return { ...out, available: false, why: `no hay familia opuesta registrada a "${author}"; conozco claude y gpt` };
    out.channel = channel;
    out.available = Boolean(providers[channel]);
    if (!out.available) out.why = `hace falta ${channel} (familia opuesta a ${author}) y no hay binario`;
    return out;
  }
  out.channel = providers.claude ? "claude" : providers.codex ? "codex" : null;
  out.available = Boolean(out.channel);
  if (!out.available) out.why = "no hay binario de claude ni de codex";
  return out;
}

/* ------------------------------------------------------- stationStatus --- */

/* Estado de una estación en esta máquina: sus skills, su proveedor y el
   agregado. `command` y `manual` salen con las plantillas (<spec>, <key>)
   sin rellenar: eso depende de la entrada, no de la máquina. Una sola copia
   de la regla, para que el wayfinder y `stations.mjs` no diverjan. */
export function stationStatus(s, w) {
  const skills = s.skills.map((name) => ({ name, ...findSkill(name, w) }));
  const provider = providerFor(s.provider, w.providers);
  const status = skills.some((k) => k.status === "por construir") ? "por construir"
    : skills.some((k) => k.status === "sin enlazar") ? "sin enlazar"
    : skills.some((k) => k.status === "otra copia") ? "otra copia"
    : s.manual ? "manual" : "existe";
  return { n: s.n, id: s.id, name: s.name, in: s.in, out: s.out, skills, manual: s.manual, provider, status, command: s.command };
}

/* ---------------------------------------------------------------- path --- */

/* El camino feliz desde `entry`: en cada estación, la única transición sin
   `when`; se para en `end` u `outside`. El primer paso lleva el comando de la
   estación de entrada (lo que se corre al entrar); cada paso siguiente, el
   comando de la transición que lo alcanza. `fill` rellena los placeholders
   con lo que la entrada sabe; lo que no se sabe queda visible.

   Una estación intermedia sin transición feliz no acorta la ruta, dos
   transiciones felices no eligen la primera, y un ciclo no da vueltas: las
   tres son stations.json roto, y se dicen con nombre. */
export function path(entry, stations = STATIONS, fill = (t) => t) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const first = byId.get(entry);
  if (!first) throw new Error(`estación de entrada desconocida: ${entry}`);
  const steps = [{ station: first.id, name: first.name, command: fill(first.command) }];
  const seen = new Set([first.id]);
  let s = first;
  for (;;) {
    const happy = (s.transitions || []).filter((t) => !t.when);
    if (happy.length === 0) throw new Error(`la estación ${s.name} no tiene transición sin when: stations.json está roto`);
    if (happy.length > 1) throw new Error(`la estación ${s.name} tiene ${happy.length} transiciones sin when y el camino feliz es una sola: stations.json está roto`);
    const [t] = happy;
    if (t.to === "end" || t.to === "outside") return steps;
    const to = byId.get(t.to);
    if (!to) throw new Error(`la estación ${s.name} transiciona a "${t.to}", que no es una estación ni end/outside`);
    if (seen.has(to.id)) throw new Error(`la estación ${s.name} vuelve a ${to.name} por el camino feliz: ciclo en stations.json`);
    seen.add(to.id);
    steps.push({ station: to.id, name: to.name, command: fill(t.command) });
    s = to;
  }
}

/* Las ramas de la estación de entrada: sus transiciones con `when`. Solo la
   entrada; las de las estaciones siguientes se verán al llegar a ellas. Se
   muestran, no se detectan: `when` es texto para quien lee. */
export function branches(entry, stations = STATIONS, fill = (t) => t) {
  const s = stations.find((x) => x.id === entry);
  if (!s) throw new Error(`estación de entrada desconocida: ${entry}`);
  return (s.transitions || []).filter((t) => t.when).map((t) => ({ when: t.when, to: t.to, command: fill(t.command), skill: t.skill || null }));
}

/* ------------------------------------------------------- entryForState --- */

/* Por qué estación entra un issue según su estado en Linear: la categoría
   (`type`, que un admin no edita; el nombre sí) y la PR adjunta. La tabla
   de la spec, en orden de precedencia: un issue cancelado no tiene ruta
   aunque su PR haya mergeado (reabrirlo es una decisión, no un comando);
   una PR mergeada o un estado completed van a Ship; started con PR abierta
   está en revisión; todo lo demás es Build, que es lo que hacía el
   wayfinder sin leer Linear. */
export function entryForState(state) {
  if (!state) return "build";
  if (state.type === "canceled" || state.type === "duplicate") return null;
  if (state.pr === "merged" || state.type === "completed") return "ship";
  if (state.type === "started" && state.pr === "open") return "review";
  return "build";
}

/* ---------------------------------------------------------- buildRoute --- */

const ENTRY_KIND = { idea: "shape", spec: "slice", issue: "build", pr: "review", merged: "ship" };

/* world: { cwd, skillsDir, pluginsDir, providers, linearPrefix } — todo
   inyectable para que los tests no miren la máquina real. */
export function buildRoute(input, world = {}) {
  const w = {
    cwd: world.cwd || process.cwd(),
    skillsDir: world.skillsDir || join(homedir(), ".claude", "skills"),
    pluginsDir: world.pluginsDir || join(homedir(), ".claude", "plugins"),
    providers: world.providers || providersStatus(),
    factoryDir: world.factoryDir || FACTORY_SKILLS,
    /* `undefined` = no dicho, mira el entorno; `null` = dicho que no hay.
       Los tests pasan null para no heredar el JARVIIS_LINEAR_PREFIX real. */
    linearPrefix: world.linearPrefix !== undefined ? world.linearPrefix : (process.env.JARVIIS_LINEAR_PREFIX || null),
  };
  const text = String(input || "").trim();
  const c = classify(text, { linearPrefix: w.linearPrefix });
  if (c.kind === "invalid") return { kind: "invalid", input: text, why: "entrada vacía: dime una idea, una clave de issue, una PR o una spec", stations: [], path: [], branches: [], questions: [], next: null };

  const questions = [];
  let entry = ENTRY_KIND[c.kind];
  let spec = null, key = c.key || null, slug;

  if (c.kind === "idea") { slug = slugify(text); spec = `docs/specs/${slug}.md`; }
  else if (c.kind === "spec") {
    spec = c.spec; slug = c.spec.replace(/^docs\/specs\//, "").replace(/\.md$/, "");
    if (!existsSync(join(w.cwd, c.spec))) {
      questions.push(`la spec ${c.spec} no existe en ${w.cwd}; la ruta vuelve a Shape para escribirla`);
      entry = "shape";
    }
  } else slug = slugify(key || `pr-${c.pr}`);

  /* Sin prefijo configurado, un token en mayúsculas con guion y número es
     tan clave de issue como estándar técnico (UTF-8, SHA-256). Sin prefijo
     se toma como clave, que es lo que Andres escribe cuando pega una, y se
     pregunta; con prefijo no hay duda. */
  if (c.kind === "issue" && !w.linearPrefix) {
    questions.push(`he leído ${key} como clave de issue; si es un término técnico y no una clave, dímelo. Con JARVIIS_LINEAR_PREFIX no hay ambigüedad`);
  }
  if (!existsSync(join(w.cwd, ".git"))) questions.push(`${w.cwd} no es un repositorio git: ¿en qué repo vive el producto?`);
  if (!w.linearPrefix && (c.kind === "idea" || c.kind === "spec")) questions.push("¿qué prefijo de proyecto Linear usa este producto? (JARVIIS_LINEAR_PREFIX)");

  const fill = (t) => t && t.replace("<spec>", spec || "<spec>").replace("<key>", key || "<key>");
  /* La tabla son las estaciones del camino feliz, en el orden del recorrido,
     no las que siguen a la entrada por índice. Con la línea lineal de hoy da
     lo mismo; con una rama en el camino feliz, no. */
  const route = path(entry, STATIONS, fill);
  const stations = route.map((p) => {
    const st = stationStatus(STATIONS.find((s) => s.id === p.station), w);
    return { ...st, manual: fill(st.manual), command: fill(st.command) };
  });
  const first = stations[0];
  const next = { station: first.id, name: first.name, command: first.command, status: first.status, manual: first.manual };
  return { kind: c.kind, input: text, key, pr: c.pr || null, spec, slug, entry, stations, path: route, branches: branches(entry, STATIONS, fill), questions, next, cwd: w.cwd };
}

/* ------------------------------------------------------------- render --- */

/* Una fila de la tabla de estaciones, a partir de lo que devuelve
   stationStatus. Compartida con stations.mjs para que el formato no diverja;
   solo la celda del proveedor se puede sustituir (`provider`), porque sin
   autor el wayfinder dice por qué no elige y stations.mjs lista las dos
   familias. */
export function providerCell(p) {
  if (!p) return "";
  return p.available ? ` · proveedor: ${p.channel}` : ` · **proveedor no disponible**: ${p.why}`;
}
export function stationRow(s, { provider = providerCell } = {}) {
  const skills = s.skills.map((k) => `\`${k.name}\`${k.status === "existe" ? "" : ` (${k.status})`}`).join(", ");
  return `| ${s.n} | ${s.name} | ${s.in} → ${s.out} | ${skills} | ${s.status}${s.manual ? ` — ${s.manual}` : ""}${provider(s.provider)} |`;
}

export function renderMarkdown(r) {
  if (r.kind === "invalid") return `**Sin ruta**: ${r.why}\n`;
  const lines = [];
  lines.push(`# Ruta: ${r.key || r.spec || r.input}`, "");
  lines.push(`Entrada: **${r.kind}** → entra por **${r.next.name}**. Slug \`${r.slug}\`.${r.spec ? ` Spec: \`${r.spec}\`.` : ""}`, "");
  lines.push("| # | Estación | Entrada → Salida | Skills | Estado |", "|---|---|---|---|---|");
  for (const s of r.stations) lines.push(stationRow(s));
  lines.push("");
  /* El camino feliz paso a paso y, solo para la estación de entrada, sus
     ramas. Van antes de "Siguiente paso" para que el último renglón siga
     siendo un solo comando copiable. */
  lines.push("## Ruta", "");
  r.path.forEach((p, i) => lines.push(`${i + 1}. ${p.name}${p.command ? ` — \`${p.command}\`` : ""}`));
  lines.push("");
  if (r.branches.length) { lines.push("## Si te sales del camino", ""); for (const b of r.branches) lines.push(`- Si ${b.when}: \`${b.command}\``); lines.push(""); }
  if (r.questions.length) { lines.push("## Preguntas abiertas", ""); for (const q of r.questions) lines.push(`- ${q}`); lines.push(""); }
  lines.push("## Siguiente paso", "");
  if (r.next.status === "por construir") lines.push(`La estación **${r.next.name}** no tiene skill todavía. Hazla a mano: ${r.stations[0].in} → ${r.stations[0].out}.`);
  else if (r.next.status === "sin enlazar") {
    lines.push(`La estación **${r.next.name}** tiene skill en la fábrica pero no está enlazada. Enlaza y reinicia la sesión:`, "");
    for (const k of r.stations[0].skills.filter((k) => k.status === "sin enlazar")) lines.push(`\`${k.link}\``);
    lines.push("", `Después: \`${r.next.command}\``);
  } else {
    if (r.next.manual) lines.push(`Manual primero: ${r.next.manual}.`, "");
    lines.push(`\`${r.next.command}\``);
    /* Otra copia no bloquea: la skill responde, pero no es la que la fábrica
       mantiene. Se da el arreglo después del comando. */
    if (r.next.status === "otra copia") {
      lines.push("", `Ojo: skill en otra copia, no en la fábrica. Reapunta y reinicia la sesión:`, "");
      for (const k of r.stations[0].skills.filter((k) => k.status === "otra copia")) lines.push(`\`${k.link}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/* ---------------------------------------------------------------- main --- */

/* Comparado por ruta real: el skill se enlaza desde ~/.claude/skills y
   argv[1] trae el enlace mientras import.meta.url trae el destino. */
const invokedDirectly = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  let json = false, cwd;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--cwd") cwd = argv[++i];
    else rest.push(argv[i]);
  }
  let input = rest.join(" ");
  if (rest.length === 0 && !process.stdin.isTTY) {
    try { const chunks = []; for await (const c of process.stdin) chunks.push(c); input = Buffer.concat(chunks).toString("utf8"); }
    catch { /* stdin no legible: se trata como vacío */ }
  }
  const r = buildRoute(input, { cwd });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + "\n" : renderMarkdown(r));
  process.exit(r.kind === "invalid" ? 2 : 0);
}
