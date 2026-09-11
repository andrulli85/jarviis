import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "../index.mjs";
import { neutralEnv, fakeBin } from "./helpers.mjs";

const withBins = (extra = {}) => neutralEnv({
  CE_CLAUDE_BIN: fakeBin("claude", "cat"),
  CE_CODEX_BIN: fakeBin("codex", "cat"),
  OPENROUTER_API_KEY: "sk-fake",
  ...extra,
});

test("agent sin más va a claude con opus", () => {
  const r = resolve({ need: "agent" }, withBins());
  assert.equal(r.ok, true);
  assert.equal(r.channel, "claude");
  assert.equal(r.model, "anthropic/claude-opus-5");
  assert.match(r.bin, /claude$/);
});

test("agent opuesto a claude va a codex; opuesto a gpt va a claude", () => {
  const env = withBins();
  const a = resolve({ need: "agent", opposite: "claude" }, env);
  assert.equal(a.channel, "codex");
  assert.equal(a.model, "openai/gpt-5.6-terra");
  const b = resolve({ need: "agent", opposite: "gpt" }, env);
  assert.equal(b.channel, "claude");
});

test("agent con modelo elige el canal por vendor", () => {
  const r = resolve({ need: "agent", model: "terra" }, withBins());
  assert.equal(r.channel, "codex");
  assert.equal(r.model, "openai/gpt-5.6-terra");
});

test("agent con familia y modelo contradictorios falla", () => {
  const r = resolve({ need: "agent", family: "gpt", model: "opus" }, withBins());
  assert.equal(r.ok, false);
  assert.match(r.why, /no es de la familia|solo corre/);
});

test("agent por openrouter es un error, no un fallback", () => {
  const r = resolve({ need: "agent", channel: "openrouter" }, withBins());
  assert.equal(r.ok, false);
  assert.match(r.why, /no tiene herramientas/);
});

test("agent con modelo de un tercer vendor no tiene canal", () => {
  const r = resolve({ need: "agent", model: "moonshotai/kimi-k3" }, withBins());
  assert.equal(r.ok, false);
  assert.match(r.why, /ningún agente/);
});

test("agent sin binario falla y dice cuál", () => {
  const r = resolve({ need: "agent" }, neutralEnv());
  assert.equal(r.ok, false);
  assert.match(r.why, /no hay binario de claude/);
});

test("text va a openrouter con opus por defecto", () => {
  const r = resolve({ need: "text" }, withBins());
  assert.equal(r.channel, "openrouter");
  assert.equal(r.model, "anthropic/claude-opus-5");
  assert.equal(r.bin, undefined);
});

test("text sin clave falla", () => {
  const r = resolve({ need: "text" }, neutralEnv());
  assert.equal(r.ok, false);
  assert.match(r.why, /sin clave/);
});

test("text puede pedir un CLI explícitamente", () => {
  const r = resolve({ need: "text", channel: "codex" }, withBins());
  assert.equal(r.channel, "codex");
  assert.match(r.bin, /codex$/);
});

test("text por openrouter acepta cualquier vendor", () => {
  const r = resolve({ need: "text", model: "moonshotai/kimi-k3" }, withBins());
  assert.equal(r.ok, true);
  assert.equal(r.channel, "openrouter");
});

test("need inválido, modelo desconocido y canal desconocido fallan con mensaje", () => {
  assert.match(resolve({ need: "x" }, withBins()).why, /need debe ser/);
  assert.match(resolve({ need: "text", model: "loquesea" }, withBins()).why, /no reconozco el modelo/);
  assert.match(resolve({ need: "text", channel: "gemini" }, withBins()).why, /canal desconocido/);
});

/* Hallazgos de la revisión del 2026-09-11. */

test("text opuesto a claude por openrouter recibe un modelo GPT, no el default Anthropic", () => {
  const r = resolve({ need: "text", opposite: "claude" }, withBins());
  assert.equal(r.ok, true);
  assert.equal(r.channel, "openrouter");
  assert.equal(r.model, "openai/gpt-5.6-terra");
});

test("text con familia y modelo contradictorios falla también por openrouter", () => {
  const r = resolve({ need: "text", family: "gpt", model: "opus" }, withBins());
  assert.equal(r.ok, false);
  assert.match(r.why, /no es de la familia gpt/);
});

test("una familia desconocida es un error salvo que venga con su propio modelo", () => {
  assert.match(resolve({ need: "text", family: "gemini" }, withBins()).why, /familia desconocida/);
  const ok = resolve({ need: "text", family: "moonshotai", model: "moonshotai/kimi-k3" }, withBins());
  assert.equal(ok.ok, true);
});

test("JARVIIS_OPENROUTER_MODEL pasa por canonical: alias vale, basura falla con nombre", () => {
  const good = resolve({ need: "text" }, withBins({ JARVIIS_OPENROUTER_MODEL: "terra" }));
  assert.equal(good.model, "openai/gpt-5.6-terra");
  const bad = resolve({ need: "text" }, withBins({ JARVIIS_OPENROUTER_MODEL: "loquesea" }));
  assert.equal(bad.ok, false);
  assert.match(bad.why, /JARVIIS_OPENROUTER_MODEL/);
});
