import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, forChannel, FAMILY_OF, DEFAULT_MODEL } from "../lib/models.mjs";

test("canonical acepta alias, canónico e ids de vendor conocidos", () => {
  assert.equal(canonical("opus"), "anthropic/claude-opus-5");
  assert.equal(canonical("terra"), "openai/gpt-5.6-terra");
  assert.equal(canonical("anthropic/claude-sonnet-5"), "anthropic/claude-sonnet-5");
  assert.equal(canonical("claude-opus-5"), "anthropic/claude-opus-5");
  assert.equal(canonical("gpt-5.6-terra"), "openai/gpt-5.6-terra");
  assert.equal(canonical("moonshotai/kimi-k3"), "moonshotai/kimi-k3");
  assert.equal(canonical("loquesea"), null);
  assert.equal(canonical(""), null);
});

test("forChannel traduce solo a su propio vendor", () => {
  assert.equal(forChannel("codex", "openai/gpt-5.6-terra"), "gpt-5.6-terra");
  assert.equal(forChannel("claude", "anthropic/claude-opus-5"), "claude-opus-5");
  assert.equal(forChannel("openrouter", "moonshotai/kimi-k3"), "moonshotai/kimi-k3");
  assert.throws(() => forChannel("codex", "anthropic/claude-opus-5"), /codex solo corre/);
  assert.throws(() => forChannel("claude", "openai/gpt-5.6-terra"), /claude solo corre/);
});

test("familia por vendor", () => {
  assert.equal(FAMILY_OF("anthropic/x"), "claude");
  assert.equal(FAMILY_OF("openai/x"), "gpt");
  assert.equal(FAMILY_OF("moonshotai/kimi-k3"), "moonshotai");
});

test("los defaults son de su propio vendor", () => {
  assert.doesNotThrow(() => forChannel("claude", DEFAULT_MODEL.claude));
  assert.doesNotThrow(() => forChannel("codex", DEFAULT_MODEL.codex));
});
