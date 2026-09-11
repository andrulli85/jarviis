import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merge, sync, MARKER, HEADER } from "../agents-sync.mjs";

const MANAGED = `# Buzz Nest\n\nTexto que Buzz regenera.\n\n## Workspace\n- Relay: wss://x\n${MARKER}`;

function fixture({ nest, source = "## Equipo\n\nregla 1\n" }) {
  const root = mkdtempSync(join(tmpdir(), "agents-sync-"));
  const sourcePath = join(root, "AGENTS.md"); writeFileSync(sourcePath, source);
  const nestPath = join(root, "nest.md"); if (nest !== undefined) writeFileSync(nestPath, nest);
  return { sourcePath, nestPath };
}

test("conserva lo gestionado hasta el marcador y pone la fuente debajo con cabecera", () => {
  const out = merge(`${MANAGED}\n\n## Equipo viejo\n\nregla vieja\n`, "## Equipo\n\nregla 1\n");
  assert.ok(out.startsWith(MANAGED));
  assert.equal(out, `${MANAGED}\n\n${HEADER}\n\n## Equipo\n\nregla 1\n`);
  assert.doesNotMatch(out, /regla vieja/);
});

test("usa el último marcador si hay más de uno", () => {
  const nest = `${MARKER}\nbloque intermedio\n${MANAGED}\n\nviejo\n`;
  const out = merge(nest, "nuevo\n");
  assert.ok(out.startsWith(`${MARKER}\nbloque intermedio\n${MANAGED}`));
  assert.doesNotMatch(out, /viejo/);
});

test("sin marcador no toca nada y explica por qué", () => {
  assert.throws(() => merge("# sin marcador\n", "x"), /marcador/);
});

test("sync escribe el nido y es idempotente", () => {
  const f = fixture({ nest: `${MANAGED}\n\nviejo\n` });
  assert.equal(sync(f).changed, true);
  const first = readFileSync(f.nestPath, "utf8");
  assert.match(first, /regla 1/);
  assert.equal(sync(f).changed, false);
  assert.equal(readFileSync(f.nestPath, "utf8"), first);
});

test("--check no escribe y reporta si difiere", () => {
  const f = fixture({ nest: `${MANAGED}\n\nviejo\n` });
  assert.equal(sync({ ...f, check: true }).changed, true);
  assert.match(readFileSync(f.nestPath, "utf8"), /viejo/);
});

test("si el nido no existe falla en vez de crearlo", () => {
  const f = fixture({ nest: undefined });
  assert.throws(() => sync(f), /Buzz Desktop/);
});
