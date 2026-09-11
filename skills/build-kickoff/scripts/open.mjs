#!/usr/bin/env node
/* open.mjs: abrir el workspace de Conductor para un issue.

   node open.mjs <JAR-12 | texto con la clave> [--via linear|path] [--spec docs/specs/x.md]
                 [--print] [--prompt-file <ruta>]

   Conductor registra el esquema conductor:// y documenta dos deep links que
   sirven aquí (conductor.build/docs/reference/deep-links, leído 2026-09-11):

     conductor://linear_id=<clave>&prompt=<texto>
       busca el issue en Linear, detecta el repo y crea el workspace EN LA
       RAMA DEL ISSUE (o navega al que ya exista). Requiere Linear conectado
       en Conductor. La rama de Linear lleva la clave, así Linear cierra el
       issue al merge sin que nadie lo diga.

     conductor://prompt=<texto>&path=<repo>
       crea un workspace en ese repo con el prompt. La rama la nombra
       Conductor; el prompt pide al agente renombrarla con la clave según
       git-conventions.

   El CLI `conductor` no sirve: crea workspaces cloud y pide token de API.

   Este script construye la URL y la abre con `open`. Con --print o
   JARVIIS_NO_OPEN=1 solo la imprime: los evals nunca abren un workspace
   real. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/* La misma regla que el wayfinder, importada y no copiada: sin prefijo
   configurado, PREFIJO-NÚMERO en mayúsculas; con JARVIIS_LINEAR_PREFIX, solo
   ese prefijo en cualquier caja. Una URL de Linear manda: el slug del
   workspace (linear.app/jarviis-2/...) también parece una clave y no lo es. */
import { issueRegex } from "../../wayfinder/scripts/route.mjs";
const ISSUE_URL = /linear\.app\/[^\s/]+\/issue\/([A-Za-z][A-Za-z0-9]{1,9}-\d+)/;

export function parseKey(text, env = process.env) {
  const t = String(text || "");
  const url = t.match(ISSUE_URL);
  if (url) return url[1].toUpperCase();
  const m = t.match(issueRegex(env.JARVIIS_LINEAR_PREFIX || null));
  return m ? m[1].toUpperCase() : null;
}

/* Lo primero que lee el agente del workspace nuevo. Dice de qué estación
   viene el trabajo y a cuál va, para que no vuelva a enrutar ni a rebanar. */
export function kickoffPrompt({ key, spec }) {
  const specLine = spec
    ? `La spec es \`${spec}\`.`
    : `La spec está enlazada al pie de la descripción del issue (línea \`Spec:\`), o en \`docs/tickets/<slug>.json\`; localízala antes de nada.`;
  return [
    `Estación Build de la fábrica para ${key}. Slice ya pasó: el issue existe, no lo rebanes ni lo reenrutes.`,
    specLine,
    `Lee el issue ${key} y la spec, y trabaja con /tdd sobre los criterios de aceptación del issue.`,
    `La rama lleva la clave ${key} según /git-conventions (si Conductor la nombró sin ella, renómbrala con git branch -m).`,
    `La PR referencia ${key} en la primera línea del cuerpo, para que Linear cierre el issue al merge.`,
    `No publiques nada sin decirlo: commit local sí, push y PR cuando lo pida.`,
  ].join("\n");
}

export function deepLink({ via = "linear", key, prompt, path }) {
  const q = encodeURIComponent(prompt || "");
  if (via === "linear") return `conductor://linear_id=${encodeURIComponent(key)}&prompt=${q}`;
  if (via === "path") {
    if (!path) throw new Error("via path necesita la ruta del repositorio (path)");
    return `conductor://prompt=${q}&path=${encodeURIComponent(path)}`;
  }
  throw new Error(`via desconocido "${via}": linear o path`);
}

/* El repo del producto: el que Conductor dice, si estamos dentro de uno;
   si no, la raíz git del cwd; si no, null. */
export function repoRoot(env = process.env, cwd = process.cwd()) {
  if (env.CONDUCTOR_ROOT_PATH) return env.CONDUCTOR_ROOT_PATH;
  let d = resolve(cwd);
  for (;;) {
    if (existsSync(join(d, ".git"))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/* ---------------------------------------------------------------- main --- */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const direct = (() => { try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (direct) {
  const argv = process.argv.slice(2);
  const o = { via: "linear", print: false };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--print") o.print = true;
    else if (a === "--via") o.via = argv[++i];
    else if (a === "--spec") o.spec = argv[++i];
    else if (a === "--prompt-file") o.promptFile = argv[++i];
    else if (a.startsWith("--")) { console.error(`opción desconocida ${a}`); process.exit(2); }
    else words.push(a);
  }
  const key = parseKey(words.join(" "));
  if (!key) { console.error("falta la clave del issue (JAR-12)"); process.exit(2); }
  const prompt = o.promptFile ? readFileSync(o.promptFile, "utf8").trim() : kickoffPrompt({ key, spec: o.spec });
  let url;
  try {
    const path = o.via === "path" ? repoRoot() : undefined;
    if (o.via === "path" && !path) { console.error("no encuentro el repositorio: ni CONDUCTOR_ROOT_PATH ni una raíz git desde el cwd"); process.exit(1); }
    url = deepLink({ via: o.via, key, prompt, path });
  } catch (e) { console.error(e.message); process.exit(1); }
  const dry = o.print || (process.env.JARVIIS_NO_OPEN || "").trim() !== "";
  console.log(url);
  if (dry) process.exit(0);
  const r = spawnSync("open", [url], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`open salió con ${r.status}: ¿está Conductor instalado?`); process.exit(1); }
  console.error(`→ Conductor: workspace para ${key} (via ${o.via})`);
}
