import { test } from "node:test";
import assert from "node:assert/strict";
import { order, resolveTeam, publish, apiKey, withKeys } from "../scripts/linear.mjs";
import { linearStub } from "./stub.mjs";

const plan = (over = {}) => ({
  team: "JAR",
  spec: "docs/specs/login.md",
  issues: [
    { ref: "b", title: "Enviar el enlace mágico por email", description: "…", labels: ["fabrica"], blockedBy: ["a"] },
    { ref: "a", title: "Crear el token de un solo uso", description: "…", labels: ["fabrica"], blockedBy: [],
      subtasks: [{ title: "Migración de la tabla de tokens", description: "…" }] },
    { ref: "c", title: "Canjear el enlace y abrir sesión", description: "…", labels: [], blockedBy: ["a", "b"] },
  ],
  ...over,
});

async function withStub(world, fn) {
  const stub = await linearStub(world);
  try { await fn({ env: { LINEAR_API_KEY: "lin_test", JARVIIS_LINEAR_URL: stub.url }, stub }); }
  finally { await stub.close(); }
}

/* --------------------------------------------------------------- order --- */

test("order: bloqueadores primero, estable, y detecta ciclos y refs desconocidas", () => {
  assert.deepEqual(order(plan().issues).map((i) => i.ref), ["a", "b", "c"]);
  assert.throws(() => order([{ ref: "a", blockedBy: ["b"] }, { ref: "b", blockedBy: ["a"] }]), /ciclo/);
  assert.throws(() => order([{ ref: "a", blockedBy: ["zz"] }]), /zz/);
  assert.throws(() => order([{ ref: "a" }, { ref: "a" }]), /duplicad/);
});

/* --------------------------------------------------------- resolveTeam --- */

test("resolveTeam: por clave o por nombre, con estados y etiquetas; falla si no hay match", async () => {
  await withStub({}, async ({ env }) => {
    const t = await resolveTeam("jarviis", env);
    assert.equal(t.team.key, "JAR");
    assert.equal(t.backlogState.type, "backlog");
    assert.ok(t.labels.some((l) => l.name === "fabrica"), "etiqueta del equipo");
    assert.ok(t.labels.some((l) => l.name === "Bug"), "etiqueta de workspace");
    assert.ok(!t.labels.some((l) => l.name === "ops-only"), "etiqueta de otro equipo no");
    assert.equal((await resolveTeam("JAR", env)).team.id, "team-1");
    await assert.rejects(resolveTeam("marketing", env), /marketing.*JAR.*OPS/s);
  });
});

test("resolveTeam: sin estado backlog usa unstarted; nunca uno completed", async () => {
  await withStub({ states: [{ id: "s1", name: "Todo", type: "unstarted", position: 0 }, { id: "s2", name: "Done", type: "completed", position: 1 }] },
    async ({ env }) => { assert.equal((await resolveTeam("JAR", env)).backlogState.id, "s1"); });
  await withStub({ states: [{ id: "s2", name: "Done", type: "completed", position: 1 }] },
    async ({ env }) => { await assert.rejects(resolveTeam("JAR", env), /ningún estado/); });
});

test("sin clave falla con nombre antes de tocar la red", async () => {
  assert.equal(apiKey({ HOME: "/nonexistent" }), null);
  await assert.rejects(resolveTeam("JAR", { HOME: "/nonexistent", JARVIIS_LINEAR_URL: "http://127.0.0.1:1/" }), /LINEAR_API_KEY/);
});

test("clave rechazada es un error legible", async () => {
  await withStub({}, async ({ env }) => {
    await assert.rejects(resolveTeam("JAR", { ...env, LINEAR_API_KEY: "bad" }), /401/);
  });
});

/* ------------------------------------------------------------- publish --- */

test("dry-run: resuelve ids de verdad, renderiza payloads, no muta nada", async () => {
  await withStub({}, async ({ env, stub }) => {
    const r = await publish(plan(), { env, dryRun: true });
    assert.equal(r.dryRun, true);
    assert.equal(r.payloads.length, 3);
    assert.equal(r.payloads[0].ref, "a");
    assert.equal(r.payloads[0].input.teamId, "team-1");
    assert.equal(r.payloads[0].input.stateId, "st-backlog");
    assert.deepEqual(r.payloads[0].input.labelIds, ["lb-fabrica"]);
    assert.equal(r.payloads[0].subtasks.length, 1);
    assert.deepEqual(r.relations, [{ blocker: "a", blocked: "b" }, { blocker: "a", blocked: "c" }, { blocker: "b", blocked: "c" }]);
    assert.deepEqual(stub.state.mutations, []);
  });
});

test("publish: crea en orden, subtareas con parent, relaciones blocks, re-lee y verifica", async () => {
  await withStub({}, async ({ env, stub }) => {
    const r = await publish(plan(), { env });
    assert.equal(r.ok, true);
    assert.deepEqual(r.created.map((c) => c.ref), ["a", "b", "c"]);
    assert.deepEqual(r.created.map((c) => c.key), ["JAR-1", "JAR-3", "JAR-4"]);
    const sub = r.created.find((c) => c.ref === "a").subtasks[0];
    assert.equal(sub.key, "JAR-2");
    const creates = stub.state.mutations.filter((m) => m.op === "issueCreate");
    assert.equal(creates[1].input.parentId, "iss-1", "la subtarea cuelga de su padre");
    const rels = stub.state.mutations.filter((m) => m.op === "issueRelationCreate").map((m) => m.input);
    assert.deepEqual(rels, [
      { issueId: "iss-1", relatedIssueId: "iss-3", type: "blocks" },
      { issueId: "iss-1", relatedIssueId: "iss-4", type: "blocks" },
      { issueId: "iss-3", relatedIssueId: "iss-4", type: "blocks" },
    ]);
    assert.equal(r.verification.count, 3);
    assert.equal(r.verification.doneCategory.length, 0);
    assert.ok(r.created.every((c) => c.landed.state.type === "backlog"));
    assert.match(creates[0].input.description, /docs\/specs\/login\.md/, "la descripción enlaza la spec");
  });
});

