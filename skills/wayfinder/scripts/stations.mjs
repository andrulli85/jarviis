#!/usr/bin/env node
/* stations.mjs: la tabla de las cinco estaciones con su estado real en esta
   máquina, sin entrada.

   node stations.mjs [--json] [--check] [--probe] [--cwd DIR]

   Es `npm run stations`: comprobar de un vistazo si la fábrica está
   instalada (skills enlazadas) y si cada proveedor RESPONDE, no solo si está
   instalado. La regla de estado de las skills es la del wayfinder
   (stationStatus); la de los proveedores es `health()` de providers: verde
   solo con evidencia de respuesta en los últimos 7 días, `sin sondear` si no
   la hay. Sin --probe no gasta nada ni escribe nada; con --probe manda un
   "pong" a cada canal y deja el resultado en ~/.local/state/jarviis/health.json.

   Debajo va "Review pendiente": qué commits de este repo no han pasado por
   adversarial-review y el comando para saldarlos. Es informativa: no
   cambia el exit (D3).

   Exit: 0; con --check o --probe, 1 si hay algo que arreglar (skill rota o
   canal en quota/down/sin sondear); 2 si la flag no existe. */

import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { STATIONS, stationStatus, stationRow, providerCell, FACTORY_SKILLS } from "./route.mjs";
import { detectAuthor, health as providersHealth, HEALTH_CHANNELS, rfc3339, readEvidence, defaultEvidenceDir } from "../../../providers/index.mjs";

/* world: { cwd, skillsDir, pluginsDir, factoryDir, env, now, author,
   health, probe, evidenceDir, stateFile, exec, ask, review, git } —
   inyectable para que los tests no miren la máquina real: `health` y
   `review` ya calculadas se usan tal cual; si no, se piden a health() y a
   reviewDebt() con el resto (probe, rutas, exec, ask, git). */
export async function collectStations(world = {}) {
  const env = world.env || process.env;
  const now = world.now ? new Date(world.now) : new Date();
  const w = {
    cwd: world.cwd || process.cwd(),
    skillsDir: world.skillsDir || join(homedir(), ".claude", "skills"),
    pluginsDir: world.pluginsDir || join(homedir(), ".claude", "plugins"),
    factoryDir: world.factoryDir || FACTORY_SKILLS,
  };
  const h = world.health || await providersHealth(env, { probe: world.probe, evidenceDir: world.evidenceDir, stateFile: world.stateFile, exec: world.exec, ask: world.ask, now });
  const author = world.author !== undefined ? world.author : detectAuthor(env);
  const review = world.review || reviewDebt({ cwd: w.cwd, evidenceDir: world.evidenceDir || defaultEvidenceDir(env), git: world.git });
  /* stationStatus decide qué canal atiende cada estación mirando qué
     binarios hay y quién es el autor; la salud es otra pregunta y va aparte. */
  w.providers = { claude: h.claude.bin, codex: h.codex.bin, openrouter: h.openrouter.bin, author };
  return { stations: STATIONS.map((s) => stationStatus(s, w)), providers: h, review, author, now: rfc3339(now), cwd: w.cwd };
}

const BROKEN = new Set(["por construir", "sin enlazar", "otra copia"]);

/* ---------------------------------------------------- deuda de Review --- */

export const REVIEW_NOTE = "/code-review no deja evidencia y no cuenta";

/* git(args) → stdout recortado, o null si git falla (no es repo, objeto
   desconocido, `--is-ancestor` que dice que no). Inyectable en tests. */
function gitIn(cwd) {
  return (args) => {
    try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return null; }
  };
}

/* Qué commits de este repo no han pasado por adversarial-review (D2, D11).
   Cuenta como revisado cada `to` de una evidencia `ok:true` con veredicto
   que siga siendo ancestro de HEAD; un `to` que dejó de serlo (rebase,
   squash) no cuenta. La deuda es un conjunto, no un checkpoint: lo que HEAD
   alcanza y ningún `to` revisado alcanza. Solo el comando necesita un único
   `from`: el `to` si hay uno; con varios, su merge-base (sobreinclusivo,
   nunca subinclusivo, y la nota dice cuántos ya revisados arrastra).

   → { lastReviewed: [{ sha, at }], pending: [sha…], command, note } */
