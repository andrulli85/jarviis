/* providers/index.mjs: la única puerta a un modelo en toda la fábrica.

   El wayfinder elige la estación. La estación declara qué NECESITA:
     need: "agent"  un agente con herramientas sobre un árbol (claude o codex)
     need: "text"   una respuesta a un prompt, sin herramientas (openrouter,
                    o un CLI en modo texto si se nombra)
   y `resolve` decide QUIÉN lo atiende. Ninguna estación llama a un binario o
   a una URL por su cuenta.

   Dos reglas que no se negocian:
   1. Una respuesta que no llegó no es una respuesta. `ask` nunca devuelve
      ok:true con texto vacío, y nunca lanza por un fallo del proveedor: dice
      qué pasó en `why`.
   2. Ningún test toca un proveedor real. Los binarios se apuntan a rutas
      inexistentes y OpenRouter a un stub local. */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentBinary } from "./lib/binaries.mjs";
import { canonical, DEFAULT_BY_FAMILY, defaultModel, FAMILY_OF, forChannel } from "./lib/models.mjs";
import { CROSS_FAMILY, detectAuthor, familyFromTrailers } from "./lib/family.mjs";
import * as claude from "./lib/channels/claude.mjs";
import * as codex from "./lib/channels/codex.mjs";
import * as openrouter from "./lib/channels/openrouter.mjs";
import { readEvidence } from "./evidence.mjs";

export { readEvidence };
export { agentBinary, canonical, detectAuthor, familyFromTrailers, CROSS_FAMILY, FAMILY_OF };

export const CHANNELS = { claude, codex, openrouter };
const CHANNEL_OF_FAMILY = { claude: "claude", gpt: "codex" };
const NEEDS = ["agent", "text"];

/* spec:
     need      "agent" | "text"                          obligatorio
     channel   "claude" | "codex" | "openrouter"         override explícito
     family    "claude" | "gpt"                          quiero esta familia
     opposite  "claude" | "gpt"                          quiero la OTRA familia
     model     alias o id canónico                       modelo concreto
   Devuelve { ok:true, need, channel, model, bin?, how } o { ok:false, why }.
   `how` dice qué regla decidió, para que la evidencia lo pueda explicar. */
export function resolve(spec = {}, env = process.env) {
  const need = spec.need;
  if (!NEEDS.includes(need)) return fail(`need debe ser uno de ${NEEDS.join(", ")}; llegó ${JSON.stringify(need)}`);

  let model = spec.model ? canonical(spec.model) : null;
  if (spec.model && !model) return fail(`no reconozco el modelo "${spec.model}": usa vendor/modelo o un alias (opus, terra, ...)`);

  /* Familia: explícita > opuesta a una dada > la del modelo > default claude. */
  let family = null, how = null;
  if (spec.family) {
    /* Una familia que no está en la tabla no es "otra familia": es un error,
       salvo que venga con un modelo de ese vendor para openrouter. */
    if (!CROSS_FAMILY[spec.family] && !(model && FAMILY_OF(model) === spec.family)) {
      return fail(`familia desconocida "${spec.family}"; conozco ${Object.keys(CROSS_FAMILY).join(", ")}`);
    }
    family = spec.family; how = "family=" + spec.family;
  }
  else if (spec.opposite) {
    family = CROSS_FAMILY[spec.opposite];
    if (!family) return fail(`no hay familia opuesta registrada a "${spec.opposite}"`);
    how = "opuesta a " + spec.opposite;
  } else if (model) { family = FAMILY_OF(model); how = "familia del modelo " + model; }

  let channel = spec.channel || null;
  if (channel && !CHANNELS[channel]) return fail(`canal desconocido "${channel}"; conozco ${Object.keys(CHANNELS).join(", ")}`);

  if (need === "agent") {
    if (channel === "openrouter") return fail("openrouter no tiene herramientas sobre el árbol; need:agent requiere claude o codex");
    if (!channel) {
      const fam = family || "claude";
      channel = CHANNEL_OF_FAMILY[fam];
      if (!channel) return fail(`ningún agente con herramientas es de la familia "${fam}"; solo claude (anthropic) y codex (openai)`);
      how = how || "default claude";
    }
  } else if (!channel) {
    channel = "openrouter";
    how = how || "default openrouter para texto";
  }

  /* Sin modelo: el de la familia pedida si la hay, si no el del canal. Así
     un juicio de texto "opuesto a claude" por openrouter recibe un modelo
     GPT y no el default Anthropic con una etiqueta que dice lo contrario. */
  if (!model) {
    try { model = (family && DEFAULT_BY_FAMILY[family]) || defaultModel(channel, env); }
    catch (e) { return fail(e.message); }
  }
  /* El canal solo corre su propio vendor, y la familia pedida es la del
     modelo en cualquier canal. Un modelo de Anthropic pedido con familia gpt
     es una contradicción, no una traducción. */
  try { forChannel(channel, model); } catch (e) { return fail(e.message); }
  if (family && FAMILY_OF(model) !== family) {
    return fail(`el modelo ${model} no es de la familia ${family}`);
  }

  const out = { ok: true, need, channel, model, how: how || "canal explícito " + channel };
  if (channel === "claude" || channel === "codex") {
    const bin = agentBinary(channel, env);
    if (!bin) return fail(`no hay binario de ${channel}: ni CE_${channel.toUpperCase()}_BIN ni Conductor lo tienen`);
    out.bin = bin;
  } else if (!openrouter.apiKey(env)) {
    return fail("sin clave de OpenRouter: ni OPENROUTER_API_KEY ni ~/.config/openrouter/key");
  }
  return out;
}

