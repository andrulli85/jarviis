/* family.mjs: quién escribió un cambio, y por tanto quién puede leerlo.

   Copiado de ~/.claude/skills/adversarial-review/scripts/lib/family.mjs el
   2026-09-11 con la regla intacta. Vive aquí porque una skill no debe importar
   desde el home de otra; cuando la skill migre a la fábrica, esta será la
   única copia. */

export const CROSS_FAMILY = { claude: "gpt", gpt: "claude" };

/* Nada aquí es una suposición: un autor no detectado se reporta como no
   detectado. El default tentador — "lo escribió Claude" — acierta durante
   años y falla en silencio el primer día que Codex corre el comando, que es
   justo el día en que importa. Cada regla nombra la variable que leyó.

   El orden importa. AI_AGENT es de Conductor y lo fija para ambos binarios,
   así que dentro de Conductor decide antes que cualquier marca que un perfil
   de shell pueda haber exportado. */
export function detectAuthor(env = process.env) {
  const explicit = (env.CE_REVIEW_AUTHOR || "").trim();
  if (explicit) {
    const fam = /^(claude|anthropic|opus|sonnet|haiku|fable)$/i.test(explicit) ? "claude"
      : /^(gpt|openai|codex|terra|sol|luna)$/i.test(explicit) ? "gpt"
      : explicit.startsWith("anthropic/") ? "claude"
      : explicit.startsWith("openai/") ? "gpt"
      : explicit.toLowerCase();
    return { family: fam, how: "CE_REVIEW_AUTHOR=" + explicit };
  }
  for (const name of ["AI_AGENT", "CLAUDE_CODE_ENTRYPOINT", "CLAUDECODE", "CODEX_SANDBOX"]) {
    const value = env[name];
    if (!value) continue;
    if (/codex|openai/i.test(value) || name.startsWith("CODEX")) {
      return { family: "gpt", how: name + "=" + value };
    }
    if (/claude|anthropic/i.test(value) || name.startsWith("CLAUDE")) {
      return { family: "claude", how: name + "=" + value };
    }
  }
  return { family: null, how: null };
}

/* El entorno dice quién CORRE; los commits dicen quién ESCRIBIÓ. Solo se
   miran los valores de los trailers Co-Authored-By (git los extrae con
   `%(trailers:key=Co-authored-by,valueonly=true)`), nunca la prosa del
   commit: un commit de Claude que habla de Codex no lo escribió Codex.
   "mixed" cuando hay de ambas familias; null cuando no hay ninguno. */
export function familyFromTrailers(text) {
  let claude = false, gpt = false;
  for (const line of String(text || "").split("\n")) {
    const v = line.trim();
    if (!v) continue;
    if (/claude|anthropic/i.test(v)) claude = true;
    if (/codex|gpt|openai/i.test(v)) gpt = true;
  }
  if (claude && gpt) return "mixed";
  return claude ? "claude" : gpt ? "gpt" : null;
}
