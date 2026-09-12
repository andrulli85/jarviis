#!/usr/bin/env node
/* stations.mjs: la tabla de las cinco estaciones con su estado real en esta
   máquina, sin entrada.

   node stations.mjs [--json] [--check] [--cwd DIR]

   Es `npm run stations`: comprobar de un vistazo si la fábrica está
   instalada (skills enlazadas, proveedores) y, con --check, desde un script.
   La regla de estado es la del wayfinder (stationStatus); aquí solo se
   recorre entera y se resume. No ejecuta nada ni escribe nada. Imprime. */

import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { STATIONS, stationStatus, stationRow, providerCell, FACTORY_SKILLS } from "./route.mjs";
import { status as providersStatus } from "../../../providers/index.mjs";

/* world: { cwd, skillsDir, pluginsDir, providers, factoryDir } — el mismo
   que buildRoute, inyectable para que los tests no miren la máquina real. */
export function collectStations(world = {}) {
  const w = {
    cwd: world.cwd || process.cwd(),
    skillsDir: world.skillsDir || join(homedir(), ".claude", "skills"),
    pluginsDir: world.pluginsDir || join(homedir(), ".claude", "plugins"),
    providers: world.providers || providersStatus(),
    factoryDir: world.factoryDir || FACTORY_SKILLS,
  };
  return { stations: STATIONS.map((s) => stationStatus(s, w)), providers: w.providers, cwd: w.cwd };
}

const BROKEN = new Set(["por construir", "sin enlazar", "otra copia"]);

/* Lo que impide que la fábrica funcione entera: skills que no responden o
   no son las de la fábrica. `manual` no es un fallo: la estación existe,
   solo pide un paso a mano. */
export function failures(r) {
  const out = [];
  for (const s of r.stations) {
    for (const k of s.skills) if (BROKEN.has(k.status)) out.push(`${s.name}: skill \`${k.name}\` ${k.status}`);
    const p = s.provider;
    if (!p) continue;
    if (p.available === false) out.push(`${s.name}: ${p.why}`);
    /* Sin autor, cada familia que falte es un fallo: la revisión puede
       tocar a cualquiera de las dos. */
    if (p.available === null) for (const [family, bin] of Object.entries(p.channels)) if (!bin) out.push(`${s.name}: falta ${family} (familia opuesta al autor, desconocido)`);
  }
  return out;
}

/* ------------------------------------------------------------- render --- */

/* Sin autor no hay familia opuesta que elegir; aquí interesa si las dos
   están, no por qué no se elige una. */
const mark = (bin) => (bin ? "✓" : "✗");
function provider(p) {
  if (p && p.available === null) return ` · opuesta al autor: claude ${mark(p.channels.claude)} · codex ${mark(p.channels.codex)}`;
  return providerCell(p);
}

/* La tabla del wayfinder (misma fila, stationRow), el pie de proveedores y
   los arreglos. Sin "Siguiente paso": aquí no hay entrada que enrutar. */
export function renderStations(r) {
  const lines = [];
  lines.push("# Estaciones de la fábrica", "");
  lines.push("| # | Estación | Entrada → Salida | Skills | Estado |", "|---|---|---|---|---|");
  for (const s of r.stations) lines.push(stationRow(s, { provider }));
  lines.push("");
  const p = r.providers;
  const or = (v) => v || "—";
  lines.push(`Proveedores: claude ${or(p.claude)} · codex ${or(p.codex)} · openrouter ${or(p.openrouter)} · autor ${or(p.author?.family)}`, "");
  const fixes = r.stations.flatMap((s) => s.skills.filter((k) => k.link));
  if (fixes.length) {
    lines.push("## Arreglos", "", "Enlaza y reinicia la sesión:", "");
    for (const k of fixes) lines.push(`\`${k.link}\``);
    lines.push("");
  }
  return lines.join("\n");
}

/* ---------------------------------------------------------------- main --- */

/* Comparado por ruta real, como en route.mjs: argv[1] puede ser un enlace. */
const invokedDirectly = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  let json = false, check = false, cwd;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--check") check = true;
    else if (argv[i] === "--cwd") cwd = argv[++i];
    else { process.stderr.write(`stations: flag desconocida ${argv[i]}\nuso: stations.mjs [--json] [--check] [--cwd DIR]\n`); process.exit(2); }
  }
  const r = collectStations({ cwd });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + "\n" : renderStations(r));
  /* Exit 0 salvo que se pida comprobar: entonces cualquier fallo es 1. Bajo
     npm ≤ 10 eso añade su bloque `npm error`; es lo esperado (D6). */
  process.exit(check && failures(r).length ? 1 : 0);
}