/* opts:
     prompt     obligatorio
     system     opcional; va delante del prompt en los CLIs, como role:system en HTTP
     cwd        árbol sobre el que trabaja el agente (need:agent)
     mode       "readonly" | "edit" | "full"   (need:agent; default readonly)
     effort     "low" | "medium" | "high" | "xhigh"  (default high)
     json       pedir JSON (solo openrouter)
     timeoutMs  para los CLIs; idleMs para openrouter
     env        entorno (default process.env); de ahí salen HOME y las claves
     stateFile  dónde dejar la evidencia de salud del canal (D12); default
                ~/.local/state/jarviis/health.json del env, null para no dejarla
     now        reloj para esa evidencia (tests)
   Devuelve { ok, text, channel, model, seconds, why?, provider?, usage?, cmd? }.

   Todo uso real deja evidencia de salud al terminar (D12): así un
   /ping-test o una review renuevan la ventana de 7 días de `health()` sin
   sondear a propósito. */
export async function ask(resolved, opts) {
  if (!resolved?.ok) return { ok: false, text: "", why: resolved?.why || "resolución fallida" };
  if (!opts?.prompt || !String(opts.prompt).trim()) return { ok: false, text: "", why: "prompt vacío" };
  const r = await askChannel(resolved, opts);
  const stateFile = opts.stateFile === undefined ? defaultStateFile(opts.env || process.env) : opts.stateFile;
  await recordHealth(stateFile, resolved.channel, r, opts.now);
  return r;
}

async function askChannel(resolved, opts) {
  const ch = CHANNELS[resolved.channel];
  const r = await ch.ask(resolved, opts);
  const base = { channel: resolved.channel, model: resolved.model, seconds: r.seconds ?? 0 };
  if (r.why) return { ok: false, text: r.text || "", why: r.why, ...base, provider: r.provider };
  if (r.killed) return { ok: false, text: r.text || "", why: "el agente superó el timeout y fue matado", ...base, cmd: r.cmd };
  if (typeof r.code === "number" && r.code !== 0) {
    return { ok: false, text: r.text || "", why: `salió con código ${r.code}: ${(r.stderr || "").trim().slice(-300)}`, ...base, cmd: r.cmd };
  }
  if (!r.text) return { ok: false, text: "", why: "respuesta vacía: una respuesta que no llegó no es una respuesta", ...base, cmd: r.cmd, provider: r.provider };
  return { ok: true, text: r.text, ...base, provider: r.provider, usage: r.usage, cmd: r.cmd };
}

