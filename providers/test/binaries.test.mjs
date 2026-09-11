import { test } from "node:test";
import assert from "node:assert/strict";
import { agentBinary } from "../lib/binaries.mjs";
import { fakeBinariesRoot, fakeBin } from "./helpers.mjs";

test("elige la versión más nueva con orden numérico por segmento", () => {
  const root = fakeBinariesRoot("codex", ["0.99.9", "0.153.4", "0.9.0"]);
  const p = agentBinary("codex", { CE_AGENT_BINARIES_DIR: root });
  assert.match(p, /0\.153\.4\/codex$/);
});

test("override vacío significa sin binario, no sin override", () => {
  const root = fakeBinariesRoot("claude", ["1.0.0"]);
  assert.equal(agentBinary("claude", { CE_CLAUDE_BIN: "", CE_AGENT_BINARIES_DIR: root }), null);
  assert.equal(agentBinary("claude", { CE_CLAUDE_BIN: "   ", CE_AGENT_BINARIES_DIR: root }), null);
});

test("override a ruta inexistente es null, no cae a Conductor", () => {
  const root = fakeBinariesRoot("claude", ["1.0.0"]);
  assert.equal(agentBinary("claude", { CE_CLAUDE_BIN: "/nonexistent/x", CE_AGENT_BINARIES_DIR: root }), null);
});

test("override a ruta existente gana", () => {
  const bin = fakeBin("claude", "echo hi");
  assert.equal(agentBinary("claude", { CE_CLAUDE_BIN: bin }), bin);
});

test("agente desconocido es null", () => {
  assert.equal(agentBinary("gemini", {}), null);
});
