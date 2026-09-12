/* channels/openrouter.mjs: cualquier modelo por HTTP, sin herramientas.

   Extraído del adversarial-review.mjs retirado el 2026-09-10, donde se
   establecieron el contrato, el vocabulario de fallos y la mayoría de los
   números. Lo que se conserva y por qué:

   - STREAMING SIEMPRE. Es la única forma que sobrevive a un modelo que
     razona, y un primer byte a los 3 s es la diferencia entre "está
     trabajando" y "está colgado".
   - VIGILANTE DE SILENCIO, no de duración. En un diff de 78 KB la respuesta
     llegó a los 357 s con un hueco mudo de 344 s en medio. Menos de seis
     minutos de paciencia mata una corrida sana; sin paciencia, un proveedor
     que mantiene el socket abierto cuelga el comando para siempre.
   - DECODIFICADOR CON ESTADO. Decodificar cada chunk por separado parte una
     ñ cuyos bytes caen en dos chunks: dos U+FFFD, el JSON parsea y la
     evidencia pierde el carácter en silencio.
   - TECHO DE TOKENS GENEROSO. El presupuesto es compartido entre pensar y
     responder; un modelo que agota los 16000 pensando devuelve cero
     caracteres a precio completo. 64000, con suelo en 8000.
   - EL PROVEEDOR REAL SE REGISTRA. El mismo id fue a Phala en una llamada y
     a Morph en la siguiente, y no son el mismo reviewer: el despliegue FP4
     de Morph devolvía 0 tokens de razonamiento con `response_format`. Sin
     este campo, la evidencia no explica su propio resultado. */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const URL_DEFAULT = "https://openrouter.ai/api/v1/chat/completions";
export const MAX_TOKENS = 64000;
export const FLOOR_TOKENS = 8000;
export const IDLE_LIMIT_DEFAULT = 15 * 60 * 1000;

export function endpoint(env = process.env) { return env.CE_OPENROUTER_URL || URL_DEFAULT; }

/* La clave: primero el entorno (así está en el .zshenv de Andres), luego el
   archivo que usaba la skill retirada. Null si no hay ninguna. */
export function apiKey(env = process.env) {
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim()) return env.OPENROUTER_API_KEY.trim();
  const file = env.OPENROUTER_KEY_FILE || join(env.HOME || homedir(), ".config/openrouter/key");
  if (existsSync(file)) {
    const k = readFileSync(file, "utf8").trim();
    if (k) return k;
  }
  return null;
}

export async function ask(resolved, { prompt, system, effort = "high", json = false, maxTokens = MAX_TOKENS,
  idleMs, signal, env = process.env }) {
  const key = apiKey(env);
  if (!key) return { text: "", why: "sin clave de OpenRouter: ni OPENROUTER_API_KEY ni ~/.config/openrouter/key" };
  const idle = idleMs ?? Number(env.CE_REVIEW_IDLE_MS || IDLE_LIMIT_DEFAULT);
  const t0 = Date.now();
  const ctl = new AbortController();
  /* Una señal externa (el techo del sondeo) corta el stream igual que el
     vigilante de silencio: la conexión se cierra, no queda colgada. */
  if (signal) {
    if (signal.aborted) ctl.abort(new Error("abortado antes de conectar"));
    else signal.addEventListener("abort", () => ctl.abort(new Error("abortado por quien preguntó")), { once: true });
  }
  let quiet = null;
  const armWatchdog = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => ctl.abort(new Error("silencio de " + Math.round(idle / 1000)
      + " s: el stream estaba abierto y no llegó nada")), idle);
  };
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const body = {
    model: resolved.model,
    reasoning: { effort },
    max_tokens: Math.max(FLOOR_TOKENS, maxTokens),
    stream: true,
    messages,
  };
  if (json) body.response_format = { type: "json_object" };

  armWatchdog();
  let r;
  try {
    r = await fetch(endpoint(env), {
      method: "POST", signal: ctl.signal,
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(quiet);
    return { text: "", why: "no se pudo conectar: " + String(e.message || e).slice(0, 200), seconds: secs(t0) };
  }
  if (!r.ok || !r.body) {
    clearTimeout(quiet);
    const txt = r.body ? await r.text().catch(() => "") : "";
    return { text: "", why: "http " + r.status + " " + txt.slice(0, 160), seconds: secs(t0) };
  }
  const decoder = new TextDecoder("utf-8");
  let buf = "", text = "", usage = null, err = null, provider = null;
  try {
    for await (const part of r.body) {
      armWatchdog();
      buf += decoder.decode(part, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith("data: ")) continue;
        const payload = l.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const d = JSON.parse(payload);
          /* Un error puede llegar a mitad de stream, tras un 200 y tras contenido. */
          if (d.error) err = String(d.error.message || d.error);
          if (!provider && d.provider) provider = String(d.provider);
          text += d.choices?.[0]?.delta?.content || "";
          if (d.usage) usage = d.usage;
        } catch { /* frame parcial; el siguiente chunk lo completa */ }
      }
    }
  } catch (e) {
    clearTimeout(quiet);
    return { text, why: String(e.message || e).slice(0, 200), seconds: secs(t0), provider };
  }
  clearTimeout(quiet);
  if (err) return { text, why: err.slice(0, 200), seconds: secs(t0), provider };
  return {
    text: text.trim(), seconds: secs(t0), provider,
    usage: {
      in: usage?.prompt_tokens ?? null,
      out: usage?.completion_tokens ?? null,
      reasoning: usage?.completion_tokens_details?.reasoning_tokens ?? null,
      cost: usage?.cost ?? null,
    },
  };
}

const secs = (t0) => Math.round((Date.now() - t0) / 1000);