/* Qué hay disponible ahora mismo, sin gastar nada. Para que el wayfinder y
   `ask.mjs --status` cuenten la verdad. */
export function status(env = process.env) {
  return {
    claude: agentBinary("claude", env),
    codex: agentBinary("codex", env),
    openrouter: openrouter.apiKey(env) ? "clave presente" : null,
    author: detectAuthor(env),
  };
}

/* ---------------------------------------------------------------- health --- */

/* Salud de cada canal: si hay evidencia RECIENTE de que respondió, no si
   está instalado. "Instalado" se vendió dos días como "responde" con codex
   sin cuota (spec stations-check-proveedores-y-review, D8–D10).

   health(env, { probe, evidenceDir, stateFile, exec, ask, now })
     → { claude, codex, openrouter, ignored }, por canal
       { bin, status: "ok"|"quota"|"down"|"unprobed", at?, latency?, until?, why? }

   1. Detectores inmediatos (D10): sin binario, `claude auth status` ≠ 0 o
      sin clave de OpenRouter → down ya. Si pasan, no deciden nada: que la
      clave exista no prueba que responda.
   2. Evidencia (D8, D9): lo que dejó adversarial-review (`agent` = canal,
      de cualquier repo) más el registro del canal en health.json. El más
      reciente dentro de 7 días manda; en empate gana el fallo. Nada → unprobed.
   3. `probe` (D1, D7): un "pong" a los tres en paralelo, 30 s por canal,
      resultado persistido en health.json y evaluado como cualquier evidencia.

   Todo lo que toca la máquina es inyectable: `exec` para el detector,
   `ask` para el sondeo, `now` para el reloj, y las dos rutas. */
export const HEALTH_CHANNELS = ["claude", "codex", "openrouter"];

/* Donde adversarial-review escribe, con su misma precedencia
   (tooled-review.mjs): CE_REVIEW_DIR, si no $ANDY_TOOLKIT_STATE_DIR/
   adversarial-reviews, si no ~/.claude/adversarial-reviews. Leer otra ruta
   que la escrita es no ver la evidencia que sí existe. */
export function defaultEvidenceDir(env = process.env) {
  return env.CE_REVIEW_DIR || join(env.ANDY_TOOLKIT_STATE_DIR || join(env.HOME || homedir(), ".claude"), "adversarial-reviews");
}
export function defaultStateFile(env = process.env) {
  return env.JARVIIS_STATE_FILE || join(env.HOME || homedir(), ".local", "state", "jarviis", "health.json");
}

/* execFile que nunca lanza: un binario que no arranca es un código ≠ 0 con
   su causa en stderr, igual que uno que arranca y falla. */
