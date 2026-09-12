import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { health } from "../index.mjs";
import { neutralEnv, fakeBin } from "./helpers.mjs";

/* Nada de esto toca la máquina: binarios falsos, clave de mentira,
   `exec` y `ask` inyectados, evidencia y estado en directorios temporales,
   y el reloj fijo. */
const NOW = new Date("2026-09-12T12:00:00Z");
const DAY = 24 * 3600 * 1000;
const okExec = async () => ({ code: 0, stdout: "{}", stderr: "" });
const noAsk = async (channel) => { throw new Error(`ask no debía llamarse (${channel})`); };

function allPresent(extra = {}) {
  return neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "exit 0"), CE_CODEX_BIN: fakeBin("codex", "exit 0"), OPENROUTER_API_KEY: "k", ...extra });
}
function world(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "health-"));
  return { evidenceDir: join(root, "reviews"), stateFile: join(root, "state", "health.json"), exec: okExec, ask: noAsk, now: NOW, ...extra };
}
function evidence(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [name, body, mtime] of files) {
    writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body));
    if (mtime) utimesSync(join(dir, name), mtime, mtime);
  }
}
const review = (agent, extra) => ({ agent, ok: true, why: null, to: "abc1234", verdict: {}, ...extra });
const stamp = (d) => d.toISOString().replace(/[:.]/g, "-").replace("Z", "");

/* ------------------------------------------------------ detectores D10 --- */

test("sin binario, auth de claude fallida o sin clave: down en el acto, con el porqué", async () => {
  const env = neutralEnv({ OPENROUTER_API_KEY: "", CE_CLAUDE_BIN: fakeBin("claude", "exit 0") });
  const exec = async (cmd, args) => (args.join(" ") === "auth status" ? { code: 1, stdout: "", stderr: "Not logged in\n" } : { code: 0, stdout: "", stderr: "" });
  const h = await health(env, world({ exec }));
  assert.equal(h.claude.status, "down");
  assert.match(h.claude.why, /auth status.*Not logged in/);
  assert.equal(h.codex.status, "down");
  assert.match(h.codex.why, /binario/);
  assert.equal(h.codex.bin, null);
  assert.equal(h.openrouter.status, "down");
  assert.match(h.openrouter.why, /clave/);
  assert.equal(h.ignored, 0);
});

test("detectores en verde no deciden: sin evidencia en la ventana los tres quedan unprobed", async () => {
  const env = allPresent();
  const h = await health(env, world());
  assert.deepEqual([h.claude.status, h.codex.status, h.openrouter.status], ["unprobed", "unprobed", "unprobed"]);
  assert.equal(h.claude.bin, env.CE_CLAUDE_BIN);
  assert.equal(h.codex.bin, env.CE_CODEX_BIN);
});

test("claude auth status se pregunta al binario resuelto y con el env dado", async () => {
  const env = allPresent();
  const calls = [];
  const exec = async (cmd, args, opts) => { calls.push([cmd, args, opts?.env?.CE_CLAUDE_BIN]); return { code: 0, stdout: "", stderr: "" }; };
  await health(env, world({ exec }));
  assert.deepEqual(calls, [[env.CE_CLAUDE_BIN, ["auth", "status"], env.CE_CLAUDE_BIN]]);
});

/* ------------------------------------------------------- evidencia D9 --- */

const local = (h) => new Date(h).getTime();

test("evidencia ok reciente de adversarial-review: ok con su instante; el to de otro repo no importa", async () => {
  const w = world();
  const at = new Date(NOW - 2 * DAY);
  evidence(w.evidenceDir, [[`${stamp(at)}-tooled-otro-repo.json`, review("codex", { to: "deadbeef" })]]);
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "ok");
  assert.equal(local(h.codex.at), at.getTime());
  assert.match(h.codex.at, /[+-]\d{2}:\d{2}$/, "RFC 3339 con zona");
  assert.equal(h.claude.status, "unprobed", "la evidencia de codex no habla de claude");
});

test("fallo con try again at futuro: quota con until en zona local; pasado: down con el why literal", async () => {
  const w = world();
  const why = "exited 1 — ERROR: You've hit your usage limit ... or try again at Sep 16th, 2026 10:24 AM.";
  const old = "exited 1 — ERROR: You've hit your usage limit ... or try again at Sep 1st, 2026 9:05 PM.";
  evidence(w.evidenceDir, [
    [`${stamp(new Date(NOW - DAY))}-codex.json`, review("codex", { ok: false, why, verdict: null })],
    [`${stamp(new Date(NOW - DAY))}-claude.json`, review("claude", { ok: false, why: old, verdict: null })],
  ]);
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "quota");
  assert.equal(local(h.codex.until), new Date(2026, 8, 16, 10, 24).getTime());
  assert.equal(h.claude.status, "down");
  assert.equal(h.claude.why, old);
});

