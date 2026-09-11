/* channels/claude.mjs: Claude Code en modo headless (`claude -p`).

   El esfuerzo se fija SIEMPRE. Un agente que no piensa devuelve una
   respuesta segura, bien formada y sin examinar, que es el fallo que llega
   vestido de resultado. `--effort` verificado contra el binario.

   Solo lectura no tiene un interruptor único en Claude Code: se arma con una
   lista de permitidos y se niega Bash por nombre, porque es la herramienta
   que escribe sin llamarse Write. */

import { runAgent } from "../spawn.mjs";
import { forChannel } from "../models.mjs";

const READ_ONLY = ["Read", "Grep", "Glob"];
const WRITERS = ["Write", "Edit", "NotebookEdit", "Bash"];

export function invocation({ bin, model, need, mode, effort, cwd }) {
  const args = ["-p", "--model", forChannel("claude", model), "--effort", effort,
    "--output-format", "text"];
  if (need === "text") {
    args.push("--tools", "");
  } else if (mode === "readonly") {
    args.push("--allowedTools", ...READ_ONLY, "--disallowedTools", ...WRITERS);
  } else if (mode === "edit") {
    args.push("--permission-mode", "acceptEdits");
  } else if (mode === "full") {
    args.push("--dangerously-skip-permissions");
  }
  return { cmd: bin, args, cwd };
}

export async function ask(resolved, { prompt, system, cwd, effort = "high", mode = "readonly", timeoutMs }) {
  const inv = invocation({ bin: resolved.bin, model: resolved.model, need: resolved.need,
    mode, effort, cwd: cwd || process.cwd() });
  /* El system va delante del prompt en stdin, igual que en Codex, para que
     los dos canales CLI reciban exactamente el mismo texto. */
  const input = system ? system + "\n\n" + prompt : prompt;
  const r = await runAgent({ ...inv, input, timeoutMs });
  return {
    text: r.out.trim(), seconds: r.seconds, code: r.code, killed: r.killed, stderr: r.err,
    cmd: [inv.cmd, ...inv.args],
  };
}
