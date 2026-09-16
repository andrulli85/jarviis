import { test } from "node:test";
import assert from "node:assert/strict";
import { order, resolveTeam, publish, apiKey, withKeys, issueState, issueInfo, comment, assign, move, link, create, DONE_GATE_EXIT } from "../scripts/linear.mjs";
import { linearStub } from "./stub.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "linear.mjs");

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

/* ---------------------------------------------------------- issueState --- */

/* Lo que el wayfinder necesita de un issue: la categoría de su estado y la
   PR adjunta. El stub sirve `world.issues` tal cual por identificador. */
const DONE_MERGED = { identifier: "JAR-8", state: { name: "Done", type: "completed" },
  attachments: [{ sourceType: "github", metadata: { status: "merged" } }] };

test("issueState: categoría del estado, nombre tal cual y la PR del último attachment github", async () => {
  await withStub({ issues: [DONE_MERGED] }, async ({ env, stub }) => {
    assert.deepEqual(await issueState("JAR-8", env), { type: "completed", name: "Done", pr: "merged" });
    assert.deepEqual(stub.state.mutations, [], "leer no escribe");
  });
  await withStub({ issues: [{ identifier: "JAR-9", state: { name: "In Review", type: "started" },
    attachments: [{ sourceType: "github", metadata: { status: "merged" } }, { sourceType: "slack", metadata: {} }, { sourceType: "github", metadata: { status: "open" } }] }] },
    async ({ env }) => { assert.deepEqual(await issueState("JAR-9", env), { type: "started", name: "In Review", pr: "open" }); });
  await withStub({ issues: [{ identifier: "JAR-10", state: { name: "Todo", type: "unstarted" }, attachments: [] }] },
    async ({ env }) => { assert.deepEqual(await issueState("JAR-10", env), { type: "unstarted", name: "Todo", pr: null }); });
});

test("issueState: un issue que no existe lanza con su clave; sin clave de API lanza antes de la red", async () => {
  await withStub({ issues: [DONE_MERGED] }, async ({ env }) => {
    await assert.rejects(issueState("JAR-999", env), /JAR-999.*no existe/);
  });
  await assert.rejects(issueState("JAR-8", { HOME: "/nonexistent", JARVIIS_LINEAR_URL: "http://127.0.0.1:1/" }), /sin clave/);
});

test("issueState: sin red o con timeout lanza en 3 s como mucho, con la causa", async () => {
  await assert.rejects(issueState("JAR-8", { LINEAR_API_KEY: "lin_test", JARVIIS_LINEAR_URL: "http://127.0.0.1:1/" }), /sin red/);
  await withStub({ issues: [DONE_MERGED], delayMs: 200 }, async ({ env }) => {
    await assert.rejects(issueState("JAR-8", { ...env, JARVIIS_LINEAR_TIMEOUT_MS: "50" }), /sin red.*timeout/i);
  });
});

/* Hallazgo del review adversarial de la PR #13 (Codex, 2026-09-12): el
   override global JARVIIS_LINEAR_TIMEOUT_MS (pensado para publish) subía
   también el techo de issueState, y /wayfinder podía esperar un minuto a
   Linear en vez de los 3 s de la spec. La variable puede acortar, no alargar. */
test("issueState: JARVIIS_LINEAR_TIMEOUT_MS no alarga los 3 s de techo", async () => {
  await withStub({ issues: [DONE_MERGED], delayMs: 3600 }, async ({ env }) => {
    const t0 = Date.now();
    await assert.rejects(issueState("JAR-8", { ...env, JARVIIS_LINEAR_TIMEOUT_MS: "60000" }), /sin red.*timeout/i);
    assert.ok(Date.now() - t0 < 3500, "cortó a los 3 s, no a los 60");
  });
});

/* D12: build-kickoff importa `issue` de aquí en vez de hacer GraphQL propio;
   necesita el título y la línea `Spec:` de la descripción. issueState (el
   wayfinder) sigue devolviendo solo { type, name, pr }. */
