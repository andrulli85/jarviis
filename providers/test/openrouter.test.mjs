import { test } from "node:test";
import assert from "node:assert/strict";
import { ask, resolve } from "../index.mjs";
import { neutralEnv, openrouterStub, sse, delta } from "./helpers.mjs";

const headers = { "content-type": "text/event-stream" };

async function withStub(handler, fn) {
  const stub = await openrouterStub(handler);
  try {
    const env = neutralEnv({ CE_OPENROUTER_URL: stub.url, OPENROUTER_API_KEY: "sk-fake" });
    await fn(env);
  } finally { await stub.close(); }
}

test("stream: junta deltas, registra proveedor y uso, pide streaming y esfuerzo", async () => {
  let seen;
  await withStub((body, res) => {
    seen = body;
    res.writeHead(200, headers);
    res.write(delta("hola ", { provider: "Phala" }));
    res.write(delta("mundo"));
    res.write(sse({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5,
      completion_tokens_details: { reasoning_tokens: 3 }, cost: 0.001 } }));
    res.end("data: [DONE]\n\n");
  }, async (env) => {
    const a = await ask(resolve({ need: "text", model: "terra" }, env), { prompt: "p", system: "s", json: true, env });
    assert.equal(a.ok, true);
    assert.equal(a.text, "hola mundo");
    assert.equal(a.provider, "Phala");
    assert.deepEqual(a.usage, { in: 10, out: 5, reasoning: 3, cost: 0.001 });
    assert.equal(seen.model, "openai/gpt-5.6-terra");
    assert.equal(seen.stream, true);
    assert.deepEqual(seen.reasoning, { effort: "high" });
    assert.deepEqual(seen.response_format, { type: "json_object" });
    assert.deepEqual(seen.messages, [{ role: "system", content: "s" }, { role: "user", content: "p" }]);
    assert.ok(seen.max_tokens >= 8000);
  });
});

test("stream: una ñ partida en dos chunks llega entera", async () => {
  await withStub((body, res) => {
    res.writeHead(200, headers);
    const frame = Buffer.from(delta("ñandú"), "utf8");
    /* Cortar dentro de los dos bytes de la ñ. */
    const cut = frame.indexOf(Buffer.from("ñ", "utf8")) + 1;
    res.write(frame.subarray(0, cut));
    setTimeout(() => { res.write(frame.subarray(cut)); res.end("data: [DONE]\n\n"); }, 20);
  }, async (env) => {
    const a = await ask(resolve({ need: "text" }, env), { prompt: "p", env });
    assert.equal(a.ok, true);
    assert.equal(a.text, "ñandú");
  });
});

test("http no 2xx es un fallo con el código", async () => {
  await withStub((body, res) => { res.writeHead(402); res.end("insufficient credits"); },
    async (env) => {
      const a = await ask(resolve({ need: "text" }, env), { prompt: "p", env });
      assert.equal(a.ok, false);
      assert.match(a.why, /http 402.*insufficient/);
    });
});

test("un error a mitad de stream, tras contenido, es un fallo", async () => {
  await withStub((body, res) => {
    res.writeHead(200, headers);
    res.write(delta("parcial"));
    res.write(sse({ error: { message: "provider overloaded" } }));
    res.end("data: [DONE]\n\n");
  }, async (env) => {
    const a = await ask(resolve({ need: "text" }, env), { prompt: "p", env });
    assert.equal(a.ok, false);
    assert.match(a.why, /provider overloaded/);
    assert.equal(a.text, "parcial", "lo que llegó se conserva como evidencia");
  });
});

test("200 sin contenido es una respuesta que no llegó", async () => {
  await withStub((body, res) => { res.writeHead(200, headers); res.end("data: [DONE]\n\n"); },
    async (env) => {
      const a = await ask(resolve({ need: "text" }, env), { prompt: "p", env });
      assert.equal(a.ok, false);
      assert.match(a.why, /respuesta vacía/);
    });
});

test("silencio prolongado aborta y lo dice", async () => {
  let res0;
  await withStub((body, res) => { res0 = res; res.writeHead(200, headers); res.write(delta("a")); /* y nada más */ },
    async (env) => {
      const a = await ask(resolve({ need: "text" }, env), { prompt: "p", env, idleMs: 150 });
      assert.equal(a.ok, false);
      assert.match(a.why, /silencio/);
      res0?.end();
    });
});

test("conexión rechazada es un fallo, no una excepción", async () => {
  const env = neutralEnv({ OPENROUTER_API_KEY: "sk-fake" });
  const a = await ask(resolve({ need: "text" }, env), { prompt: "p", env });
  assert.equal(a.ok, false);
  assert.match(a.why, /no se pudo conectar/);
});

test("sin clave, ask falla antes de tocar la red", async () => {
  const { ask: rawAsk } = await import("../lib/channels/openrouter.mjs");
  const r = await rawAsk({ model: "anthropic/claude-opus-5" }, { prompt: "p", env: neutralEnv() });
  assert.match(r.why, /sin clave/);
});
