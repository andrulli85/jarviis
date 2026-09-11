#!/usr/bin/env node
/* route.mjs: de una entrada en texto libre a una ruta por la fábrica.

   node route.mjs [--json] [--cwd DIR] "<idea | JAR-12 | PR #4 | docs/specs/x.md>"

   Todo lo que hay aquí es determinista: qué tipo de entrada es, por qué
   estación entra, qué skills existen en esta máquina y qué proveedores
   responden. Lo que requiere juicio (qué preguntas hacer sobre la idea, si
   la spec está madura) lo hace la sesión leyendo la ruta, no este script.

   No ejecuta ninguna estación ni escribe nada. Imprime. */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
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
const issueRegex = (prefix) => prefix
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
   (personal, enlazada o no) o bajo la caché de plugins. Se mira el disco y no
   la lista de la sesión porque la lista es una foto de arranque. */
export function findSkill(name, { skillsDir, pluginsDir }) {
  const personal = join(skillsDir, name, "SKILL.md");
  if (existsSync(personal)) return { status: "existe", where: personal };
  const hit = walk(pluginsDir, name, 8);
  if (hit) return { status: "existe", where: hit };
  return { status: "por construir", where: null };
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
    if (!author) return { ...out, available: false, why: "no sé quién escribió el cambio (CE_REVIEW_AUTHOR)" };
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
    linearPrefix: world.linearPrefix ?? process.env.JARVIIS_LINEAR_PREFIX ?? null,
  };
  const text = String(input || "").trim();
  const c = classify(text, { linearPrefix: w.linearPrefix });
  if (c.kind === "invalid") return { kind: "invalid", input: text, why: "entrada vacía: dime una idea, una clave de issue, una PR o una spec", stations: [], questions: [], next: null };

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

  if (!existsSync(join(w.cwd, ".git"))) questions.push(`${w.cwd} no es un repositorio git: ¿en qué repo vive el producto?`);
  if (!w.linearPrefix && (c.kind === "idea" || c.kind === "spec")) questions.push("¿qué prefijo de proyecto Linear usa este producto? (JARVIIS_LINEAR_PREFIX)");

  const from = STATIONS.findIndex((s) => s.id === entry);
  const stations = STATIONS.slice(from).map((s) => {
    const skills = s.skills.map((name) => ({ name, ...findSkill(name, w) }));
    const provider = providerFor(s.provider, w.providers);
    const status = skills.some((k) => k.status !== "existe") ? "por construir" : s.manual ? "manual" : "existe";
    const fill = (t) => t && t.replace("<spec>", spec || "<spec>").replace("<key>", key || "<key>");
    return { n: s.n, id: s.id, name: s.name, in: s.in, out: s.out, skills, manual: fill(s.manual), provider, status, command: fill(s.command) };
  });
  const first = stations[0];
  const next = { station: first.id, name: first.name, command: first.command, status: first.status, manual: first.manual };
  return { kind: c.kind, input: text, key, pr: c.pr || null, spec, slug, entry, stations, questions, next, cwd: w.cwd };
}

/* ------------------------------------------------------------- render --- */

export function renderMarkdown(r) {
  if (r.kind === "invalid") return `**Sin ruta**: ${r.why}\n`;
  const lines = [];
  lines.push(`# Ruta: ${r.key || r.spec || r.input}`, "");
  lines.push(`Entrada: **${r.kind}** → entra por **${r.next.name}**. Slug \`${r.slug}\`.${r.spec ? ` Spec: \`${r.spec}\`.` : ""}`, "");
  lines.push("| # | Estación | Entrada → Salida | Skills | Estado |", "|---|---|---|---|---|");
  for (const s of r.stations) {
    const skills = s.skills.map((k) => `\`${k.name}\`${k.status === "existe" ? "" : " (por construir)"}`).join(", ");
    const prov = s.provider ? (s.provider.available ? ` · proveedor: ${s.provider.channel}` : ` · **proveedor no disponible**: ${s.provider.why}`) : "";
    lines.push(`| ${s.n} | ${s.name} | ${s.in} → ${s.out} | ${skills} | ${s.status}${s.manual ? ` — ${s.manual}` : ""}${prov} |`);
  }
  lines.push("");
  if (r.questions.length) { lines.push("## Preguntas abiertas", ""); for (const q of r.questions) lines.push(`- ${q}`); lines.push(""); }
  lines.push("## Siguiente paso", "");
  if (r.next.status === "por construir") lines.push(`La estación **${r.next.name}** no tiene skill todavía. Hazla a mano: ${r.stations[0].in} → ${r.stations[0].out}.`);
  else {
    if (r.next.manual) lines.push(`Manual primero: ${r.next.manual}.`, "");
    lines.push(`\`${r.next.command}\``);
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
