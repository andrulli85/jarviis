import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAuthor, familyFromTrailers } from "../lib/family.mjs";

test("CE_REVIEW_AUTHOR manda sobre todo", () => {
  assert.deepEqual(detectAuthor({ CE_REVIEW_AUTHOR: "gpt", AI_AGENT: "claude-code" }), { family: "gpt", how: "CE_REVIEW_AUTHOR=gpt" });
  assert.equal(detectAuthor({ CE_REVIEW_AUTHOR: "anthropic/claude-opus-5" }).family, "claude");
});

test("AI_AGENT de Conductor decide antes que marcas del shell", () => {
  assert.equal(detectAuthor({ AI_AGENT: "codex_0.153", CLAUDECODE: "1" }).family, "gpt");
  assert.equal(detectAuthor({ AI_AGENT: "claude-code_2-1-263_agent" }).family, "claude");
});

test("sin evidencia, sin autor", () => {
  assert.deepEqual(detectAuthor({}), { family: null, how: null });
});

test("trailers: una familia, mixto, ninguno", () => {
  assert.equal(familyFromTrailers("Claude Opus 5 <noreply@anthropic.com>\n"), "claude");
  assert.equal(familyFromTrailers("Codex <codex@openai.com>"), "gpt");
  assert.equal(familyFromTrailers("Claude <a@anthropic.com>\nCodex <c@openai.com>"), "mixed");
  assert.equal(familyFromTrailers(""), null);
});
