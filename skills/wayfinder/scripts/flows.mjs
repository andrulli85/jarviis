#!/usr/bin/env node
/* flows.mjs: el mapa end to end de la fábrica, generado desde stations.json.

   node flows.mjs [--check] [--out RUTA]

   Es `npm run flows`: escribe docs/flows.md (diagrama Mermaid de estaciones
   y transiciones, tabla de ramas, tabla de entradas y los recorridos reales
   leídos del frontmatter de docs/specs/*.md). Con --check no escribe: sale 1
   si el archivo commiteado difiere de lo generado, 0 si coincide.

   stations.json sigue siendo la única fuente de la línea; aquí solo se lee
   su campo `transitions`, que route.mjs y stations.mjs ignoran.

   Salida: 0 generado o al día · 1 --check con diferencias · 2 flag
   desconocida. */

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const STATIONS_PATH = join(here, "..", "stations.json");
export const SPECS_DIR = join(here, "..", "..", "..", "docs", "specs");
export const FLOWS_PATH = join(here, "..", "..", "..", "docs", "flows.md");

/* Destinos que no son una estación: salir de la línea (Ship) y "no
   aterriza" (los artefactos se quedan fuera del plano personal). `end` es
   palabra reservada en Mermaid, de ahí el id de nodo propio. */
const EXITS = { end: { node: "fin", label: "fin" }, outside: { node: "fuera", label: "no aterriza" } };

/* --------------------------------------------------------- frontmatter --- */

/* Lo justo del YAML que llevan las specs: `clave: valor`, con valor escalar
   (comillas opcionales, null) o lista en línea `[a, b]`. Sin frontmatter
   devuelve null. */
export function frontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const scalar = (v) => {
    v = v.trim();
    if (v === "null" || v === "~" || v === "") return null;
    if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
    return v;
  };
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    out[k] = /^\[.*\]$/.test(v.trim()) ? v.trim().slice(1, -1).split(",").map(scalar).filter((x) => x !== null) : scalar(v);
  }
  return out;
}

/* Un recorrido es una spec que ya pasó por Slice: `issue` no nulo. Se lee
   solo el frontmatter; lo que se hizo lo cuentan la spec, el grill y los
   learnings, aquí solo se enlazan. */
function collectRuns(specsDir) {
  if (!existsSync(specsDir)) return [];
  const runs = [];
  for (const file of readdirSync(specsDir).filter((f) => f.endsWith(".md")).sort()) {
    const fm = frontmatter(readFileSync(join(specsDir, file), "utf8"));
    if (!fm || fm.issue === null || fm.issue === undefined) continue;
    const list = (v) => (v === null || v === undefined ? [] : [].concat(v));
    runs.push({ file, title: fm.title || file, status: fm.status || null, issue: list(fm.issue), grill: fm.grill || null, learnings: list(fm.learnings) });
  }
  return runs;
}

/* ------------------------------------------------------------- collect --- */

export function collectFlows({ stationsPath = STATIONS_PATH, specsDir = SPECS_DIR } = {}) {
  const stations = JSON.parse(readFileSync(stationsPath, "utf8")).stations;
  const ids = new Set(stations.map((s) => s.id));
  const transitions = [];
  for (const s of stations) {
    for (const t of s.transitions || []) {
      if (!ids.has(t.to) && !(t.to in EXITS)) throw new Error(`${s.name}: transición a \`${t.to}\`, que no es una estación ni end/outside`);
      transitions.push({ from: s.id, to: t.to, when: t.when || null, command: t.command || null, skill: t.skill || null });
    }
  }
  return { stations, transitions, runs: collectRuns(specsDir) };
}

/* -------------------------------------------------------------- render --- */

const node = (id) => EXITS[id]?.node || id;

function mermaid(r) {
  const lines = ["```mermaid", "flowchart LR"];
  for (const s of r.stations) lines.push(`  ${s.id}["${s.name}"]`);
  for (const [id, x] of Object.entries(EXITS)) if (r.transitions.some((t) => t.to === id)) lines.push(`  ${x.node}(["${x.label}"])`);
  for (const t of r.transitions) lines.push(t.when ? `  ${node(t.from)} -.->|"${t.when}"| ${node(t.to)}` : `  ${node(t.from)} --> ${node(t.to)}`);
  lines.push("```");
  return lines;
}

const code = (v) => (v ? `\`${v}\`` : "—");

/* Los enlaces se escriben relativos a docs/, donde vive flows.md; las rutas
   del frontmatter van desde la raíz del repo. Las de learnings (`vault/…`)
   apuntan al vault y se dejan tal cual. */
const fromDocs = (p) => p.replace(/^docs\//, "");

export function renderFlows(r) {
  const name = Object.fromEntries(r.stations.map((s) => [s.id, s.name]));
  const to = (id) => name[id] || `*(${EXITS[id].label})*`;
  const lines = [];
  lines.push("# Flujos de la fábrica", "");
  lines.push("Generado por `npm run flows` desde `skills/wayfinder/stations.json`; no se edita a mano.", "");
  lines.push(...mermaid(r), "");
  lines.push("## Ramas", "");
  lines.push("| Desde | Cuándo | Adónde | Comando | Skill |", "|---|---|---|---|---|");
  for (const t of r.transitions) if (t.when) lines.push(`| ${name[t.from]} | ${t.when} | ${to(t.to)} | ${code(t.command)} | ${code(t.skill)} |`);
  lines.push("");
  lines.push("## Entradas", "");
  lines.push("| Entrada | Estación | Comando |", "|---|---|---|");
  for (const s of r.stations) for (const e of s.entry || []) lines.push(`| ${e} | ${s.name} | ${code(s.command)} |`);
  lines.push("");
  lines.push("## Recorridos", "");
  lines.push("| Trabajo | Estado | Issues | Grill | Learnings |", "|---|---|---|---|---|");
  for (const run of r.runs) {
    const grill = run.grill ? `[grill](${fromDocs(run.grill)})` : "—";
    const learnings = run.learnings.length ? run.learnings.map((l) => `[${basename(l, ".md")}](${l})`).join(", ") : "—";
    lines.push(`| [${run.title}](specs/${run.file}) | ${run.status || "—"} | ${run.issue.join(", ") || "—"} | ${grill} | ${learnings} |`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

/* ---------------------------------------------------------------- main --- */

/* Comparado por ruta real, como en route.mjs: argv[1] puede ser un enlace. */
const invokedDirectly = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  let check = false, out = FLOWS_PATH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") check = true;
    else if (argv[i] === "--out") out = argv[++i];
    else { process.stderr.write(`flows: flag desconocida ${argv[i]}\nuso: flows.mjs [--check] [--out RUTA]\n`); process.exit(2); }
  }
  const md = renderFlows(collectFlows());
  if (check) {
    const current = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (current === md) process.exit(0);
    process.stderr.write(`flows: ${out} ${current === null ? "no existe" : "está viejo"}; regenera con npm run flows\n`);
    process.exit(1);
  }
  writeFileSync(out, md);
  process.stdout.write(`flows: escrito ${out}\n`);
}
