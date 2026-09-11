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

import { agentBinary } from "./lib/binaries.mjs";
import { canonical, DEFAULT_BY_FAMILY, defaultModel, FAMILY_OF, forChannel } from "./lib/models.mjs";
import { CROSS_FAMILY, detectAuthor, familyFromTrailers } from "./lib/family.mjs";
import * as claude from "./lib/channels/claude.mjs";
import * as codex from "./lib/channels/codex.mjs";
import * as openrouter from "./lib/channels/openrouter.mjs";

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
   Devuelve { ok, text, channel, model, seconds, why?, provider?, usage?, cmd? }. */
export async function ask(resolved, opts) {
  if (!resolved?.ok) return { ok: false, text: "", why: resolved?.why || "resolución fallida" };
  if (!opts?.prompt || !String(opts.prompt).trim()) return { ok: false, text: "", why: "prompt vacío" };
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

const fail = (why) => ({ ok: false, why });
