#!/usr/bin/env node
/* open.mjs: abrir el workspace de Conductor para un issue.

   node open.mjs <JAR-12 | texto con la clave> [--via linear|path] [--spec docs/specs/x.md]
                 [--title "<título del issue>"] [--print] [--prompt-file <ruta>]

   Sin --title o sin --spec, y con clave de Linear en la máquina, los lee del
   issue (mejor esfuerzo, 3 s). Con ellos el prompt manda renombrar la rama a
   <slug de la spec>/<clave>-<título>, que es lo que Conductor lista.

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
import { issueRegex, slugify } from "../../wayfinder/scripts/route.mjs";
import { apiKey, issueInfo } from "../../to-tickets-linear/scripts/linear.mjs";
const ISSUE_URL = /linear\.app\/[^\s/]+\/issue\/([A-Za-z][A-Za-z0-9]{1,9}-\d+)/;

export function parseKey(text, env = process.env) {
  const t = String(text || "");
  const url = t.match(ISSUE_URL);
  if (url) return url[1].toUpperCase();
  const m = t.match(issueRegex(env.JARVIIS_LINEAR_PREFIX || null));
  return m ? m[1].toUpperCase() : null;
}

/* La rama agrupa las cards de una spec en la lista de Conductor, que muestra
   la rama cuando nadie puso nombre al workspace (y el deep link no lo acepta):
   <slug de la spec>/<clave en minúsculas>-<título en kebab, 6 palabras>. Sin
   spec no hay grupo; sin título, solo la clave. La clave sigue en la rama, así
   Linear cierra el issue al merge igual que antes. Decidido el 2026-09-12. */
