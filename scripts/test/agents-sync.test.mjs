import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent, readAgentsDir, roster, buildSection, merge, sync, MARKER, HEADER } from "../agents-sync.mjs";

const MANAGED = `# Buzz Nest\n\nTexto que Buzz regenera.\n\n## Workspace\n- Relay: wss://x\n${MARKER}`;
const PK = "b1108e7e5e92d0f7ad647adc1ab0781bfdd1ca7243842616d3b8acd1e27cd620";
const agentFile = (name, extra = "") => `---\nname: ${name}\npubkey: ${PK}\nrol: hace ${name}\ncuando: toca ${name}\n${extra}---\n\nEres ${name}. Instrucciones largas.\n`;
const README = "# Colmena\n\nPreámbulo.\n\n## Reglas\n\nregla 1\n";

function fixture({ nest, agents = { honey: agentFile("Honey"), fizz: agentFile("Fizz") }, readme = README } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agents-sync-"));
  const agentsDir = join(root, "agents"); mkdirSync(agentsDir);
  if (readme !== null) writeFileSync(join(agentsDir, "README.md"), readme);
  for (const [f, text] of Object.entries(agents)) writeFileSync(join(agentsDir, `${f}.md`), text);
  const nestPath = join(root, "nest.md"); if (nest !== undefined) writeFileSync(nestPath, nest);
  return { agentsDir, nestPath };
}

test("parseAgent separa frontmatter y cuerpo, y exige los cuatro campos", () => {
  const a = parseAgent(agentFile("Honey"));
  assert.equal(a.name, "Honey"); assert.equal(a.pubkey, PK); assert.equal(a.rol, "hace Honey");
  assert.equal(a.body, "Eres Honey. Instrucciones largas.");
  assert.throws(() => parseAgent("---\nname: X\n---\n", "x.md"), /x\.md: falta el campo pubkey/);
  assert.throws(() => parseAgent("sin nada", "y.md"), /sin frontmatter/);
});

test("readAgentsDir lee README y agentes en orden alfabético, ignorando el README como agente", () => {
  const f = fixture();
  const d = readAgentsDir(f.agentsDir);
  assert.equal(d.readme, README);
  assert.deepEqual(d.agents.map((a) => a.name), ["Fizz", "Honey"]);
  assert.throws(() => readAgentsDir(fixture({ readme: null }).agentsDir), /README\.md/);
});

test("la tabla sale del frontmatter con el pubkey abreviado; el cuerpo no va al nido", () => {
  const section = buildSection(readAgentsDir(fixture().agentsDir));
  assert.match(section, /^# Colmena\n\nPreámbulo\.\n\n## Quién hace qué\n/);
  assert.match(section, /\| Honey \| `b1108e7e…d620` \| hace Honey \| toca Honey \|/);
  assert.match(section, /\n## Reglas\n\nregla 1$/);
  assert.doesNotMatch(section, /Instrucciones largas/);
  assert.equal(roster([]).split("\n").length, 4, "tabla vacía: título, línea en blanco, cabecera y separador");
});

test("merge conserva lo gestionado hasta el último marcador y pone la sección debajo con cabecera", () => {
  const out = merge(`${MARKER}\nintermedio\n${MANAGED}\n\n## Viejo\n\nregla vieja\n`, "## Nuevo\n\nregla 1\n");
  assert.equal(out, `${MARKER}\nintermedio\n${MANAGED}\n\n${HEADER}\n\n## Nuevo\n\nregla 1\n`);
  assert.throws(() => merge("# sin marcador\n", "x"), /marcador/);
});

test("sync escribe el nido y es idempotente", () => {
  const f = fixture({ nest: `${MANAGED}\n\nviejo\n` });
  assert.equal(sync(f).changed, true);
  const first = readFileSync(f.nestPath, "utf8");
  assert.match(first, /regla 1/); assert.match(first, /\| Fizz \|/); assert.doesNotMatch(first, /viejo/);
  assert.equal(sync(f).changed, false);
  assert.equal(readFileSync(f.nestPath, "utf8"), first);
});

test("--check no escribe y reporta si difiere", () => {
  const f = fixture({ nest: `${MANAGED}\n\nviejo\n` });
  assert.equal(sync({ ...f, check: true }).changed, true);
  assert.match(readFileSync(f.nestPath, "utf8"), /viejo/);
});

test("si el nido no existe falla en vez de crearlo", () => {
  assert.throws(() => sync(fixture({ nest: undefined })), /Buzz Desktop/);
});