export function reviewDebt({ cwd = process.cwd(), evidenceDir = defaultEvidenceDir(process.env), git } = {}) {
  git ||= gitIn(cwd);
  const { records } = readEvidence({ evidenceDir });
  const byTo = new Map();
  for (const r of records) if (r.ok && r.verdict != null && r.to && !byTo.has(r.to)) byTo.set(r.to, r.at);
  const lastReviewed = [...byTo].filter(([to]) => git(["merge-base", "--is-ancestor", to, "HEAD"]) !== null).map(([sha, at]) => ({ sha, at: rfc3339(at) }));
  if (!lastReviewed.length) return { lastReviewed, pending: [], command: null, note: REVIEW_NOTE };
  const tos = lastReviewed.map((r) => r.sha);
  const pending = (git(["rev-list", "HEAD", ...tos.map((t) => `^${t}`)]) || "").split("\n").filter(Boolean);
  const from = pending.length ? commandFrom(git, tos) : null;
  if (!from) return { lastReviewed, pending, command: null, note: REVIEW_NOTE };
  const inRange = (git(["rev-list", "--count", `${from}..HEAD`]) || "0");
  const extra = Number(inRange) - pending.length;
  return { lastReviewed, pending, command: `/adversarial-review ${from.slice(0, 7)}..HEAD`, note: extra > 0 ? `${REVIEW_NOTE}; incluye ${extra} ya revisados` : REVIEW_NOTE };
}

/* El `from` del comando (D11). Un `to` alcanzado por otro `to` no aporta
   nada al conjunto, así que primero se quedan los independientes; con uno,
   ese mismo (rango exacto); con varios, su merge-base común, y si hay
   varias bases (criss-cross), la de fecha de commit más antigua, que
   incluye a las demás. Sin base común (historias sin relación) no hay
   rango que escribir. */
function commandFrom(git, tos) {
  const independent = (git(["merge-base", "--independent", ...tos]) || "").split("\n").filter(Boolean);
  if (independent.length === 1) return independent[0];
  const bases = (git(["merge-base", "--all", "--octopus", ...independent]) || "").split("\n").filter(Boolean);
  if (bases.length <= 1) return bases[0] || null;
  const dated = bases.map((b) => ({ b, t: Number(git(["show", "-s", "--format=%ct", b]) || 0) }));
  dated.sort((x, y) => x.t - y.t || (x.b < y.b ? -1 : 1));
  return dated[0].b;
}

/* Lo que impide que la fábrica funcione entera: skills que no responden o
   no son las de la fábrica, estaciones sin canal que las atienda, y canales
   sin evidencia reciente de respuesta (D3, D8). `manual` no es un fallo: la
   estación existe, solo pide un paso a mano. */
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
  for (const c of HEALTH_CHANNELS) {
    const h = r.providers[c];
    if (h.status === "unprobed") out.push(`${c}: sin evidencia reciente (7 d); corre npm run stations -- --probe`);
    else if (h.status === "quota") out.push(`${c}: sin cuota hasta ${localMinute(h.until)}`);
    else if (h.status === "down") out.push(`${c}: down: ${oneLine(h.why)}`);
  }
  return out;
}

/* ------------------------------------------------------------- render --- */

/* Las fechas de health() son RFC 3339 en zona local: el día y la hora se
   leen del texto, sin volver a convertir. */
const localDay = (at) => String(at).slice(0, 10);
const localMinute = (at) => String(at).slice(0, 16).replace("T", " ");
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 100);
const DAY = 24 * 3600 * 1000;