export function branchName({ key, spec, title }) {
  const k = String(key).toLowerCase();
  const group = spec ? slugify(spec.replace(/^.*\//, "").replace(/\.md$/, ""), 8) : null;
  const tail = title ? `${k}-${slugify(title, 6)}` : k;
  return group ? `${group}/${tail}` : tail;
}

/* Título y spec del issue, leídos por `issueInfo` de linear.mjs (D12: la
   única puerta al tablero; aquí no hay GraphQL). Mejor esfuerzo: sin clave,
   sin red o con error devuelve {} y el prompt le deja la regla al agente en
   vez del nombre exacto. Nunca lanza. */
export async function fetchIssue(key, { env = process.env } = {}) {
  let token = null;
  try { token = apiKey(env); } catch { token = null; }
  if (!token) return {};
  try {
    const { title, spec } = await issueInfo(key, env);
    return { title, spec };
  } catch { return {}; }
}

/* El comando del tablero, escrito para correr desde CUALQUIER workspace y no
   solo desde el repo de la fábrica: la skill personal está enlazada en
   ~/.claude/skills (`ln -sfn` de `npm run stations`), así que esa ruta vale en
   el repo de cualquier producto. Un `node skills/...` relativo solo funciona
   aquí. */
export const LINEAR_CMD = "node ~/.claude/skills/to-tickets-linear/scripts/linear.mjs";

/* Los tres momentos de comentario en la card (D1-D6 y D9 de
   docs/specs/linear-comentarios-para-humanos.md), con el comando exacto de
   cada uno. Van en el prompt y no en el SKILL.md de Build porque el agente
   del workspace nuevo no lee ningún skill: lee este texto. Lo que no esté
   aquí no pasa — el 2026-09-12 un issue derivado (JAR-8) apareció en el
   tablero sin una línea de explicación porque nadie se la había pedido. */
export function commentMoments(key) {
  const team = String(key).split("-")[0].toUpperCase();
  /* La ruta completa una vez y `linear.mjs` en cada momento: repetirla seis
     veces hacía el prompt ilegible justo en la parte que tiene que seguirse
     al pie de la letra. */
  const cmd = "linear.mjs";
  return [
    `La card de Linear es lo único que Andy mira desde el teléfono, y la regla es una: comenta solo si Andy tomaría una decisión distinta al leerlo. Progreso, logs, lo que ya dice la PR y las dudas técnicas no se comentan. Tono: el mensaje que dejarías a un colega en Slack al salir, en español y sin tecnicismos.`,
    `Todo lo que toque el tablero pasa por \`${cmd}\` (\`comment\`, \`move\`, \`create\`, \`link\`), que abajo va abreviado y se ejecuta \`${LINEAR_CMD} <comando>\`; con \`-\` el texto entra por stdin. Nunca una petición a mano contra la API de Linear.`,
    `Tres momentos de comentario, y ninguno más:`,
    `1. Arranque, ahora mismo: \`${cmd} move ${key} "In Progress"\` y \`${cmd} comment ${key} -\` con una línea de alcance y plan.`,
    `2. Cambio de plan, cuando ocurra: una decisión que altera el alcance, una sorpresa o un bloqueo, en dos o tres frases con el porqué en palabras y el enlace a la spec o al veredicto si hay detalle. Si te bloqueas, di qué esperas y qué lo desbloquea, sin prometer plazos; y cuando vuelvas a moverte, dilo antes de seguir: una card parada en «esperando X» con el trabajo ya reanudado manda a Andy a desbloquear lo que ya está suelto. Si el trabajo destapa un issue nuevo, créalo con \`${cmd} create --team ${team} --title "…" --description - --blocked-by ${key}\` y comenta en ${key} por qué nació y a qué bloquea.`,
    `3. Cierre, al abrir la PR: \`${cmd} move ${key} "In Review"\` y \`${cmd} comment ${key} -\` con el resultado en lenguaje de usuario, el número de la PR y que se cierra con esta PR. A Done no lo mueve nadie: lo hace el merge.`,
  ];
}

/* Lo primero que lee el agente del workspace nuevo. Dice de qué estación
   viene el trabajo y a cuál va, para que no vuelva a enrutar ni a rebanar. */
export function kickoffPrompt({ key, spec, title }) {
  const specLine = spec
    ? `La spec es \`${spec}\`.`
    : `La spec está enlazada al pie de la descripción del issue (línea \`Spec:\`), o en \`docs/tickets/<slug>.json\`; localízala antes de nada.`;
  const exact = title ? branchName({ key, spec, title }) : null;
  const template = `${spec ? branchName({ key, spec }).split("/")[0] : "<slug-de-la-spec>"}/${String(key).toLowerCase()}-<título-del-issue-en-kebab-6-palabras>`;
  const branchLine = `Antes de nada renombra la rama a ${exact ? `exactamente \`${exact}\`` : `\`${template}\``} (git branch -m): Conductor muestra la rama en su lista y así las cards de la misma spec quedan juntas.`;
  return [
    `Estación Build de la fábrica para ${key}. Slice ya pasó: el issue existe, no lo rebanes ni lo reenrutes.`,
    specLine,
    branchLine,
    `Lee el issue ${key} y la spec, y trabaja con /tdd sobre los criterios de aceptación del issue.`,
    ...commentMoments(key),
    `La rama lleva la clave ${key}, así Linear cierra el issue al merge; el resto de /git-conventions aplica igual.`,
    `La PR referencia ${key} en la primera línea del cuerpo, para que Linear cierre el issue al merge.`,
    `No publiques nada sin decirlo: commit local sí, push y PR cuando lo pida. Los tres comentarios y los dos \`move\` de arriba te los pide este prompt: no necesitan permiso aparte.`,
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
    else if (a === "--title") o.title = argv[++i];
    else if (a === "--prompt-file") o.promptFile = argv[++i];
    else if (a.startsWith("--")) { console.error(`opción desconocida ${a}`); process.exit(2); }
    else words.push(a);
  }
  const key = parseKey(words.join(" "));
  if (!key) { console.error("falta la clave del issue (JAR-12)"); process.exit(2); }
  if (!o.promptFile && (!o.title || !o.spec)) {
    const issue = await fetchIssue(key);
    o.title = o.title || issue.title;
    o.spec = o.spec || issue.spec;
  }
  const prompt = o.promptFile ? readFileSync(o.promptFile, "utf8").trim() : kickoffPrompt({ key, spec: o.spec, title: o.title });
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