function defaultExec(cmd, args, { env = process.env, timeoutMs = 10000 } = {}) {
  return new Promise((done) => {
    execFile(cmd, args, { env, timeout: timeoutMs, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err && typeof err.code !== "number") return done({ code: 1, stdout: stdout || "", stderr: stderr || err.message });
      done({ code: err ? err.code : 0, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

const trimmed = (s) => String(s || "").trim().replace(/\s+/g, " ").slice(0, 160);

/* Lo que se sabe sin gastar nada. `down` con el porqué, o null cuando el
   detector pasa (y entonces no dice nada sobre si responde). */
async function detect(channel, env, exec) {
  if (channel === "openrouter") {
    return openrouter.apiKey(env) ? { bin: null, down: null } : { bin: null, down: "sin clave de OpenRouter: ni OPENROUTER_API_KEY ni ~/.config/openrouter/key" };
  }
  const bin = agentBinary(channel, env);
  if (!bin) return { bin: null, down: `no hay binario de ${channel}: ni CE_${channel.toUpperCase()}_BIN ni Conductor lo tienen` };
  if (channel === "claude") {
    const r = await exec(bin, ["auth", "status"], { env, timeoutMs: 10000 });
    if (r.code !== 0) return { bin, down: `claude auth status salió con ${r.code}: ${trimmed(r.stderr || r.stdout)}` };
  }
  return { bin, down: null };
}

export const HEALTH_WINDOW_MS = 7 * 24 * 3600 * 1000;

/* RFC 3339 con la zona local (2026-09-16T10:24:00.000-03:00): legible en
   el pie y comparable en cualquier sitio. */
export function rfc3339(date) {
  const d = date instanceof Date ? date : new Date(date);
  const off = -d.getTimezoneOffset();
  const p = (n) => String(Math.abs(n)).padStart(2, "0");
  /* Con milisegundos: dos hechos del mismo segundo (un fallo a las .500 y
     un pong a las .900) se ordenan por lo que pasó, no por el redondeo. */
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${ms}${off < 0 ? "-" : "+"}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

/* "try again at Sep 16th, 2026 10:24 AM." → esa fecha en zona local (D9:
   el mensaje de Codex viene sin zona y la máquina es personal). Null si no
   hay fecha o no parsea: entonces el fallo es down, nunca ok. */
export function quotaUntil(why) {
  const m = String(why || "").match(/try again at\s+([^\n]+?)(?:\.\s|\.$|$)/i);
  if (!m) return null;
  const clean = m[1].replace(/(\d)(st|nd|rd|th)\b/g, "$1").trim();
  const d = new Date(clean);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* health.json: { <canal>: { status: "ok"|"down", at, latency?, why? } }.
   Ausente o corrupto es "sin evidencia persistida", nunca un error (D13).
   Un registro sin `at` legible o con `at` futuro se ignora y se cuenta. */
export function readState(stateFile) {
  if (!stateFile || !existsSync(stateFile)) return {};
  try {
    const body = JSON.parse(readFileSync(stateFile, "utf8"));
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch { return {}; }
}

/* Escritura atómica (temporal + rename) y en serie por archivo: tres
   sondeos en paralelo no se pisan el read-modify-write. Nunca lanza: un
   disco que no deja escribir no convierte una respuesta en un error. */
const writing = new Map();
export function recordHealth(stateFile, channel, result, now) {
  if (!stateFile) return Promise.resolve();
  now = now instanceof Date ? now : new Date(now ?? Date.now());
  const rec = result.ok
    ? { status: "ok", at: rfc3339(now), latency: result.seconds ?? null }
    : { status: "down", at: rfc3339(now), why: result.why || "sin respuesta" };
  const prev = writing.get(stateFile) || Promise.resolve();
  const next = prev.then(() => {
    try {
      mkdirSync(join(stateFile, ".."), { recursive: true });
      const tmp = `${stateFile}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, JSON.stringify({ ...readState(stateFile), [channel]: rec }, null, 2) + "\n");
      renameSync(tmp, stateFile);
    } catch { /* sin estado persistido; la próxima lectura dirá unprobed */ }
  });
  writing.set(stateFile, next);
  return next;
}

export const PROBE_TIMEOUT_MS = 30000;

/* Un "pong" real por el canal, sin herramientas, con techo de tiempo. El
   `ask` real ya escribe su evidencia (D12); aquí se le pide que no, porque
   el sondeo la escribe con el mismo `now` que evalúa. `signal` corta la
   petición cuando vence el techo: dejar de esperar no es lo mismo que colgar. */
function defaultProbe(env) {
  return (channel, { signal, timeoutMs } = {}) => ask(resolve({ need: "text", channel }, env), { prompt: "pong", timeoutMs, idleMs: timeoutMs, signal, env, stateFile: null });
}

/* askFn(channel, { signal, timeoutMs }) → { ok, seconds?, why? }. Al vencer
   el techo se aborta la señal y se responde por el canal sin esperar. */
async function probeChannel(channel, askFn, timeoutMs) {
  const ctl = new AbortController();
  let timer;
  const clock = new Promise((r) => {
    timer = setTimeout(() => { ctl.abort(); r({ ok: false, why: `timeout: sin respuesta en ${timeoutMs / 1000} s` }); }, timeoutMs);
  });
  try {
    const r = await Promise.race([Promise.resolve().then(() => askFn(channel, { signal: ctl.signal, timeoutMs })).catch((e) => ({ ok: false, why: e.message })), clock]);
    return r && r.ok ? { ok: true, seconds: r.seconds ?? null } : { ok: false, why: r?.why || "sin respuesta" };
  } finally { clearTimeout(timer); }
}

function stateFact(rec, now) {
  if (!rec || typeof rec !== "object") return { fact: null, ignored: 0 };
  const at = new Date(rec.at ?? NaN);
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) return { fact: null, ignored: 1 };
  return { fact: { at, ok: rec.status === "ok", why: rec.why ?? null, latency: rec.latency ?? null }, ignored: 0 };
}

/* De un hecho ({ at, ok, why, latency }) al estado del canal. */
function verdictOf(fact, now) {
  const base = { at: rfc3339(fact.at) };
  if (fact.ok) return fact.latency != null ? { status: "ok", ...base, latency: fact.latency } : { status: "ok", ...base };
  const until = quotaUntil(fact.why);
  if (until && until.getTime() > now.getTime()) return { status: "quota", ...base, until: rfc3339(until), why: fact.why };
  return { status: "down", ...base, why: fact.why };
}

/* El hecho más reciente dentro de la ventana; en empate, el fallo. */
function latest(facts, now) {
  const floor = now.getTime() - HEALTH_WINDOW_MS;
  const inWindow = facts.filter((f) => f.at.getTime() >= floor && f.at.getTime() <= now.getTime());
  inWindow.sort((a, b) => (b.at - a.at) || (a.ok === b.ok ? 0 : a.ok ? 1 : -1));
  return inWindow[0] || null;
}

export async function health(env = process.env, opts = {}) {
  const exec = opts.exec || defaultExec;
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());
  const evidenceDir = opts.evidenceDir || defaultEvidenceDir(env);
  const stateFile = opts.stateFile || defaultStateFile(env);
  const detected = {};
  for (const channel of HEALTH_CHANNELS) detected[channel] = await detect(channel, env, exec);
  /* Sondeo (D7): los que pasan el detector, a la vez. Cada resultado va a
     health.json y también entra en memoria: un disco que no deja escribir
     no convierte un pong que llegó en "sin sondear". */
  const probed = {};
  if (opts.probe) {
    const askFn = opts.ask || defaultProbe(env);
    const timeoutMs = opts.probeTimeoutMs || PROBE_TIMEOUT_MS;
    const live = HEALTH_CHANNELS.filter((c) => !detected[c].down);
    const results = await Promise.all(live.map((c) => probeChannel(c, askFn, timeoutMs)));
    live.forEach((c, i) => { probed[c] = { at: now, ok: results[i].ok, why: results[i].why ?? null, latency: results[i].seconds ?? null }; });
    await Promise.all(live.map((c, i) => recordHealth(stateFile, c, results[i], now)));
  }
  const ev = readEvidence({ evidenceDir, now });
  const persisted = readState(stateFile);
  const out = { ignored: ev.ignored };
  for (const channel of HEALTH_CHANNELS) {
    const d = detected[channel];
    if (d.down) { out[channel] = { bin: d.bin, status: "down", why: d.down }; continue; }
    const facts = ev.records.filter((r) => r.agent === channel).map((r) => ({ at: r.at, ok: r.ok, why: r.why }));
    const st = stateFact(persisted[channel], now);
    out.ignored += st.ignored;
    if (st.fact) facts.push(st.fact);
    if (probed[channel]) facts.push(probed[channel]);
    const fact = latest(facts, now);
    out[channel] = fact ? { bin: d.bin, ...verdictOf(fact, now) } : { bin: d.bin, status: "unprobed" };
  }
  return out;
}

const fail = (why) => ({ ok: false, why });