test("issueInfo: estado, PR, título y la spec de la línea `Spec:`; sin línea, spec null", async () => {
  const conSpec = { identifier: "JAR-12", title: "Login mágico", description: "## Objetivo\n…\n\nSpec: `docs/specs/login-magico.md`",
    state: { name: "Todo", type: "unstarted" }, attachments: [] };
  const sinSpec = { identifier: "JAR-13", title: "T", description: "sin línea de spec", state: { name: "Todo", type: "unstarted" }, attachments: [] };
  await withStub({ issues: [conSpec, sinSpec] }, async ({ env }) => {
    assert.deepEqual(await issueInfo("JAR-12", env), { type: "unstarted", name: "Todo", pr: null, title: "Login mágico", spec: "docs/specs/login-magico.md" });
    assert.deepEqual(await issueInfo("JAR-13", env), { type: "unstarted", name: "Todo", pr: null, title: "T", spec: null });
  });
});

/* ------------------------------------------------- comandos del tablero --- */

/* D7: todo lo que un skill hace en Linear pasa por aquí. Cada comando
   resuelve ids en la corrida, y con dryRun renderiza el payload sin escribir. */
const TODO = (identifier, extra = {}) => ({ identifier, title: "T " + identifier, state: { name: "Todo", type: "unstarted" }, ...extra });

test("comment: crea el comentario en el issue resuelto por clave y devuelve { key, commentId, url }", async () => {
  await withStub({ issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    const r = await comment("JAR-15", "Arranco: alcance A, plan B.", { env });
    assert.equal(r.key, "JAR-15");
    assert.ok(r.commentId, "id del comentario");
    assert.match(r.url, /^https:/);
    const writes = stub.state.mutations.filter((m) => m.op === "commentCreate");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].input.issueId, stub.state.existing[0].id, "va por id, no por clave");
    assert.equal(writes[0].input.body, "Arranco: alcance A, plan B.");
  });
});

test("comment --dry-run: resuelve el issue, renderiza el payload y no escribe; issue ausente o texto vacío lanzan", async () => {
  await withStub({ issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    const r = await comment("JAR-15", "prueba", { env, dryRun: true });
    assert.equal(r.dryRun, true);
    assert.equal(r.key, "JAR-15");
    assert.deepEqual(r.payload, { issueId: stub.state.existing[0].id, body: "prueba" });
    assert.deepEqual(stub.state.mutations, []);
    await assert.rejects(comment("JAR-999", "x", { env }), /JAR-999.*no existe/);
    await assert.rejects(comment("JAR-15", "   ", { env }), /texto/);
    assert.deepEqual(stub.state.mutations, []);
  });
});

test("assign <clave> me: assigneeId = viewer por issueUpdate; --dry-run lo renderiza sin escribir", async () => {
  await withStub({ issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    const dry = await assign("JAR-15", "me", { env, dryRun: true });
    assert.deepEqual(dry, { dryRun: true, key: "JAR-15", payload: { id: "iss-JAR-15", input: { assigneeId: "u-1" } } });
    assert.deepEqual(stub.state.mutations, []);
    const r = await assign("JAR-15", "me", { env });
    assert.deepEqual(r, { key: "JAR-15", assignee: { id: "u-1", name: "Andres" } });
    assert.deepEqual(stub.state.mutations, [{ op: "issueUpdate", id: "iss-JAR-15", input: { assigneeId: "u-1" } }]);
    await assert.rejects(assign("JAR-15", "otro", { env }), /solo.*me/);
  });
});

const STATES = [
  { id: "st-backlog", name: "Backlog", type: "backlog", position: 0 },
  { id: "st-todo", name: "Todo", type: "unstarted", position: 1 },
  { id: "st-progress", name: "In Progress", type: "started", position: 2 },
  { id: "st-review", name: "In Review", type: "started", position: 3 },
  { id: "st-done", name: "Done", type: "completed", position: 5 },
  { id: "st-canceled", name: "Canceled", type: "canceled", position: 6 },
];

