/* Un Linear de mentira: responde al GraphQL que usa linear.mjs y anota cada
   mutación. Lo justo para que un test pueda afirmar "no se escribió nada" o
   "se creó en este orden", sin parsear GraphQL de verdad: se despacha por el
   nombre de la operación que el cliente pone en la query. */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

export async function linearStub(world = {}) {
  const state = {
    team: { id: "team-1", key: "JAR", name: "Jarviis", ...(world.team || {}) },
    states: world.states || [
      { id: "st-backlog", name: "Backlog", type: "backlog", position: 0 },
      { id: "st-todo", name: "Todo", type: "unstarted", position: 1 },
      { id: "st-done", name: "Done", type: "completed", position: 5 },
    ],
    labels: world.labels || [{ id: "lb-fabrica", name: "fabrica", team: { id: "team-1" } }, { id: "lb-bug", name: "Bug", team: null }, { id: "lb-ops", name: "ops-only", team: { id: "team-2" } }],
    teams: world.teams || null,
    issues: new Map(),
    mutations: [],
    seq: 0,
    /* Permite simular un create que aterriza en Done aunque se pidió Backlog. */
    landIn: world.landIn || null,
    failOn: world.failOn || null,
    /* Con log, cada mutación se anota también en disco: así una corrida
       headless (evals) se puede calificar desde fuera del proceso. */
    log: world.log || null,
  };
  const note = (m) => { state.mutations.push(m); if (state.log) appendFileSync(state.log, JSON.stringify(m) + "\n"); };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const auth = req.headers.authorization;
    if (!auth || auth === "bad") { res.writeHead(401); return res.end(JSON.stringify({ errors: [{ message: "Authentication required" }] })); }
    const q = body.query, v = body.variables || {};
    const reply = (data) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ data })); };
    if (state.failOn && q.includes(state.failOn)) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ errors: [{ message: "boom on " + state.failOn }] })); }
    if (/query Viewer/.test(q)) return reply({ viewer: { id: "u-1", name: "Andres", email: "a@x" } });
    if (/query Teams/.test(q)) return reply({ teams: { nodes: state.teams || [state.team, { id: "team-2", key: "OPS", name: "Operaciones" }] } });
    if (/query TeamDetail/.test(q)) return reply({ team: { ...state.team, states: { nodes: state.states } } });
    if (/query Labels/.test(q)) return reply({ issueLabels: { nodes: state.labels } });
    if (/mutation IssueCreate/.test(q)) {
      note({ op: "issueCreate", input: v.input });
      const n = ++state.seq;
      const stateId = state.landIn || v.input.stateId;
      const st = state.states.find((s) => s.id === stateId) || state.states[0];
      const issue = { id: "iss-" + n, identifier: state.team.key + "-" + n, title: v.input.title, url: "https://linear.app/x/issue/" + state.team.key + "-" + n,
        state: { id: st.id, name: st.name, type: st.type }, parent: v.input.parentId ? { id: v.input.parentId } : null,
        labels: { nodes: state.labels.filter((l) => (v.input.labelIds || []).includes(l.id)) }, description: v.input.description || "" };
      state.issues.set(issue.id, issue);
      return reply({ issueCreate: { success: true, issue: { id: issue.id, identifier: issue.identifier, url: issue.url } } });
    }
    if (/query IssueRead/.test(q)) {
      const i = state.issues.get(v.id) || [...state.issues.values()].find((x) => x.identifier === v.id);
      return reply({ issue: i ? { ...i, relations: { nodes: (i.relations || []) } } : null });
    }
    if (/mutation IssueRelationCreate/.test(q)) {
      note({ op: "issueRelationCreate", input: v.input });
      const a = state.issues.get(v.input.issueId), b = state.issues.get(v.input.relatedIssueId);
      if (a && b) { (a.relations ||= []).push({ type: v.input.type, relatedIssue: { id: b.id, identifier: b.identifier } }); }
      return reply({ issueRelationCreate: { success: true, issueRelation: { id: "rel-" + state.mutations.length } } });
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "operación desconocida en el stub: " + q.slice(0, 60) }] }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/graphql`, state, close: () => new Promise((r) => server.close(r)) };
}

/* `node stub.mjs` lo levanta suelto e imprime la URL; JARVIIS_LINEAR_STUB_LOG
   fija el archivo de log. */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const direct = (() => { try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (direct) {
  const s = await linearStub({ log: process.env.JARVIIS_LINEAR_STUB_LOG || null });
  console.log(s.url);
  setInterval(() => {}, 1 << 30);
}
