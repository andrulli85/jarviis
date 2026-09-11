/* Entorno neutralizado: ningún test puede llegar a un proveedor real.
   Los binarios apuntan a rutas inexistentes, OpenRouter a un stub local que
   cada test levanta, y la clave es de mentira. */
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

export function neutralEnv(extra = {}) {
  return {
    HOME: mkdtempSync(join(tmpdir(), "jarviis-home-")),
    CE_CLAUDE_BIN: "/nonexistent/claude",
    CE_CODEX_BIN: "/nonexistent/codex",
    CE_AGENT_BINARIES_DIR: "/nonexistent/agent-binaries",
    CE_OPENROUTER_URL: "http://127.0.0.1:1/chat/completions",
    OPENROUTER_API_KEY: "",
    OPENROUTER_KEY_FILE: "/nonexistent/key",
    ...extra,
  };
}

/* Un binario falso: un shell script que hace lo que el test necesita. */
export function fakeBin(name, script) {
  const dir = mkdtempSync(join(tmpdir(), "jarviis-bin-"));
  const p = join(dir, name);
  writeFileSync(p, "#!/bin/sh\n" + script + "\n");
  chmodSync(p, 0o755);
  return p;
}

/* Un árbol de agent-binaries con las versiones dadas. */
export function fakeBinariesRoot(agent, versions) {
  const root = mkdtempSync(join(tmpdir(), "jarviis-root-"));
  for (const v of versions) {
    mkdirSync(join(root, agent, v), { recursive: true });
    writeFileSync(join(root, agent, v, agent), "#!/bin/sh\necho " + v + "\n");
    chmodSync(join(root, agent, v, agent), 0o755);
  }
  return root;
}

/* Stub de OpenRouter: responde con los chunks SSE que le des, en el orden y
   con los cortes de bytes que le des. Devuelve la URL y una función para
   cerrar. `chunks` son Buffers o strings; se escriben uno a uno. */
export async function openrouterStub(handler) {
  const server = createServer(async (req, res) => {
    const body = [];
    for await (const c of req) body.push(c);
    const parsed = JSON.parse(Buffer.concat(body).toString("utf8") || "{}");
    await handler(parsed, res, req);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/chat/completions`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

export const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
export const delta = (content, extra = {}) => sse({ choices: [{ delta: { content } }], ...extra });