test("fallo sin fecha: down con el why, nunca ok", async () => {
  const w = world();
  evidence(w.evidenceDir, [[`${stamp(new Date(NOW - DAY))}-x.json`, review("openrouter", { ok: false, why: "http 401 User not found", verdict: null })]]);
  const h = await health(allPresent(), w);
  assert.equal(h.openrouter.status, "down");
  assert.equal(h.openrouter.why, "http 401 User not found");
});

test("el más reciente manda: un ok viejo no tapa un fallo nuevo, y un ok nuevo tapa un fallo viejo", async () => {
  const w = world();
  evidence(w.evidenceDir, [
    [`${stamp(new Date(NOW - 3 * DAY))}-codex-ok.json`, review("codex")],
    [`${stamp(new Date(NOW - 1 * DAY))}-codex-ko.json`, review("codex", { ok: false, why: "boom", verdict: null })],
    [`${stamp(new Date(NOW - 3 * DAY))}-claude-ko.json`, review("claude", { ok: false, why: "boom", verdict: null })],
    [`${stamp(new Date(NOW - 1 * DAY))}-claude-ok.json`, review("claude")],
  ]);
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "down");
  assert.equal(h.claude.status, "ok");
});

test("empate de instante: gana el fallo", async () => {
  const w = world();
  const at = new Date(NOW - DAY);
  evidence(w.evidenceDir, [
    [`${stamp(at)}-a-ok.json`, review("codex")],
    [`${stamp(at)}-b-ko.json`, review("codex", { ok: false, why: "boom", verdict: null })],
  ]);
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "down");
});

test("ventana de 7 días: una evidencia de hace 8 días no cuenta; nombre sin timestamp usa mtime", async () => {
  const w = world();
  evidence(w.evidenceDir, [
    [`${stamp(new Date(NOW - 8 * DAY))}-codex.json`, review("codex")],
    ["claude-sin-fecha.json", review("claude"), new Date(NOW - 6 * DAY)],
  ]);
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "unprobed");
  assert.equal(h.claude.status, "ok");
});

test("corruptos, sin agent y futuros se cuentan en ignored y no deciden", async () => {
  const w = world();
  evidence(w.evidenceDir, [
    [`${stamp(new Date(NOW - DAY))}-roto.json`, "{"],
    [`${stamp(new Date(NOW - DAY))}-sin-agent.json`, { ok: true }],
    [`${stamp(new Date(NOW.getTime() + DAY))}-futuro.json`, review("codex")],
  ]);
  const h = await health(allPresent(), w);
  assert.equal(h.ignored, 3);
  assert.equal(h.codex.status, "unprobed");
});

/* ------------------------------------------------------ stateFile D13 --- */

const state = (w, body) => { mkdirSync(join(w.stateFile, ".."), { recursive: true }); writeFileSync(w.stateFile, typeof body === "string" ? body : JSON.stringify(body)); };
const iso = (d) => d.toISOString();

test("health.json ausente o corrupto: sin evidencia persistida, unprobed y sin error", async () => {
  const w = world();
  assert.equal((await health(allPresent(), w)).codex.status, "unprobed");
  state(w, "{ roto");
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "unprobed");
  assert.equal(h.ignored, 0);
});

test("health.json válido: ok con latencia, down con why, y un try again at futuro es quota", async () => {
  const w = world();
  state(w, {
    claude: { status: "ok", at: iso(new Date(NOW - DAY)), latency: 1.8 },
    codex: { status: "down", at: iso(new Date(NOW - DAY)), why: "exited 1 — try again at Sep 16th, 2026 10:24 AM." },
    openrouter: { status: "down", at: iso(new Date(NOW - DAY)), why: "http 401" },
  });
  const h = await health(allPresent(), w);
  assert.equal(h.claude.status, "ok");
  assert.equal(h.claude.latency, 1.8);
  assert.equal(h.codex.status, "quota");
  assert.equal(local(h.codex.until), new Date(2026, 8, 16, 10, 24).getTime());
  assert.equal(h.openrouter.status, "down");
  assert.equal(h.openrouter.why, "http 401");
});