test("move <clave> <estado>: resuelve el estado por nombre en el equipo del issue, sin distinguir mayúsculas; --dry-run sin escribir", async () => {
  await withStub({ states: STATES, issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    const dry = await move("JAR-15", "in progress", { env, dryRun: true });
    assert.deepEqual(dry, { dryRun: true, key: "JAR-15", from: { id: "st-todo", name: "Todo", type: "unstarted" }, payload: { id: "iss-JAR-15", input: { stateId: "st-progress" } } });
    assert.deepEqual(stub.state.mutations, []);
    const r = await move("JAR-15", "In Review", { env });
    assert.deepEqual(r, { key: "JAR-15", from: { id: "st-todo", name: "Todo", type: "unstarted" }, state: { id: "st-review", name: "In Review", type: "started" } });
    assert.deepEqual(stub.state.mutations, [{ op: "issueUpdate", id: "iss-JAR-15", input: { stateId: "st-review" } }]);
    await assert.rejects(move("JAR-15", "Nirvana", { env }), /Nirvana.*Backlog.*In Progress/s);
  });
});

/* D8: el cierre lo hace la PR de Build. Un move a una categoría de cierre
   no es un error de datos sino del gate: sale con su propio código. */
test("move a Done o Canceled se rechaza con exit 3 antes de escribir, aunque --dry-run", async () => {
  await withStub({ states: STATES, issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    for (const name of ["Done", "Canceled"]) {
      await assert.rejects(move("JAR-15", name, { env }), (e) => e.exit === DONE_GATE_EXIT && /categoría (completed|canceled).*PR/.test(e.message));
      await assert.rejects(move("JAR-15", name, { env, dryRun: true }), (e) => e.exit === DONE_GATE_EXIT);
    }
    assert.deepEqual(stub.state.mutations, []);
  });
});

test("link <A> blocks <B>: issueRelationCreate por ids; repetido no vuelve a crear; --dry-run sin escribir", async () => {
  await withStub({ issues: [TODO("JAR-14"), TODO("JAR-16")] }, async ({ env, stub }) => {
    const dry = await link("JAR-14", "blocks", "JAR-16", { env, dryRun: true });
    assert.deepEqual(dry, { dryRun: true, blocker: "JAR-14", blocked: "JAR-16", existed: false, payload: { issueId: "iss-JAR-14", relatedIssueId: "iss-JAR-16", type: "blocks" } });
    assert.deepEqual(stub.state.mutations, []);
    const first = await link("JAR-14", "blocks", "JAR-16", { env });
    assert.deepEqual(first, { blocker: "JAR-14", blocked: "JAR-16", created: true });
    const again = await link("JAR-14", "blocks", "JAR-16", { env });
    assert.deepEqual(again, { blocker: "JAR-14", blocked: "JAR-16", created: false });
    assert.equal(stub.state.mutations.filter((m) => m.op === "issueRelationCreate").length, 1, "idempotente");
    await assert.rejects(link("JAR-14", "relates", "JAR-16", { env }), /blocks/);
    await assert.rejects(link("JAR-14", "blocks", "JAR-14", { env }), /a sí mismo/);
  });
});

/* D7: cada create sale asignado al viewer (hoy se hacía a mano en cada
   sesión). D11: un blockedBy con forma de clave (JAR-14) es un issue que ya
   existe, resuelto por identificador antes de la primera escritura. */
test("publish: cada issue y subtarea se crea con assigneeId = viewer", async () => {
  await withStub({}, async ({ env, stub }) => {
    const dry = await publish(plan(), { env, dryRun: true });
    assert.ok(dry.payloads.every((p) => p.input.assigneeId === "u-1"), "issues");
    assert.ok(dry.payloads.flatMap((p) => p.subtasks).every((s) => s.input.assigneeId === "u-1"), "subtareas");
    await publish(plan(), { env });
    assert.ok(stub.state.mutations.filter((m) => m.op === "issueCreate").every((m) => m.input.assigneeId === "u-1"));
  });
});