test("publish: un issue que aterriza en categoría Done se reporta como violación", async () => {
  await withStub({ landIn: "st-done" }, async ({ env }) => {
    const r = await publish(plan(), { env });
    assert.equal(r.ok, false);
    assert.equal(r.verification.doneCategory.length, 4, "3 issues + 1 subtarea");
    assert.match(r.why, /Done/);
  });
});

test("publish: duplicate también es categoría de cierre", async () => {
  const states = [{ id: "s1", name: "Backlog", type: "backlog", position: 0 }, { id: "sd", name: "Duplicate", type: "duplicate", position: 9 }];
  await withStub({ states, landIn: "sd" }, async ({ env }) => {
    const r = await publish(plan(), { env });
    assert.equal(r.ok, false);
    assert.equal(r.verification.doneCategory.length, 4);
  });
});

test("publish: etiqueta inexistente falla antes de crear nada", async () => {
  await withStub({}, async ({ env, stub }) => {
    const p = plan(); p.issues[0].labels = ["no-existe"];
    await assert.rejects(publish(p, { env }), /no-existe.*fabrica/s);
    assert.deepEqual(stub.state.mutations, []);
  });
});

test("publish: un fallo a mitad para y reporta lo creado hasta ahí", async () => {
  await withStub({ failOn: "IssueRelationCreate" }, async ({ env }) => {
    const r = await publish(plan(), { env });
    assert.equal(r.ok, false);
    assert.equal(r.created.length, 3);
    assert.match(r.why, /boom/);
  });
});

test("publish: la prioridad es un entero 0-4 y se valida", async () => {
  await withStub({}, async ({ env }) => {
    const p = plan(); p.issues[0].priority = 9;
    await assert.rejects(publish(p, { env, dryRun: true }), /priority/);
  });
});

test("withKeys: el borrador recibe key y url por issue y subtarea, sin perder nada", async () => {
  await withStub({}, async ({ env }) => {
    const p = plan();
    const r = await publish(p, { env });
    const back = withKeys(p, r);
    assert.equal(back.issues.find((i) => i.ref === "a").key, "JAR-1");
    assert.equal(back.issues.find((i) => i.ref === "a").subtasks[0].key, "JAR-2");
    assert.equal(back.issues.find((i) => i.ref === "c").key, "JAR-4");
    assert.deepEqual(back.issues.map((i) => i.ref), p.issues.map((i) => i.ref), "orden del borrador intacto");
    assert.equal(back.spec, p.spec);
  });
});

test("resolveTeam: match parcial único vale; ambiguo pregunta", async () => {
  const teams = [{ id: "t1", key: "WEB", name: "Web Platform" }, { id: "t2", key: "MOB", name: "Mobile Platform" }, { id: "t3", key: "DAT", name: "Data" }];
  await withStub({ teams, team: teams[0] }, async ({ env }) => {
    await assert.rejects(resolveTeam("platform", env), /varios equipos.*WEB.*MOB/s);
    assert.equal((await resolveTeam("dat", env)).team.key, "DAT");
  });
});

test("publish: un plan con claves se rechaza sin resume, antes de escribir", async () => {
  await withStub({}, async ({ env, stub }) => {
    const p = plan(); p.issues[1].key = "JAR-1";
    await assert.rejects(publish(p, { env }), /ya tiene claves.*JAR-1/s);
    assert.deepEqual(stub.state.mutations, []);
  });
});

test("publish resume: crea solo los que no tienen clave y las relaciones con un extremo nuevo", async () => {
  await withStub({}, async ({ env, stub }) => {
    const first = await publish({ ...plan(), issues: [plan().issues[1]] }, { env });   // solo "a" → JAR-1 (+ subtarea JAR-2)
    assert.equal(first.created[0].key, "JAR-1");
    const p = withKeys({ ...plan(), issues: [plan().issues[1]] }, first);
    const full = { ...plan(), issues: [p.issues[0], plan().issues[0], plan().issues[2]] };  // a (con key), b, c
    const r = await publish(full, { env, resume: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.skipped, [{ ref: "a", key: "JAR-1" }]);
    assert.deepEqual(r.created.map((c) => c.ref), ["b", "c"]);
    const creates = stub.state.mutations.filter((m) => m.op === "issueCreate");
    assert.equal(creates.length, 4, "a + subtarea en la primera, b + c en la segunda; nada duplicado");
    const rels = stub.state.mutations.filter((m) => m.op === "issueRelationCreate").map((m) => m.input);
    assert.deepEqual(rels.map((x) => [x.issueId, x.relatedIssueId]), [["iss-1", "iss-3"], ["iss-1", "iss-4"], ["iss-3", "iss-4"]]);
  });
});