test("health.json y adversarial-review compiten por instante: el más reciente manda", async () => {
  const w = world();
  state(w, { codex: { status: "ok", at: iso(new Date(NOW - 3 * DAY)), latency: 2 }, claude: { status: "down", at: iso(new Date(NOW - DAY)), why: "boom" } });
  evidence(w.evidenceDir, [
    [`${stamp(new Date(NOW - DAY))}-codex-ko.json`, review("codex", { ok: false, why: "boom", verdict: null })],
    [`${stamp(new Date(NOW - 3 * DAY))}-claude-ok.json`, review("claude")],
  ]);
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "down");
  assert.equal(h.claude.status, "down");
});

test("un registro de health.json con fecha futura, sin fecha o fuera de la ventana no cuenta", async () => {
  const w = world();
  state(w, {
    claude: { status: "ok", at: iso(new Date(NOW.getTime() + DAY)), latency: 1 },
    codex: { status: "ok", latency: 1 },
    openrouter: { status: "ok", at: iso(new Date(NOW - 8 * DAY)), latency: 1 },
  });
  const h = await health(allPresent(), w);
  assert.deepEqual([h.claude.status, h.codex.status, h.openrouter.status], ["unprobed", "unprobed", "unprobed"]);
  assert.equal(h.ignored, 2, "futuro y sin fecha se cuentan como ignorados; fuera de ventana no es inválido");
});

/* ---------------------------------------------------------- probe D7 --- */

test("probe: pong a los tres en paralelo; responde → ok con latencia, falla → down con why, cuelga → down por timeout", async () => {
  const w = world();
  const started = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const ask = async (channel) => {
    started.push(channel);
    await gate;
    if (channel === "claude") return { ok: true, text: "pong", seconds: 1.8 };
    if (channel === "codex") return { ok: false, text: "", why: "salió con código 1: usage limit" };
    return new Promise(() => {});
  };
  const p = health(allPresent(), { ...w, probe: true, ask, probeTimeoutMs: 100 });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual([...started].sort(), ["claude", "codex", "openrouter"], "los tres arrancan antes de que ninguno termine");
  release();
  const h = await p;
  assert.equal(h.claude.status, "ok");
  assert.equal(h.claude.latency, 1.8);
  assert.equal(h.claude.at, rfc(NOW));
  assert.equal(h.codex.status, "down");
  assert.equal(h.codex.why, "salió con código 1: usage limit");
  assert.equal(h.openrouter.status, "down");
  assert.match(h.openrouter.why, /timeout.*0\.1 s/);
});

import { rfc3339 as rfc } from "../index.mjs";
import { readdirSync } from "node:fs";

test("probe persiste los tres en health.json (atómico, sin temporal a la vista) y conserva lo que ya había", async () => {
  const w = world();
  state(w, { claude: { status: "ok", at: iso(new Date(NOW - DAY)), latency: 9 }, otro: { status: "ok", at: iso(NOW) } });
  const ask = async (channel) => (channel === "codex" ? { ok: false, why: "exited 1 — try again at Sep 16th, 2026 10:24 AM." } : { ok: true, seconds: 0.5 });
  const h = await health(allPresent(), { ...w, probe: true, ask });
  const saved = JSON.parse(readFileSync(w.stateFile, "utf8"));
  assert.deepEqual(saved.claude, { status: "ok", at: rfc(NOW), latency: 0.5 });
  assert.deepEqual(saved.codex, { status: "down", at: rfc(NOW), why: "exited 1 — try again at Sep 16th, 2026 10:24 AM." });
  assert.deepEqual(saved.openrouter, { status: "ok", at: rfc(NOW), latency: 0.5 });
  assert.deepEqual(saved.otro, { status: "ok", at: iso(NOW) }, "lo que no es de este sondeo se conserva");
  assert.deepEqual(readdirSync(join(w.stateFile, "..")), ["health.json"]);
  assert.equal(h.codex.status, "quota", "el resultado del sondeo se evalúa como cualquier evidencia");
  assert.equal(local(h.codex.until), new Date(2026, 8, 16, 10, 24).getTime());
});

test("probe con health.json corrupto lo reemplaza; un canal con detector en rojo no se sondea", async () => {
  const w = world();
  state(w, "{ roto");
  const env = allPresent({ CE_CODEX_BIN: "" });
  const asked = [];
  const ask = async (channel) => { asked.push(channel); return { ok: true, seconds: 1 }; };
  const h = await health(env, { ...w, probe: true, ask });
  assert.deepEqual(asked.sort(), ["claude", "openrouter"]);
  assert.equal(h.codex.status, "down");
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(w.stateFile, "utf8"))).sort(), ["claude", "openrouter"]);
});

/* ------------------------------------------------------------ ask D12 --- */

import { ask as realAsk, resolve } from "../index.mjs";