test("publish: blockedBy con clave externa se resuelve por identificador y crea la relación; ausente falla antes de escribir", async () => {
  const p = { team: "JAR", issues: [{ ref: "x", title: "Derivado", description: "…", blockedBy: ["JAR-14"] }] };
  await withStub({ issues: [TODO("JAR-14")] }, async ({ env, stub }) => {
    const dry = await publish(p, { env, dryRun: true });
    assert.deepEqual(dry.relations, [{ blocker: "JAR-14", blocked: "x" }]);
    assert.deepEqual(dry.external, [{ key: "JAR-14", id: "iss-JAR-14" }]);
    assert.deepEqual(stub.state.mutations, []);
    const r = await publish(p, { env });
    assert.equal(r.ok, true);
    assert.deepEqual(r.relationsCreated, [{ blocker: "JAR-14", blocked: "x" }]);
    const rel = stub.state.mutations.find((m) => m.op === "issueRelationCreate").input;
    assert.deepEqual(rel, { issueId: "iss-JAR-14", relatedIssueId: r.created[0].id, type: "blocks" });
  });
  await withStub({}, async ({ env, stub }) => {
    await assert.rejects(publish(p, { env }), /JAR-14.*no existe/);
    assert.deepEqual(stub.state.mutations, []);
  });
  assert.throws(() => order([{ ref: "a", blockedBy: ["zz"] }]), /zz/, "una ref que no parece clave sigue siendo un error del plan");
});

/* D11: create es un plan de un issue por el mismo camino que publish
   (backlog, relectura, categoría, relaciones, informe). */
