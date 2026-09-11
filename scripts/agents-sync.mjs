#!/usr/bin/env node
/* agents-sync.mjs: copia AGENTS.md del repo debajo del bloque gestionado de
   ~/.buzz/AGENTS.md, que es el archivo que los agentes de Buzz leen en cada turno.

   npm run agents:sync
   node scripts/agents-sync.mjs --check   # sale 1 si el nido está desactualizado

   Una sola dirección: el repo es la fuente, el nido es salida generada. No es un
   symlink porque Buzz regenera la parte de arriba del nido y lo haría a través del
   enlace, ensuciando el repo. Idempotente: correrlo dos veces deja el mismo archivo.

   Sale 0 si el nido quedó (o ya estaba) al día; 1 si falta el nido o su marcador,
   o con --check si difiere; 2 por mal uso. */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "<!-- END BUZZ MANAGED -->";
export const HEADER = "<!-- Generado desde jarviis/AGENTS.md por `npm run agents:sync`. No editar aquí: los cambios se pierden en la próxima sincronización. -->";

/* Devuelve el contenido del nido con todo lo anterior al último MARKER intacto y
   `source` debajo, precedido por HEADER. Lanza si el nido no tiene el marcador. */
export function merge(nest, source) {
  const at = nest.lastIndexOf(MARKER);
  if (at < 0) throw new Error(`el nido no contiene el marcador ${MARKER}`);
  const managed = nest.slice(0, at + MARKER.length);
  return `${managed}\n\n${HEADER}\n\n${source.trimEnd()}\n`;
}

/* Sincroniza `sourcePath` sobre `nestPath`. Devuelve { changed, nestPath }. */
export function sync({ sourcePath, nestPath, check = false }) {
  if (!existsSync(nestPath)) throw new Error(`no existe ${nestPath}; lo crea Buzz Desktop, no este script`);
  const source = readFileSync(sourcePath, "utf8");
  const nest = readFileSync(nestPath, "utf8");
  const next = merge(nest, source);
  const changed = next !== nest;
  if (changed && !check) writeFileSync(nestPath, next);
  return { changed, nestPath };
}

function main(argv) {
  const check = argv.includes("--check");
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) { console.error(`uso: agents-sync [--check] (argumento desconocido: ${unknown[0]})`); process.exit(2); }
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sourcePath = join(repoRoot, "AGENTS.md");
  const nestPath = process.env.BUZZ_NEST_AGENTS || join(homedir(), ".buzz", "AGENTS.md");
  try {
    const { changed } = sync({ sourcePath, nestPath, check });
    if (check) { console.log(changed ? `desactualizado: ${nestPath}` : `al día: ${nestPath}`); process.exit(changed ? 1 : 0); }
    console.log(`${changed ? "actualizado" : "sin cambios"}: ${nestPath}`);
  } catch (e) {
    console.error(`agents-sync: ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
