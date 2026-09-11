#!/usr/bin/env node
/* agents-sync.mjs: genera la sección "Colmena de Buzz" a partir de agents/ y la copia
   debajo del bloque gestionado de ~/.buzz/AGENTS.md, que es el archivo que los agentes
   de Buzz leen en cada turno.

   npm run agents:sync
   node scripts/agents-sync.mjs --check   # sale 1 si el nido está desactualizado

   La sección es: título de agents/README.md, tabla "Quién hace qué" generada del
   frontmatter de agents/<agente>.md (name, pubkey, rol, cuando), el resto del README y,
   al final, "Instrucciones por agente" con el cuerpo de cada agents/<agente>.md bajo su
   nombre. Los agentes leen el nido en cada turno, así que editar el cuerpo y sincronizar
   cambia su comportamiento sin tocar Buzz Desktop.

   Los agentes con harness Claude Code arrancan con cwd ~/.buzz y cargan CLAUDE.md, no
   AGENTS.md, así que el script asegura además un ~/.buzz/CLAUDE.md que importa
   @AGENTS.md. Cargan al arrancar la sesión: tras sincronizar hay que reiniciar el agente.

   Una sola dirección: el repo es la fuente, el nido es salida generada. No es un
   symlink porque Buzz regenera la parte de arriba del nido y lo haría a través del
   enlace, ensuciando el repo. Idempotente: correrlo dos veces deja el mismo archivo.

   Sale 0 si el nido quedó (o ya estaba) al día; 1 si falta el nido, su marcador, el
   README o un campo de frontmatter, o con --check si difiere; 2 por mal uso. */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "<!-- END BUZZ MANAGED -->";
export const BRIDGE = "@AGENTS.md";
export const HEADER = "<!-- Generado desde jarviis/agents/ por `npm run agents:sync`. No editar aquí: los cambios se pierden en la próxima sincronización. -->";
const FIELDS = ["name", "pubkey", "rol", "cuando"];

/* Lee el frontmatter (líneas `clave: valor` entre dos `---`) y el cuerpo de un agente.
   Lanza si falta un campo. */
export function parseAgent(text, file = "agente") {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: sin frontmatter`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const f of FIELDS) if (!meta[f]) throw new Error(`${file}: falta el campo ${f} en el frontmatter`);
  return { ...meta, body: m[2].trim() };
}

/* Lee agents/: README.md más un archivo por agente, en orden alfabético. */
export function readAgentsDir(dir) {
  const readme = join(dir, "README.md");
  if (!existsSync(readme)) throw new Error(`no existe ${readme}`);
  const agents = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").sort()
    .map((f) => parseAgent(readFileSync(join(dir, f), "utf8"), join(dir, f)));
  return { readme: readFileSync(readme, "utf8"), agents };
}

/* Tabla markdown del roster. El pubkey se abrevia como lo muestra Buzz. */
export function roster(agents) {
  const short = (k) => `${k.slice(0, 8)}…${k.slice(-4)}`;
  return ["## Quién hace qué", "", "| Agente | Pubkey | Rol declarado | Llámalo cuando… |", "|---|---|---|---|",
    ...agents.map((a) => `| ${a.name} | \`${short(a.pubkey)}\` | ${a.rol} | ${a.cuando} |`)].join("\n");
}

/* Una subsección por agente con su cuerpo; los agentes sin cuerpo no aparecen. */
export function instructions(agents) {
  const withBody = agents.filter((a) => a.body);
  if (!withBody.length) return "";
  return ["## Instrucciones por agente", "",
    "Cada agente sigue solo la suya, desde el turno en que la lee y por encima de lo que diga su Edit Agent si chocan. Las demás son para saber qué esperar de los otros.", "",
    ...withBody.flatMap((a) => [`### ${a.name}`, "", a.body, ""])].join("\n").trim();
}

/* La sección completa: título y preámbulo del README, la tabla, el resto del README,
   las instrucciones por agente. */
export function buildSection({ readme, agents }) {
  const cut = readme.indexOf("\n## ");
  const [pre, rest] = cut < 0 ? [readme, ""] : [readme.slice(0, cut), readme.slice(cut)];
  return `${pre.trim()}\n\n${roster(agents)}\n${rest.trimEnd()}\n\n${instructions(agents)}`.trim();
}

/* Devuelve el contenido del nido con todo lo anterior al último MARKER intacto y
   `section` debajo, precedida por HEADER. Lanza si el nido no tiene el marcador. */
export function merge(nest, section) {
  const at = nest.lastIndexOf(MARKER);
  if (at < 0) throw new Error(`el nido no contiene el marcador ${MARKER}`);
  const managed = nest.slice(0, at + MARKER.length);
  return `${managed}\n\n${HEADER}\n\n${section.trim()}\n`;
}

/* CLAUDE.md junto al nido con la línea `@AGENTS.md`. Devuelve el contenido que debe
   tener: el actual si ya la lleva, el actual más la línea si no, o solo la línea. */
export function bridge(current) {
  if (current == null) return `${BRIDGE}\n`;
  if (current.split("\n").some((l) => l.trim() === BRIDGE)) return current;
  return `${current.trimEnd()}\n\n${BRIDGE}\n`;
}

/* Sincroniza `agentsDir` sobre `nestPath` y asegura el CLAUDE.md puente al lado.
   Devuelve { changed, nestPath, bridgePath }. */
export function sync({ agentsDir, nestPath, check = false }) {
  if (!existsSync(nestPath)) throw new Error(`no existe ${nestPath}; lo crea Buzz Desktop, no este script`);
  const nest = readFileSync(nestPath, "utf8");
  const next = merge(nest, buildSection(readAgentsDir(agentsDir)));
  const bridgePath = join(dirname(nestPath), "CLAUDE.md");
  const currentBridge = existsSync(bridgePath) ? readFileSync(bridgePath, "utf8") : null;
  const nextBridge = bridge(currentBridge);
  const changed = next !== nest || nextBridge !== currentBridge;
  if (!check) {
    if (next !== nest) writeFileSync(nestPath, next);
    if (nextBridge !== currentBridge) writeFileSync(bridgePath, nextBridge);
  }
  return { changed, nestPath, bridgePath };
}

function main(argv) {
  const check = argv.includes("--check");
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) { console.error(`uso: agents-sync [--check] (argumento desconocido: ${unknown[0]})`); process.exit(2); }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const agentsDir = join(repoRoot, "agents");
  const nestPath = process.env.BUZZ_NEST_AGENTS || join(homedir(), ".buzz", "AGENTS.md");
  try {
    const { changed } = sync({ agentsDir, nestPath, check });
    if (check) { console.log(changed ? `desactualizado: ${nestPath}` : `al día: ${nestPath}`); process.exit(changed ? 1 : 0); }
    console.log(`${changed ? "actualizado" : "sin cambios"}: ${nestPath}`);
  } catch (e) {
    console.error(`agents-sync: ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
