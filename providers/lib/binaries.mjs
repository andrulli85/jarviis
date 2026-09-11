/* binaries.mjs: dónde está un `claude` o un `codex` que funcione.

   Conductor trae binarios de ambos agentes y los versiona. Se prefieren a lo
   que haya en el PATH porque este repositorio ya tiene registrado que un
   `codex` en el PATH no es prueba de un codex que funcione: el wrapper de npm
   deja un shim cuando su binario vendorizado desaparece y cada llamada muere
   con ENOENT. Medido en esta máquina el 2026-09-11. */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const DEFAULT_ROOT = join(homedir(), "Library/Application Support/com.conductor.app/agent-binaries");

/* Devuelve la ruta o null. Override por variable de entorno:
   CE_CLAUDE_BIN / CE_CODEX_BIN. FIJADA PERO VACÍA SIGNIFICA "SIN BINARIO",
   no "sin override": la suite de evals neutraliza el comando apuntando estas
   variables a una ruta inexistente, una corrida las reexportó vacías, la
   cadena vacía es falsy y el lookup cayó a los binarios reales de Conductor
   y gastó cuota sin que nadie lo autorizara. La ambigüedad se resuelve hacia
   no gastar. */
export function agentBinary(agent, env = process.env) {
  if (agent !== "claude" && agent !== "codex") return null;
  const name = agent === "codex" ? "CE_CODEX_BIN" : "CE_CLAUDE_BIN";
  const override = env[name];
  if (override !== undefined && override.trim() === "") return null;
  if (override) return existsSync(override) ? override : null;
  const root = env.CE_AGENT_BINARIES_DIR || DEFAULT_ROOT;
  const dir = join(root, agent);
  if (!existsSync(dir)) return null;
  /* La versión más nueva gana. Numérico por segmento: 0.153.4 vence a 0.99.9
     en vez de perder como perdería en orden de cadena. */
  const rank = (v) => v.split(".").map((n) => Number(n) || 0);
  const versions = readdirSync(dir).filter((v) => !v.startsWith(".")).sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    }
    return 0;
  });
  for (const v of versions) {
    const p = join(dir, v, agent);
    if (existsSync(p)) return p;
  }
  return null;
}