test("ask() escribe la salud del canal al terminar: ok con latencia, fallo con why; stateFile null no escribe", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "cat"), CE_CODEX_BIN: fakeBin("codex", "cat >/dev/null; echo boom >&2; exit 3") });
  const stateFile = join(mkdtempSync(join(tmpdir(), "ask-state-")), "health.json");
  const a = await realAsk(resolve({ need: "text", channel: "claude" }, env), { prompt: "pong", env, stateFile, now: NOW });
  assert.equal(a.ok, true);
  const b = await realAsk(resolve({ need: "text", channel: "codex" }, env), { prompt: "pong", env, stateFile, now: NOW });
  assert.equal(b.ok, false);
  const saved = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(saved.claude.status, "ok");
  assert.equal(saved.claude.at, rfc(NOW));
  assert.equal(typeof saved.claude.latency, "number");
  assert.equal(saved.codex.status, "down");
  assert.match(saved.codex.why, /código 3.*boom/s);
  const other = join(mkdtempSync(join(tmpdir(), "ask-state-")), "health.json");
  await realAsk(resolve({ need: "text", channel: "claude" }, env), { prompt: "pong", env, stateFile: null });
  assert.equal(readdirSync(join(other, "..")).length, 0);
});

test("sin stateFile, ask() escribe en $HOME/.local/state/jarviis/health.json del env que recibe", async () => {
  const env = neutralEnv({ CE_CLAUDE_BIN: fakeBin("claude", "cat") });
  await realAsk(resolve({ need: "text", channel: "claude" }, env), { prompt: "pong", env });
  const saved = JSON.parse(readFileSync(join(env.HOME, ".local", "state", "jarviis", "health.json"), "utf8"));
  assert.equal(saved.claude.status, "ok");
  const h = await health(env, { evidenceDir: join(env.HOME, "nada"), exec: okExec, ask: noAsk });
  assert.equal(h.claude.status, "ok", "health() lo lee de la misma ruta por defecto");
});

test("probe que no puede persistir: el resultado del pong se devuelve igual, sin error", async () => {
  const w = world();
  const ask = async () => ({ ok: true, seconds: 0.7 });
  const blocked = join(w.stateFile, "..", "..");
  mkdirSync(blocked, { recursive: true });
  writeFileSync(join(blocked, "state"), "no soy un directorio");
  const h = await health(allPresent(), { ...w, probe: true, ask });
  assert.deepEqual([h.claude.status, h.codex.status, h.openrouter.status], ["ok", "ok", "ok"]);
  assert.equal(h.claude.latency, 0.7);
});

test("los instantes persistidos conservan milisegundos: un ok a las .900 gana a un fallo a las .500 del mismo segundo", async () => {
  const w = world();
  const t = new Date("2026-09-12T11:00:00.500Z");
  evidence(w.evidenceDir, [[`${stamp(t)}-codex-ko.json`, review("codex", { ok: false, why: "boom", verdict: null })]]);
  const later = new Date("2026-09-12T11:00:00.900Z");
  await realAsk(resolve({ need: "text", channel: "codex" }, neutralEnv({ CE_CODEX_BIN: fakeBin("codex", 'while [ $# -gt 0 ]; do case "$1" in -o) OUT="$2"; shift;; esac; shift; done; cat > "$OUT"') })), { prompt: "pong", stateFile: w.stateFile, now: later, env: neutralEnv() });
  const h = await health(allPresent(), w);
  assert.equal(h.codex.status, "ok");
});

import { openrouterStub, delta } from "./helpers.mjs";

test("el timeout del sondeo corta la petición real a OpenRouter, no solo deja de esperarla", async () => {
  let closed;
  const gone = new Promise((r) => { closed = r; });
  const stub = await openrouterStub(async (_, res, req) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    /* Goteo constante sin [DONE]: el vigilante de silencio nunca salta, así
       que solo la señal del sondeo puede cerrar esta conexión. */
    const drip = setInterval(() => res.write(delta("o")), 20);
    res.on("close", () => { clearInterval(drip); closed(Date.now()); });
  });
  try {
    const env = neutralEnv({ CE_OPENROUTER_URL: stub.url, OPENROUTER_API_KEY: "k", CE_CLAUDE_BIN: fakeBin("claude", "cat"), CE_CODEX_BIN: "" });
    const t0 = Date.now();
    const h = await health(env, { ...world({ ask: undefined }), probe: true, probeTimeoutMs: 150 });
    assert.equal(h.openrouter.status, "down");
    assert.match(h.openrouter.why, /timeout/);
    const at = await Promise.race([gone, new Promise((r) => setTimeout(() => r(null), 2000))]);
    assert.ok(at && at - t0 < 1500, "la conexión se cerró al vencer el timeout");
  } finally { await stub.close(); }
});