test("create: plan de un issue por publish; --dry-run muestra assigneeId del viewer y la relación con el bloqueador sin escribir", async () => {
  await withStub({ issues: [TODO("JAR-14")] }, async ({ env, stub }) => {
    const dry = await create({ team: "JAR", title: "x", description: "y", labels: ["fabrica"], priority: 3, blockedBy: ["JAR-14"] }, { env, dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.payloads.length, 1);
    assert.equal(dry.payloads[0].input.assigneeId, "u-1");
    assert.equal(dry.payloads[0].input.title, "x");
    assert.equal(dry.payloads[0].input.description, "y");
    assert.equal(dry.payloads[0].input.priority, 3);
    assert.deepEqual(dry.payloads[0].input.labelIds, ["lb-fabrica"]);
    assert.deepEqual(dry.relations, [{ blocker: "JAR-14", blocked: "issue" }]);
    assert.deepEqual(stub.state.mutations, []);
    const r = await create({ team: "JAR", title: "x", description: "y", blockedBy: ["JAR-14"] }, { env });
    assert.equal(r.ok, true);
    assert.equal(r.key, "JAR-1");
    assert.match(r.url, /JAR-1$/);
    assert.equal(stub.state.mutations.filter((m) => m.op === "issueCreate").length, 1);
    assert.equal(stub.state.mutations.filter((m) => m.op === "issueRelationCreate").length, 1);
  });
});

test("create: sin título o sin equipo falla antes de tocar la red; la spec va al pie como en publish", async () => {
  await withStub({}, async ({ env, stub }) => {
    await assert.rejects(create({ team: "JAR", description: "y" }, { env }), /título/);
    await assert.rejects(create({ title: "x", description: "y" }, { env }), /equipo/);
    assert.deepEqual(stub.state.mutations, []);
    const dry = await create({ team: "JAR", title: "x", description: "y", spec: "docs/specs/a.md" }, { env, dryRun: true });
    assert.match(dry.payloads[0].input.description, /^y\n\nSpec: `docs\/specs\/a\.md`$/);
  });
});

/* ------------------------------------------------------------ el CLI --- */

/* Los criterios de aceptación de JAR-16 están escritos como líneas de
   comando: se prueban como líneas de comando. stdout es JSON, la causa va a
   stderr, y ningún --dry-run escribe.

   Asíncrono a propósito: el stub corre en este mismo proceso, así que un
   execFileSync bloquearía el event loop que tiene que responderle al hijo
   (medido: 30 s de espera hasta el timeout). `stdin` cierra la entrada del
   hijo salvo cuando el caso la usa: sin cerrarla, hereda la del runner. */
const execFileP = promisify(execFile);
async function run(args, env, { input = "", ...opts } = {}) {
  const child = execFileP("node", [script, ...args],
    { encoding: "utf8", env: { ...process.env, HOME: "/nonexistent", LINEAR_KEY_FILE: "/nonexistent", ...env }, ...opts });
  child.child.stdin.end(input);
  return child;
}
const json = async (...args) => JSON.parse((await run(...args)).stdout);
/* El error de execFile trae status/stdout/stderr, como el de execFileSync. */
const fails = async (args, env, check) => {
  await assert.rejects(run(args, env), (e) => check({ status: e.code, stdout: e.stdout, stderr: e.stderr }));
};

test("CLI comment --dry-run: renderiza el payload en JSON sin escribir; sin --dry-run comenta", async () => {
  await withStub({ issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    const out = await json(["comment", "JAR-15", "prueba", "--dry-run"], env);
    assert.equal(out.dryRun, true);
    assert.deepEqual(out.payload, { issueId: "iss-JAR-15", body: "prueba" });
    assert.deepEqual(stub.state.mutations, []);
    const done = await json(["comment", "JAR-15", "prueba"], env);
    assert.equal(done.key, "JAR-15");
    assert.ok(done.commentId);
  });
});

test("CLI comment -: el texto llega por stdin", async () => {
  await withStub({ issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    await run(["comment", "JAR-15", "-"], env, { input: "Bloqueado: espera a JAR-14.\n" });
    assert.equal(stub.state.mutations[0].input.body, "Bloqueado: espera a JAR-14.");
  });
});

test("CLI move a Done sale 3 con la causa en stderr y sin escribir", async () => {
  await withStub({ states: STATES, issues: [TODO("JAR-15")] }, async ({ env, stub }) => {
    await fails(["move", "JAR-15", "Done"], env, (e) => e.status === 3 && /categoría completed.*PR/.test(e.stderr));
    assert.deepEqual(stub.state.mutations, []);
    const ok = await json(["move", "JAR-15", "In Progress"], env);
    assert.equal(ok.state.name, "In Progress");
  });
});

test("CLI create --dry-run: assigneeId del viewer y la relación con el bloqueador, sin escribir", async () => {
  await withStub({ issues: [TODO("JAR-14")] }, async ({ env, stub }) => {
    const out = await json(["create", "--team", "JAR", "--title", "x", "--description", "y", "--blocked-by", "JAR-14", "--dry-run"], env);
    assert.equal(out.payloads[0].input.assigneeId, "u-1");
    assert.deepEqual(out.relations, [{ blocker: "JAR-14", blocked: "issue" }]);
    assert.deepEqual(stub.state.mutations, []);
    const real = await json(["create", "--team", "JAR", "--title", "x", "--description", "-", "--label", "fabrica", "--priority", "2"], env, { input: "desde stdin" });
    assert.equal(real.key, "JAR-1");
    const created = stub.state.mutations.find((m) => m.op === "issueCreate").input;
    assert.equal(created.description, "desde stdin");
    assert.deepEqual(created.labelIds, ["lb-fabrica"]);
    assert.equal(created.priority, 2);
  });
});

test("CLI assign y link: JSON en stdout, idempotencia visible; un comando desconocido sale 2 con el uso", async () => {
  await withStub({ issues: [TODO("JAR-14"), TODO("JAR-16")] }, async ({ env }) => {
    assert.deepEqual((await json(["assign", "JAR-16", "me"], env)).assignee, { id: "u-1", name: "Andres" });
    assert.equal((await json(["assign", "JAR-16"], env)).key, "JAR-16", "sin argumento, me");
    assert.equal((await json(["link", "JAR-14", "blocks", "JAR-16"], env)).created, true);
    assert.equal((await json(["link", "JAR-14", "blocks", "JAR-16"], env)).created, false);
    await fails(["inventado"], env, (e) => e.status === 2 && /uso: .*comment.*create.*assign.*move.*link/s.test(e.stderr));
  });
});

test("CLI: un error de datos sale 1 con la causa en stderr y nada en stdout", async () => {
  await withStub({ issues: [TODO("JAR-15")] }, async ({ env }) => {
    await fails(["comment", "JAR-999", "x"], env, (e) => e.status === 1 && /JAR-999.*no existe/.test(e.stderr) && e.stdout === "");
  });
});
