/* spawn.mjs: correr un agente CLI con el prompt por stdin.

   Bytes dentro, decodificados una sola vez. Un carácter multibyte partido
   entre dos chunks de stdout se decodifica como dos caracteres de reemplazo
   si se decodifica por chunk; el JSON sigue parseando y la evidencia pierde
   la ñ en silencio. Se concatena el buffer y se decodifica al final.

   El timeout existe para que un agente colgado no retenga la terminal para
   siempre, no para controlar gasto: un reviewer se quedó 344 s callado a
   mitad de respuesta sin estar colgado, y un límite que parece seguro mata
   corridas sanas. */

import { spawn } from "node:child_process";

export const DEFAULT_TIMEOUT_MS = Number(process.env.JARVIIS_AGENT_TIMEOUT_MS || 20 * 60 * 1000);

export function runAgent({ cmd, args, cwd, input, timeoutMs = DEFAULT_TIMEOUT_MS, env }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, args, { cwd, env });
    const out = [], err = [];
    let killed = false;
    const timer = setTimeout(() => { killed = true; p.kill("SIGKILL"); }, timeoutMs);
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out: "", err: String(e.message), seconds: 0, killed: false });
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code, killed,
        out: Buffer.concat(out).toString("utf8"),
        err: Buffer.concat(err).toString("utf8"),
        seconds: Math.round((Date.now() - t0) / 1000),
      });
    });
    p.stdin.on("error", () => { /* el agente puede salir antes de leer todo */ });
    p.stdin.end(input);
  });
}
