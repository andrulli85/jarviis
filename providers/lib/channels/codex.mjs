/* channels/codex.mjs: Codex CLI en modo no interactivo (`codex exec`).

   Medido 2026-09-10: `codex exec` arranca con `reasoning effort: none`, lo
   imprime en su banner y no dice nada más. Se fija con
   `-c model_reasoning_effort=`; sin la flag el banner dice "none", con ella
   dice el valor pedido.

   El sandbox es el vocabulario nativo: read-only, workspace-write o
   danger-full-access. El último mensaje se lee de un archivo (`-o`) y no de
   stdout, porque stdout lleva el banner y el progreso mezclados. */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../spawn.mjs";
import { forChannel } from "../models.mjs";

const SANDBOX = { readonly: "read-only", edit: "workspace-write", full: "danger-full-access" };

export function invocation({ bin, model, need, mode, effort, cwd, outFile }) {
  const sandbox = need === "text" ? "read-only" : (SANDBOX[mode] || "read-only");
  const args = ["exec", "-c", "model_reasoning_effort=" + effort,
    "--sandbox", sandbox, "--model", forChannel("codex", model),
    "--cd", cwd, "--skip-git-repo-check", "-o", outFile, "-"];
  if (mode === "full" && need !== "text") args.splice(1, 0, "--dangerously-bypass-approvals-and-sandbox");
  return { cmd: bin, args, cwd };
}

export async function ask(resolved, { prompt, system, cwd, effort = "high", mode = "readonly", timeoutMs }) {
  const dir = mkdtempSync(join(tmpdir(), "jarviis-codex-"));
  const outFile = join(dir, "last.md");
  try {
    const inv = invocation({ bin: resolved.bin, model: resolved.model, need: resolved.need,
      mode, effort, cwd: cwd || process.cwd(), outFile });
    const input = system ? system + "\n\n" + prompt : prompt;
    const r = await runAgent({ ...inv, input, timeoutMs });
    let text = "";
    try { text = readFileSync(outFile, "utf8").trim(); } catch { /* no escribió: se reporta vacío */ }
    return {
      text, seconds: r.seconds, code: r.code, killed: r.killed, stderr: r.err,
      stdout: r.out, cmd: [inv.cmd, ...inv.args],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
