import { test } from "node:test";
import assert from "node:assert/strict";
import { ask, resolve } from "../index.mjs";
import { invocation as claudeInv } from "../lib/channels/claude.mjs";
import { invocation as codexInv } from "../lib/channels/codex.mjs";
import { neutralEnv, fakeBin } from "./helpers.mjs";

/* Lo que se le pasa al CLI es lo que la evidencia luego tiene que poder
   explicar, así que se prueba la forma exacta de los argumentos. */
test("claude: texto sin herramientas, agent readonly con lista, edit y full", () => {
  const base = { bin: "/b/claude", model: "anthropic/claude-opus-5", effort: "high", cwd: "/w" };
  const t = claudeInv({ ...base, need: "text" }).args;
  assert.ok(t.includes("--tools") && t[t.indexOf("--tools") + 1] === "");
  assert.equal(t[t.indexOf("--model") + 1], "claude-opus-5");
  const ro = claudeInv({ ...base, need: "agent", mode: "readonly" }).args;
  assert.ok(ro.includes("--allowedTools") && ro.includes("Read") && ro.includes("Bash"));
  assert.ok(ro.indexOf("Bash") > ro.indexOf("--disallowedTools"));
  const ed = claudeInv({ ...base, need: "agent", mode: "edit" }).args;
  assert.equal(ed[ed.indexOf("--permission-mode") + 1], "acceptEdits");
  const fu = claudeInv({ ...base, need: "agent", mode: "full" }).args;
  assert.ok(fu.includes("--dangerously-skip-permissions"));
});

test("codex: esfuerzo explícito, sandbox por modo, modelo sin prefijo", () => {
  const base = { bin: "/b/codex", model: "openai/gpt-5.6-terra", effort: "high", cwd: "/w", outFile: "/o" };
  const ro = codexInv({ ...base, need: "agent", mode: "readonly" }).args;
  assert.ok(ro.includes("model_reasoning_effort=high"));
  assert.equal(ro[ro.indexOf("--sandbox") + 1], "read-only");
  assert.equal(ro[ro.indexOf("--model") + 1], "gpt-5.6-terra");
  const ed = codexInv({ ...base, need: "agent", mode: "edit" }).args;
  assert.equal(ed[ed.indexOf("--sandbox") + 1], "workspace-write");
  const tx = codexInv({ ...base, need: "text", mode: "full" }).args;
  assert.equal(tx[tx.indexOf("--sandbox") + 1], "read-only", "texto nunca escribe aunque pidan full");
  assert.ok(!tx.includes("--dangerously-bypass-approvals-and-sandbox"));
});

test("claude: la respuesta es stdout, system va delante del prompt", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "cat") });
  const r = resolve({ need: "text", channel: "claude" }, env);
  const a = await ask(r, { prompt: "hola ñandú", system: "eres breve", env });
  assert.equal(a.ok, true);
  assert.equal(a.text, "eres breve\n\nhola ñandú");
  assert.equal(a.channel, "claude");
});

test("claude: stdout vacío es un fallo, no una respuesta", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "cat >/dev/null; true") });
  const a = await ask(resolve({ need: "text", channel: "claude" }, env), { prompt: "x", env });
  assert.equal(a.ok, false);
  assert.match(a.why, /respuesta vacía/);
});

test("claude: código de salida distinto de 0 es un fallo con stderr", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "cat >/dev/null; echo boom >&2; exit 3") });
  const a = await ask(resolve({ need: "text", channel: "claude" }, env), { prompt: "x", env });
  assert.equal(a.ok, false);
  assert.match(a.why, /código 3.*boom/s);
});

test("claude: timeout mata y lo dice", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "cat >/dev/null; sleep 5") });
  const a = await ask(resolve({ need: "text", channel: "claude" }, env), { prompt: "x", timeoutMs: 200, env });
  assert.equal(a.ok, false);
  assert.match(a.why, /timeout/);
});

test("codex: lee el último mensaje del archivo -o, no de stdout", async () => {
  /* El falso codex imprime un banner en stdout y escribe la respuesta en el
     archivo que recibe tras -o. */
  const script = `
while [ $# -gt 0 ]; do case "$1" in -o) OUT="$2"; shift;; esac; shift; done
echo "banner: reasoning effort high"
cat > "$OUT"
`;
  const env = neutralEnv({ CE_CODEX_BIN: fakeBin("codex", script) });
  const a = await ask(resolve({ need: "text", channel: "codex" }, env), { prompt: "respuesta ñ", env });
  assert.equal(a.ok, true);
  assert.equal(a.text, "respuesta ñ");
});

test("codex: si no escribe el archivo, es un fallo", async () => {
  const env = neutralEnv({ CE_CODEX_BIN: fakeBin("codex", "cat >/dev/null; echo banner") });
  const a = await ask(resolve({ need: "text", channel: "codex" }, env), { prompt: "x", env });
  assert.equal(a.ok, false);
  assert.match(a.why, /respuesta vacía/);
});

test("ask con resolución fallida no ejecuta nada", async () => {
  const a = await ask({ ok: false, why: "nada" }, { prompt: "x" });
  assert.deepEqual(a, { ok: false, text: "", why: "nada" });
});

test("ask con prompt vacío no ejecuta nada", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "echo nunca") });
  const a = await ask(resolve({ need: "text", channel: "claude" }, env), { prompt: "  ", env });
  assert.equal(a.ok, false);
  assert.match(a.why, /prompt vacío/);
});
