/* models.mjs: un solo vocabulario de modelos para toda la fábrica.

   Id canónico = `vendor/modelo`, la forma que usa OpenRouter. Cada canal
   traduce a la suya: Codex quiere `gpt-5.6-terra` sin prefijo; el CLI de
   Claude Code quiere `claude-opus-5` o un alias corto. La traducción vive
   aquí y en ningún otro sitio: la primera versión del argumento de reviewer
   en adversarial-review se rompió porque `terra` llegó a Codex como
   `--model terra`, que no conoce. */

export const VENDOR_OF = (id) => id.includes("/") ? id.slice(0, id.indexOf("/")) : null;
export const FAMILY_OF = (id) => id.startsWith("anthropic/") ? "claude"
  : id.startsWith("openai/") ? "gpt"
  : VENDOR_OF(id) || "unknown";

/* Alias cortos que Andres escribe a mano. Devuelven un id canónico. */
export const ALIASES = {
  opus: "anthropic/claude-opus-5",
  sonnet: "anthropic/claude-sonnet-5",
  haiku: "anthropic/claude-haiku-4-5",
  fable: "anthropic/claude-fable-5-1",
  terra: "openai/gpt-5.6-terra",
  sol: "openai/gpt-5.6-sol",
  luna: "openai/gpt-5.6-luna",
};

/* Modelo por defecto de cada canal. Opus para todo lo que piensa; el canal
   OpenRouter también arranca en Opus y es la estación quien baja a un modelo
   barato nombrándolo, no el resolvedor por su cuenta. */
export const DEFAULT_MODEL = {
  claude: "anthropic/claude-opus-5",
  codex: "openai/gpt-5.6-terra",
  openrouter: "anthropic/claude-opus-5",
};

/* Default por familia, para cuando se pide una familia sin modelo. */
export const DEFAULT_BY_FAMILY = { claude: "anthropic/claude-opus-5", gpt: "openai/gpt-5.6-terra" };

/* El default de openrouter admite override por entorno, pero pasa por
   `canonical` igual que un modelo escrito a mano: un valor que el resolvedor
   no reconoce falla aquí con nombre, no en un 400 del proveedor. */
export function defaultModel(channel, env = process.env) {
  if (channel === "openrouter" && env.JARVIIS_OPENROUTER_MODEL) {
    const c = canonical(env.JARVIIS_OPENROUTER_MODEL);
    if (!c) throw new Error(`JARVIIS_OPENROUTER_MODEL="${env.JARVIIS_OPENROUTER_MODEL}" no es un id reconocible (vendor/modelo o alias)`);
    return c;
  }
  return DEFAULT_MODEL[channel];
}

/* Acepta alias, id canónico o id ya traducido de un vendor conocido y
   devuelve siempre el canónico. Null si no sabe qué es. */
export function canonical(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (ALIASES[low]) return ALIASES[low];
  if (s.includes("/")) return s;
  if (/^claude-/.test(low)) return "anthropic/" + s;
  if (/^(gpt|o\d|codex)/.test(low)) return "openai/" + s;
  return null;
}

/* Lo que cada canal quiere ver en su `--model`. Un canal solo traduce a su
   propio vendor; pedirle a Codex que corra un modelo de Anthropic es un error
   de resolución, no una traducción. */
export function forChannel(channel, id) {
  const vendor = VENDOR_OF(id);
  if (channel === "openrouter") return id;
  if (channel === "codex") {
    if (vendor !== "openai") throw new Error(`codex solo corre modelos openai/*, no ${id}`);
    return id.slice("openai/".length);
  }
  if (channel === "claude") {
    if (vendor !== "anthropic") throw new Error(`claude solo corre modelos anthropic/*, no ${id}`);
    return id.slice("anthropic/".length);
  }
  throw new Error(`canal desconocido: ${channel}`);
}
