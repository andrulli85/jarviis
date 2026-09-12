/* evidence.mjs: los JSON que `adversarial-review` deja en
   ~/.claude/adversarial-reviews/, leídos con una sola regla (D9 de
   docs/specs/stations-check-proveedores-y-review.md).

   Dos consumidores, una copia: la salud de proveedores (`health()` en
   index.mjs, que mira `agent` y `ok` de cualquier repo) y la deuda de Review
   (`reviewDebt()` en stations.mjs, que mira `to` y `verdict` de este repo).
   Si la regla de qué archivo cuenta y de qué instante lleva viviera en dos
   sitios, divergirían.

   readEvidence({ evidenceDir, now }) → { records, ignored }
     records  [{ at: Date, agent, ok, why, to, verdict, file }], del más
              reciente al más viejo
     ignored  cuántos archivos .json no cuentan: no parsean, no traen
              `agent`, su instante es futuro, o no son archivos regulares

   El instante es el timestamp del nombre (`2026-09-11T22-00-30-700-…`, en
   UTC, que es como lo escribe adversarial-review); si el nombre no lo lleva,
   el `mtime`. Un instante futuro no es evidencia de nada: un reloj mal
   puesto no puede subir la salud. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})/;

export function stampFromName(name) {
  const m = name.match(STAMP);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m.map(Number);
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms));
  return Number.isNaN(at.getTime()) ? null : at;
}

export function readEvidence({ evidenceDir, now = new Date() } = {}) {
  const limit = now instanceof Date ? now.getTime() : Number(now);
  if (!evidenceDir || !existsSync(evidenceDir)) return { records: [], ignored: 0 };
  const records = [];
  let ignored = 0;
  for (const name of readdirSync(evidenceDir)) {
    if (!name.endsWith(".json")) continue;
    const file = join(evidenceDir, name);
    let st;
    try { st = statSync(file); } catch { ignored++; continue; }
    if (!st.isFile()) { ignored++; continue; }
    let body;
    try { body = JSON.parse(readFileSync(file, "utf8")); } catch { ignored++; continue; }
    if (!body || typeof body !== "object" || typeof body.agent !== "string" || !body.agent) { ignored++; continue; }
    const at = stampFromName(name) || st.mtime;
    if (at.getTime() > limit) { ignored++; continue; }
    records.push({ at, agent: body.agent, ok: body.ok === true, why: body.why ?? null, to: body.to ?? null, verdict: body.verdict ?? null, file });
  }
  records.sort((a, b) => b.at - a.at);
  return { records, ignored };
}