/* En la fila: cuándo respondió y cuánto tardó. En el pie: hace cuánto. */
function healthCell(h) {
  if (h.status === "ok") return `ok (${localDay(h.at)}${h.latency != null ? `, ${h.latency} s` : ""})`;
  return healthWord(h);
}
function healthFoot(h, now) {
  if (h.status === "ok") {
    const days = Math.floor((new Date(now) - new Date(h.at)) / DAY);
    return `ok (${days <= 0 ? "hoy" : `hace ${days} d`})`;
  }
  return healthWord(h);
}
function healthWord(h) {
  if (h.status === "quota") return `sin cuota hasta ${localMinute(h.until)}`;
  if (h.status === "down") return `down: ${oneLine(h.why)}`;
  return "sin sondear";
}

/* La celda de proveedor de una fila: el canal elegido con su salud; sin
   autor no hay familia opuesta que elegir y se muestran las dos. */
function providerWith(health) {
  return (p) => {
    if (!p) return "";
    if (p.available === null) return ` · opuesta al autor: claude ${healthCell(health.claude)} · codex ${healthCell(health.codex)}`;
    if (!p.available) return providerCell(p);
    return ` · proveedor: ${p.channel} ${healthCell(health[p.channel])}`;
  };
}

/* La tabla del wayfinder (misma fila, stationRow), el pie de proveedores y
   los arreglos. Sin "Siguiente paso": aquí no hay entrada que enrutar. */
export function renderStations(r) {
  const lines = [];
  lines.push("# Estaciones de la fábrica", "");
  lines.push("| # | Estación | Entrada → Salida | Skills | Estado |", "|---|---|---|---|---|");
  const provider = providerWith(r.providers);
  for (const s of r.stations) lines.push(stationRow(s, { provider }));
  lines.push("");
  const p = r.providers;
  const foot = HEALTH_CHANNELS.map((c) => `${c} ${healthFoot(p[c], r.now)}`).join(" · ");
  lines.push(`Proveedores: ${foot} · autor ${r.author?.family || "—"}${p.ignored > 0 ? ` · ignorados: ${p.ignored}` : ""}`, "");
  const fixes = r.stations.flatMap((s) => s.skills.filter((k) => k.link));
  const channels = failures({ stations: [], providers: p });
  if (fixes.length || channels.length) lines.push("## Arreglos", "");
  if (fixes.length) {
    lines.push("Enlaza y reinicia la sesión:", "");
    for (const k of fixes) lines.push(`\`${k.link}\``);
    lines.push("");
  }
  if (channels.length) {
    for (const f of channels) lines.push(`- ${f}`);
    lines.push("");
  }
  lines.push("## Review pendiente", "", reviewLine(r.review), "", r.review.note, "");
  return lines.join("\n");
}

/* Una línea: cuántos commits deben review y desde qué último review, con
   el comando que los salda; al día; o nada que decir en este repo. */
function reviewLine(d) {
  const last = d.lastReviewed[0];
  if (!last) return "sin evidencia de review en este repo";
  const sha7 = last.sha.slice(0, 7), day = localDay(last.at);
  if (!d.pending.length) return `al día (último review ${sha7}, ${day})`;
  const n = d.pending.length;
  return `${n} commit${n === 1 ? "" : "s"} sin review adversarial desde ${sha7} (${day}): \`${d.command}\``;
}

/* ---------------------------------------------------------------- main --- */

/* Comparado por ruta real, como en route.mjs: argv[1] puede ser un enlace. */
const invokedDirectly = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  let json = false, check = false, probe = false, cwd;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = true;
    else if (argv[i] === "--check") check = true;
    else if (argv[i] === "--probe") probe = true;
    else if (argv[i] === "--cwd") cwd = argv[++i];
    else { process.stderr.write(`stations: flag desconocida ${argv[i]}\nuso: stations.mjs [--json] [--check] [--probe] [--cwd DIR]\n`); process.exit(2); }
  }
  const r = await collectStations({ cwd, probe });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + "\n" : renderStations(r));
  /* Exit 0 salvo que se pida comprobar o sondear: entonces cualquier fallo
     es 1 (D7: --probe informa de los tres y falla si alguno falla). Bajo
     npm ≤ 10 eso añade su bloque `npm error`; es lo esperado (D6). */
  process.exit((check || probe) && failures(r).length ? 1 : 0);
}
