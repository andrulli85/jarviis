import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* Un HOME de mentira para route.mjs y stations.mjs: skills personales,
   fábrica, plugins y repo en un directorio temporal, para que ningún test
   mire la máquina real.

   `personal` crea directorios reales en skillsDir, no enlaces: si el mismo
   nombre va también en `factory`, findSkill lo verá como "otra copia" (su ruta
   real no cae en factoryDir). Para una skill enlazada a la fábrica usa
   `linked`; para una enlazada a otra copia, `elsewhere`.

   `issueState: null` siempre: sin lector no hay lectura de Linear, y ningún
   test hereda la clave real de esta máquina. El que quiera un estado lo
   inyecta encima. */
export function fakeWorld({ personal = [], plugin = [], project = [], factory = [], linked = [], elsewhere = [], specs = [], git = true, providers } = {}) {
  const root = mkdtempSync(join(tmpdir(), "wayfinder-"));
  const skillsDir = join(root, "skills"); mkdirSync(skillsDir);
  for (const s of personal) { mkdirSync(join(skillsDir, s)); writeFileSync(join(skillsDir, s, "SKILL.md"), "x"); }
  const factoryDir = join(root, "factory"); mkdirSync(factoryDir);
  for (const s of new Set([...factory, ...linked])) { mkdirSync(join(factoryDir, s)); writeFileSync(join(factoryDir, s, "SKILL.md"), "x"); }
  for (const s of linked) symlinkSync(join(factoryDir, s), join(skillsDir, s));
  for (const s of elsewhere) {
    const d = join(root, "elsewhere", s); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "SKILL.md"), "x");
    symlinkSync(d, join(skillsDir, s));
  }
  const pluginsDir = join(root, "plugins");
  for (const s of plugin) {
    const d = join(pluginsDir, "cache", "vendor", "pack", "1.0", "skills", "eng", s);
    mkdirSync(d, { recursive: true }); writeFileSync(join(d, "SKILL.md"), "x");
  }
  const cwd = join(root, "repo"); mkdirSync(cwd);
  if (git) mkdirSync(join(cwd, ".git"));
  for (const s of project) { mkdirSync(join(cwd, ".claude", "skills", s), { recursive: true }); writeFileSync(join(cwd, ".claude", "skills", s, "SKILL.md"), "x"); }
  for (const s of specs) { mkdirSync(join(cwd, "docs", "specs"), { recursive: true }); writeFileSync(join(cwd, "docs", "specs", s), "x"); }
  return { skillsDir, pluginsDir, cwd, factoryDir, linearPrefix: null, issueState: null, providers: providers || { claude: "/b/claude", codex: "/b/codex", openrouter: "clave presente", author: { family: "claude", how: "t" } } };
}
