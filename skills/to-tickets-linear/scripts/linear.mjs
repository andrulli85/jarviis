#!/usr/bin/env node
/* linear.mjs: la vía de publicación de /to-tickets-linear.

   node linear.mjs resolve <equipo>                  → tabla de resolución (JSON)
   node linear.mjs publish <plan.json> [--dry-run] [--resume]   → informe (JSON)
   node linear.mjs issue <clave>                     → estado, PR, título y spec (JSON)
   node linear.mjs comment <clave> <texto | ->       → { key, commentId, url }
   node linear.mjs comment-draft <borrador.json> <texto | ->    → informe (JSON)
   node linear.mjs create --team … --title … --description <texto | -> …  → { key, url }
   node linear.mjs assign <clave> [me]               → { key, assignee }
   node linear.mjs move <clave> <estado>             → { key, from, state }
   node linear.mjs link <A> blocks <B>               → { blocker, blocked, created }

   Es la única puerta al tablero (D7 de docs/specs/linear-comentarios-para-humanos.md):
   ningún skill ni prompt escribe GraphQL a mano.

   GraphQL directo contra api.linear.app con LINEAR_API_KEY. Sin MCP: el MCP
   oficial pide OAuth en sesión interactiva, y este script tiene que correr
   headless en evals contra un stub (JARVIIS_LINEAR_URL).

   Dos propiedades heredadas de to-tickets-jira, aquí como código y no como
   prosa:

   1. LOS IDS VIAJAN, LOS NOMBRES NO. Todo lo que Linear posee (equipo,
      estado, etiqueta, issue) se resuelve en esta corrida y se envía como id.
      Una etiqueta que no existe es un error con la lista de las que sí, no
      una etiqueta nueva creada por accidente.
   2. EL GATE DE ACEPTACIÓN ES HUMANO. Ningún issue creado aquí acaba en un
      estado de categoría completed, canceled o duplicate (las tres cierran;
      visto en el workspace real el 2026-09-11). El create lleva siempre el id
      del primer estado backlog (o unstarted) del equipo, y la re-lectura
      comprueba la CATEGORÍA (`state.type`), no el nombre, porque el nombre
      lo edita un admin y la categoría no.

   Un create que devuelve success no es un create correcto: cada issue se
   re-lee y lo que aterrizó es lo que se reporta. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const URL_DEFAULT = "https://api.linear.app/graphql";
const DONE_TYPES = new Set(["completed", "canceled", "duplicate"]);

/* ------------------------------------------------------------ transport --- */

export function apiKey(env = process.env) {
  if (env.LINEAR_API_KEY && env.LINEAR_API_KEY.trim()) return env.LINEAR_API_KEY.trim();
  const file = env.LINEAR_KEY_FILE || join(env.HOME || homedir(), ".config/linear/key");
  if (existsSync(file)) { const k = readFileSync(file, "utf8").trim(); if (k) return k; }
  return null;
}

/* JARVIIS_LINEAR_TIMEOUT_MS sustituye el default de 30 s (publicar puede
   tardar) pero nunca supera un `timeoutMs` explícito: el de issueState es un
   techo de la spec, no un default. */
async function gql(query, variables, env, { timeoutMs } = {}) {
  const key = apiKey(env);
  if (!key) throw new Error("sin clave de Linear: ni LINEAR_API_KEY ni ~/.config/linear/key");
  const fromEnv = Number(env.JARVIIS_LINEAR_TIMEOUT_MS) || 30000;
  const ms = timeoutMs ? Math.min(timeoutMs, fromEnv) : fromEnv;
  const r = await fetch(env.JARVIIS_LINEAR_URL || URL_DEFAULT, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(ms),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = null; }
  if (!r.ok) throw new Error(`http ${r.status} ${(body?.errors?.[0]?.message || text).slice(0, 160)}`);
  if (body?.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; ").slice(0, 300));
  return body.data;
}

/* ------------------------------------------------------------- resolve --- */

const Q_TEAMS = `query Teams { teams { nodes { id key name } } }`;
const Q_TEAM = `query TeamDetail($id: String!) { team(id: $id) {
  id key name
  states { nodes { id name type position } }
} }`;
/* Etiquetas de workspace (team null) y del equipo. Solo `team.labels`
   dejaba fuera las de workspace, que es donde viven Bug/Feature/Improvement
   por defecto, y una etiqueta válida se rechazaba como inexistente. */
const Q_LABELS = `query Labels { issueLabels(first: 250) { nodes { id name team { id } } } }`;
const Q_VIEWER = `query Viewer { viewer { id name email } }`;

/* El equipo en palabras del usuario: clave (JAR) o nombre (Jarviis), sin
   distinguir mayúsculas. Sin match: la lista de lo que hay, para elegir. */
export async function resolveTeam(words, env = process.env) {
  const wanted = String(words || "").trim().toLowerCase();
  if (!wanted) throw new Error("dime el equipo (clave o nombre)");
  const { teams } = await gql(Q_TEAMS, {}, env);
  const list = teams.nodes;
  const show = (ts) => ts.map((t) => `${t.key} (${t.name})`).join(", ");
  let team = list.find((t) => t.key.toLowerCase() === wanted) || list.find((t) => t.name.toLowerCase() === wanted);
  if (!team) {
    /* Match parcial solo si es único: "platform" entre "Web Platform" y
       "Mobile Platform" es una pregunta, no una elección. */
    const partial = list.filter((t) => t.name.toLowerCase().includes(wanted));
    if (partial.length > 1) throw new Error(`"${words}" encaja con varios equipos: ${show(partial)}; di cuál`);
    team = partial[0];
  }
  if (!team) throw new Error(`ningún equipo se llama "${words}"; hay: ${show(list)}`);
  const detail = (await gql(Q_TEAM, { id: team.id }, env)).team;
  const states = [...detail.states.nodes].sort((a, b) => a.position - b.position);
  const allLabels = (await gql(Q_LABELS, {}, env)).issueLabels.nodes;
  const labels = allLabels.filter((l) => !l.team || l.team.id === team.id).map(({ id, name }) => ({ id, name }));
  const backlogState = states.find((s) => s.type === "backlog") || states.find((s) => s.type === "unstarted");
  if (!backlogState) throw new Error(`el equipo ${team.key} no tiene ningún estado backlog ni unstarted; no hay dónde crear sin tocar el gate`);
  const viewer = (await gql(Q_VIEWER, {}, env)).viewer;
  return { team: { id: team.id, key: team.key, name: team.name }, states, backlogState, labels, viewer };
}

/* --------------------------------------------------------------- order --- */

/* Un blockedBy con forma de clave (JAR-14) que no es ref del plan es un
   issue que ya existe en Linear (D11: así `create --blocked-by` y un issue
   derivado en Build cuelgan de su bloqueador real). Se resuelve por
   identificador antes de escribir; no entra en el orden. */
const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/;
export const isExternalKey = (ref, byRef) => !byRef.has(ref) && KEY_SHAPE.test(String(ref));

/* Bloqueadores primero, para que cada relación apunte a un issue que ya
   existe. Estable: entre libres, el orden del plan. */
export function order(issues) {
  const byRef = new Map();
  for (const i of issues) {
    if (!i.ref) throw new Error("cada issue del plan necesita un ref");
    if (byRef.has(i.ref)) throw new Error(`ref duplicado en el plan: ${i.ref}`);
    byRef.set(i.ref, i);
  }
  for (const i of issues) for (const b of i.blockedBy || []) {
    if (!byRef.has(b) && !isExternalKey(b, byRef)) throw new Error(`${i.ref} dice estar bloqueado por ${b}, que no está en el plan`);
  }
  const out = [], state = new Map();
  const visit = (i, path) => {
    const s = state.get(i.ref);
    if (s === "done") return;
    if (s === "visiting") throw new Error(`ciclo de bloqueos: ${[...path, i.ref].join(" → ")}`);
    state.set(i.ref, "visiting");
    for (const b of i.blockedBy || []) if (byRef.has(b)) visit(byRef.get(b), [...path, i.ref]);
    state.set(i.ref, "done");
    out.push(i);
  };
  for (const i of issues) visit(i, []);
  return out;
}

/* ------------------------------------------------------------- publish --- */

const M_CREATE = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } } }`;
const Q_ISSUE = `query IssueRead($id: String!) { issue(id: $id) {
  id identifier title url description
  state { id name type }
  team { id key }
  assignee { id name }
  parent { id }
  labels { nodes { id name } }
  relations { nodes { type relatedIssue { id identifier } } }
} }`;
const M_RELATION = `mutation IssueRelationCreate($input: IssueRelationCreateInput!) {
  issueRelationCreate(input: $input) { success issueRelation { id } } }`;

function description(issue, plan) {
  const parts = [];
  if (issue.description) parts.push(issue.description.trim());
  if (plan.spec) parts.push(`Spec: \`${plan.spec}\``);
  return parts.join("\n\n");
}

/* plan: { team, spec?, issues: [{ ref, title, description?, labels?, priority?, blockedBy?, subtasks?: [{ title, description? }] }] }
   opts: { env, dryRun, resume }
   Devuelve siempre un informe; solo lanza por un plan inválido o una
   resolución imposible, que son fallos ANTES de la primera escritura.

   Un issue del plan que ya trae `key` ya salió. Sin `resume` el plan se
   rechaza entero, porque volver a publicarlo duplica todo lo que ya existe;
   con `resume` los que tienen clave se resuelven por identificador y solo se
   crean los que no la tienen, más las relaciones en las que participa al
   menos uno nuevo. */
export async function publish(plan, { env = process.env, dryRun = false, resume = false } = {}) {
  const ordered = order(plan.issues || []);
  const keyed = ordered.filter((i) => i.key);
  if (keyed.length && !resume) {
    throw new Error(`el plan ya tiene claves (${keyed.map((i) => i.key).join(", ")}): ya se publicó. Usa resume para crear solo lo que falta, o quita las claves si de verdad quieres duplicar`);
  }
  const res = await resolveTeam(plan.team, env);
  const labelId = new Map(res.labels.map((l) => [l.name.toLowerCase(), l.id]));
  const byRef = new Set(ordered.map((i) => i.ref));
  const externalKeys = [...new Set(ordered.flatMap((i) => (i.blockedBy || []).filter((b) => isExternalKey(b, byRef))))];
  /* Los bloqueadores externos se leen antes de la primera escritura, también
     en dry-run: una clave que no existe es un plan inválido, no un fallo a mitad. */
  const external = [];
  for (const key of externalKeys) { const e = await readIssue(key, env); external.push({ key, id: e.id }); }

  const payloads = ordered.filter((i) => !i.key).map((i) => {
    const labelIds = (i.labels || []).map((name) => {
      const id = labelId.get(String(name).toLowerCase());
      if (!id) throw new Error(`la etiqueta "${name}" no existe en ${res.team.key}; hay: ${res.labels.map((l) => l.name).join(", ") || "ninguna"}`);
      return id;
    });
    if (i.priority !== undefined && !(Number.isInteger(i.priority) && i.priority >= 0 && i.priority <= 4)) {
      throw new Error(`priority de ${i.ref} debe ser un entero 0-4 (0 sin prioridad, 1 urgente … 4 baja); llegó ${JSON.stringify(i.priority)}`);
    }
    /* D7: todo lo que crea la fábrica sale asignado al dueño de la clave. */
    const base = { teamId: res.team.id, stateId: res.backlogState.id, labelIds, assigneeId: res.viewer.id };
    const input = { ...base, title: i.title, description: description(i, plan) };
    if (i.priority !== undefined) input.priority = i.priority;
    const subtasks = (i.subtasks || []).map((s) => ({ title: s.title, input: { ...base, title: s.title, description: description(s, plan) } }));
    return { ref: i.ref, input, subtasks, blockedBy: i.blockedBy || [] };
  });
  const isNew = new Set(payloads.map((p) => p.ref));
  const relations = [];
  for (const i of ordered) for (const b of i.blockedBy || []) {
    if (isNew.has(i.ref) || isNew.has(b)) relations.push({ blocker: b, blocked: i.ref });
  }

  const report = { dryRun, resume, team: res.team, backlogState: res.backlogState, payloads, relations, external, created: [], relationsCreated: [], skipped: keyed.map((i) => ({ ref: i.ref, key: i.key })) };
  if (dryRun) return report;

  const idOf = new Map(external.map((e) => [e.key, e.id]));
  try {
    for (const i of keyed) {
      const existing = (await gql(Q_ISSUE, { id: i.key }, env)).issue;
      if (!existing) throw new Error(`${i.ref} dice ser ${i.key} y Linear no lo encuentra`);
      idOf.set(i.ref, existing.id);
    }
    for (const p of payloads) {
      const c = (await gql(M_CREATE, { input: p.input }, env)).issueCreate;
      if (!c?.success || !c.issue?.id) throw new Error(`issueCreate de ${p.ref} no devolvió un issue`);
      const landed = (await gql(Q_ISSUE, { id: c.issue.id }, env)).issue;
      if (!landed) throw new Error(`${c.issue.identifier} no se puede re-leer tras crearlo`);
      const entry = { ref: p.ref, id: landed.id, key: landed.identifier, url: landed.url, landed, subtasks: [] };
      idOf.set(p.ref, landed.id);
      report.created.push(entry);
      for (const s of p.subtasks) {
        const sc = (await gql(M_CREATE, { input: { ...s.input, parentId: landed.id } }, env)).issueCreate;
        if (!sc?.success || !sc.issue?.id) throw new Error(`subtarea "${s.title}" de ${p.ref} no se creó`);
        const sl = (await gql(Q_ISSUE, { id: sc.issue.id }, env)).issue;
        entry.subtasks.push({ id: sl.id, key: sl.identifier, url: sl.url, landed: sl });
      }
    }
    for (const r of relations) {
      const rc = (await gql(M_RELATION, { input: { issueId: idOf.get(r.blocker), relatedIssueId: idOf.get(r.blocked), type: "blocks" } }, env)).issueRelationCreate;
      if (!rc?.success) throw new Error(`no se pudo crear ${r.blocker} blocks ${r.blocked}`);
      report.relationsCreated.push(r);
    }
  } catch (e) {
    report.ok = false;
    report.why = `parado en mitad de la publicación: ${e.message}. Creados hasta ahora: ${report.created.map((c) => c.key).join(", ") || "ninguno"}`;
    report.verification = verify(report, payloads, relations);
    return report;
  }
  report.verification = verify(report, payloads, relations);
  const v = report.verification;
  report.ok = v.doneCategory.length === 0 && v.count === payloads.length && v.relationsMissing.length === 0;
  if (!report.ok) {
    const why = [];
    if (v.doneCategory.length) why.push(`${v.doneCategory.join(", ")} aterrizaron en categoría Done`);
    if (v.count !== payloads.length) why.push(`se crearon ${v.count} issues y el plan tenía ${payloads.length}`);
    if (v.relationsMissing.length) why.push(`faltan relaciones: ${v.relationsMissing.map((r) => `${r.blocker}→${r.blocked}`).join(", ")}`);
    report.why = why.join("; ");
  }
  return report;
}

/* create: un issue suelto (un derivado en Build, un bug visto de paso) por
   el mismo camino que publish (D11): plan de un issue, backlog, relectura,
   categoría, relaciones con bloqueadores existentes. Devuelve el informe de
   publish con `key` y `url` arriba; en dry-run, el informe con el payload. */
export async function create({ team, title, description, labels = [], priority, blockedBy = [], spec } = {}, { env = process.env, dryRun = false } = {}) {
  if (!team) throw new Error("create necesita el equipo (--team <clave|nombre>)");
  if (!String(title || "").trim()) throw new Error("create necesita un título (--title)");
  const issue = { ref: "issue", title: String(title).trim(), description: String(description || ""), labels, blockedBy };
  if (priority !== undefined) issue.priority = priority;
  const plan = { team, issues: [issue] };
  if (spec) plan.spec = spec;
  const report = await publish(plan, { env, dryRun });
  const c = report.created[0];
  return { key: c?.key || null, url: c?.url || null, ...report };
}

/* El borrador con las claves que aterrizaron, para reescribirlo en
   docs/tickets/<slug>.json: un borrador con claves ya salió; sin ellas, no.
   Pura: el que escribe el archivo es el CLI. */
export function withKeys(plan, report) {
  const byRef = new Map(report.created.map((c) => [c.ref, c]));
  return {
    ...plan,
    issues: plan.issues.map((i) => {
      const c = byRef.get(i.ref);
      if (!c) return i;
      const out = { ...i, key: c.key, url: c.url };
      if (i.subtasks?.length) out.subtasks = i.subtasks.map((s, n) => c.subtasks[n] ? { ...s, key: c.subtasks[n].key, url: c.subtasks[n].url } : s);
      return out;
    }),
  };
}

function verify(report, payloads, relations) {
  const all = report.created.flatMap((c) => [c, ...c.subtasks]);
  const doneCategory = all.filter((c) => DONE_TYPES.has(c.landed?.state?.type)).map((c) => c.key);
  const done = new Set(report.relationsCreated.map((r) => r.blocker + "→" + r.blocked));
  const relationsMissing = relations.filter((r) => !done.has(r.blocker + "→" + r.blocked));
  return { count: report.created.length, expected: payloads.length, doneCategory, relationsMissing };
}

/* ------------------------------------------------ comandos del tablero --- */

/* Un issue por clave, con lo que los comandos necesitan (id, equipo,
   estado, asignado, relaciones). Lanza con la clave si no existe: Linear
   responde con error a un identificador desconocido, y algún stub con null. */
async function readIssue(key, env) {
  let data;
  try { data = await gql(Q_ISSUE, { id: key }, env); }
  catch (e) { if (/not found/i.test(e.message)) throw new Error(`${key} no existe en Linear`); throw e; }
  if (!data?.issue) throw new Error(`${key} no existe en Linear`);
  return data.issue;
}

const M_COMMENT = `mutation CommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { id url } } }`;

/* comment <clave> <texto>: el comentario que lee Andy en la card (D1-D6 lo
   redactan; aquí solo se publica). Devuelve { key, commentId, url }. */
export async function comment(key, body, { env = process.env, dryRun = false } = {}) {
  const text = String(body || "").trim();
  if (!text) throw new Error("el comentario necesita texto (argumento o stdin)");
  const issue = await readIssue(key, env);
  const payload = { issueId: issue.id, body: text };
  if (dryRun) return { dryRun: true, key: issue.identifier, payload };
  const c = (await gql(M_COMMENT, { input: payload }, env)).commentCreate;
  if (!c?.success || !c.comment?.id) throw new Error(`commentCreate en ${key} no devolvió un comentario`);
  return { key: issue.identifier, commentId: c.comment.id, url: c.comment.url };
}

/* comment-draft <borrador.json> <texto | ->: el comentario de Slice (D5),
   el mismo resumen del desglose validado en cada issue de primer nivel del
   borrador.

   D13: no lo emite `publish`. Es un paso propio que corre después de
   `publish.ok:true` Y de mergear la PR de docs, para que el enlace al
   veredicto apunte a `main`. Entre ambos momentos no queda nada en memoria,
   así que la reanudación no puede depender de la corrida: el recibo
   `comment: { id, at }` vive en el borrador, junto a `key`, y este paso solo
   comenta los issues que no lo tienen. No hay `--resume`; reanudar es la
   única forma de correr. Un duplicado por recibo perdido se acepta (se ve en
   la card y se borra a mano); un comentario perdido, no.

   **Solo el primer nivel.** Las subtareas no reciben el resumen: el porqué
   del desglose en un hijo de checklist es el ruido que prohíbe D1 (Andy no
   decide distinto al leerlo dos veces), y el frontmatter de la spec ya guarda
   solo las claves de primer nivel. Pero la decisión se dice en voz alta:
   `skippedSubtasks` nombra las que quedaron fuera, porque un informe `ok:true`
   sobre un borrador con cards sin tocar es una mentira por omisión (hallazgo
   del review adversarial de Codex, 2026-09-16).

   Pura respecto al borrador: quien le escribe los recibos es `withComments`
   y el archivo lo reescribe el CLI. */
export async function commentDraft(plan, body, { env = process.env, dryRun = false } = {}) {
  const text = String(body || "").trim();
  if (!text) throw new Error("el comentario de Slice necesita texto (argumento o `-` para leerlo de stdin)");
  const issues = plan?.issues || [];
  if (!issues.length) throw new Error("el borrador no tiene issues que comentar");
  /* Sin clave no hay dónde comentar: el borrador no se publicó (o se publicó
     a medias). Es un fallo del paso anterior, y se ve antes de escribir. */
  const sinClave = issues.filter((i) => !i.key).map((i) => i.ref || i.title);
  if (sinClave.length) throw new Error(`el borrador tiene issues sin clave (${sinClave.join(", ")}): publish no terminó, no hay dónde comentar`);

  const pendientes = issues.filter((i) => !i.comment);
  const report = {
    dryRun, total: issues.length,
    already: issues.filter((i) => i.comment).map((i) => i.key),
    pending: pendientes.map((i) => i.key),
    /* Vacía y no ausente: leer el informe no debe depender de saber si el
       campo existe en esta corrida. */
    skippedSubtasks: issues.flatMap((i) => (i.subtasks || []).map((st) => st.key).filter(Boolean)),
    commented: [],
  };
  if (dryRun) {
    report.payloads = [];
    for (const i of pendientes) {
      const { payload } = await comment(i.key, text, { env, dryRun: true });
      report.payloads.push({ key: i.key, payload });
    }
    return report;
  }
  for (const i of pendientes) {
    try {
      const c = await comment(i.key, text, { env });
      report.commented.push({ key: c.key, commentId: c.commentId, url: c.url, at: new Date().toISOString() });
    } catch (e) {
      report.ok = false;
      report.why = `parado en ${i.key}: ${e.message}. Comentados hasta ahora: ${report.commented.map((c) => c.key).join(", ") || "ninguno"}. Guarda los recibos y repite el paso: solo comentará los que falten`;
      return report;
    }
  }
  report.ok = true;
  return report;
}

/* El borrador con los recibos que aterrizaron, para reescribir
   docs/tickets/<slug>.json. Igual de pura que `withKeys`, pero no su gemela:
   `withKeys` baja a las subtareas porque cada una recibió su propia clave al
   crearse, y aquí no hay nada que bajar — el resumen del desglose es del
   primer nivel (ver `commentDraft`). Un issue con `comment` ya está
   comentado, uno sin él todavía no. */
export function withComments(plan, report) {
  const byKey = new Map((report.commented || []).map((c) => [c.key, c]));
  return {
    ...plan,
    issues: (plan.issues || []).map((i) => {
      const c = byKey.get(i.key);
      return c ? { ...i, comment: { id: c.commentId, at: c.at } } : i;
    }),
  };
}

const M_UPDATE = `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success issue { id identifier state { id name type } assignee { id name } } } }`;

async function update(issue, input, env) {
  const u = (await gql(M_UPDATE, { id: issue.id, input }, env)).issueUpdate;
  if (!u?.success || !u.issue) throw new Error(`issueUpdate en ${issue.identifier} no devolvió el issue`);
  return u.issue;
}

/* assign <clave> [me]: el asignado pasa a ser el dueño de la clave de API.
   Solo `me`: asignar a otro es una decisión de Andy en el tablero, no de un
   agente. Devuelve { key, assignee }. */
export async function assign(key, who = "me", { env = process.env, dryRun = false } = {}) {
  if (who !== "me") throw new Error(`assign solo admite "me" (el viewer de la clave); llegó "${who}"`);
  const issue = await readIssue(key, env);
  const viewer = (await gql(Q_VIEWER, {}, env)).viewer;
  const input = { assigneeId: viewer.id };
  if (dryRun) return { dryRun: true, key: issue.identifier, payload: { id: issue.id, input } };
  const u = await update(issue, input, env);
  return { key: u.identifier, assignee: u.assignee ? { id: u.assignee.id, name: u.assignee.name } : null };
}

/* move <clave> <nombre de estado>: el estado se resuelve por nombre entre
   los del equipo del issue (la misma query que resolve; los estados son del
   equipo, no del workspace). D8: ninguna categoría de cierre, ni en dry-run:
   el cierre lo hace la PR de Build. Ese rechazo sale con DONE_GATE_EXIT para
   que un prompt lo distinga de un nombre mal escrito. */
export const DONE_GATE_EXIT = 3;
export async function move(key, stateName, { env = process.env, dryRun = false } = {}) {
  const wanted = String(stateName || "").trim().toLowerCase();
  if (!wanted) throw new Error("dime el estado de destino (por nombre)");
  const issue = await readIssue(key, env);
  const states = [...(await gql(Q_TEAM, { id: issue.team.id }, env)).team.states.nodes].sort((a, b) => a.position - b.position);
  const target = states.find((s) => s.name.toLowerCase() === wanted);
  if (!target) throw new Error(`el equipo ${issue.team.key} no tiene un estado "${stateName}"; hay: ${states.map((s) => s.name).join(", ")}`);
  if (DONE_TYPES.has(target.type)) {
    const e = new Error(`"${target.name}" es de categoría ${target.type}: el cierre de ${issue.identifier} lo hace la PR de Build al mergear, no un move`);
    e.exit = DONE_GATE_EXIT;
    throw e;
  }
  const from = { id: issue.state.id, name: issue.state.name, type: issue.state.type };
  const input = { stateId: target.id };
  if (dryRun) return { dryRun: true, key: issue.identifier, from, payload: { id: issue.id, input } };
  const u = await update(issue, input, env);
  return { key: u.identifier, from, state: { id: u.state.id, name: u.state.name, type: u.state.type } };
}

/* link <A> blocks <B>: la relación nativa que Linear pinta en la card. Solo
   `blocks` (es la única que la fábrica usa); idempotente: si A ya bloquea a
   B no se crea otra. Devuelve { blocker, blocked, created }. */
export async function link(blockerKey, type, blockedKey, { env = process.env, dryRun = false } = {}) {
  if (type !== "blocks") throw new Error(`link solo admite "blocks" (link <A> blocks <B>); llegó "${type}"`);
  if (!blockedKey) throw new Error("link necesita los dos extremos: link <A> blocks <B>");
  const a = await readIssue(blockerKey, env);
  const b = await readIssue(blockedKey, env);
  if (a.id === b.id) throw new Error(`${a.identifier} no puede bloquearse a sí mismo`);
  const existed = (a.relations?.nodes || []).some((r) => r.type === "blocks" && r.relatedIssue?.id === b.id);
  const payload = { issueId: a.id, relatedIssueId: b.id, type: "blocks" };
  if (dryRun) return { dryRun: true, blocker: a.identifier, blocked: b.identifier, existed, payload };
  if (existed) return { blocker: a.identifier, blocked: b.identifier, created: false };
  const rc = (await gql(M_RELATION, { input: payload }, env)).issueRelationCreate;
  if (!rc?.success) throw new Error(`no se pudo crear ${a.identifier} blocks ${b.identifier}`);
  return { blocker: a.identifier, blocked: b.identifier, created: true };
}

/* ---------------------------------------------------------- issueState --- */

const Q_STATE = `query IssueState($key: String!) { issue(id: $key) {
  identifier title description
  state { name type }
  attachments { nodes { sourceType metadata } }
} }`;

/* Un issue leído para enrutarlo o arrancarlo: { type, name, pr, title, spec }.
   `type` es la categoría del estado (backlog, unstarted, started, completed,
   canceled, duplicate), `name` el nombre tal cual, `pr` el `metadata.status`
   del último attachment de GitHub ("open" | "merged") o null, `spec` la ruta
   de la línea `Spec:` que publish deja al pie de la descripción (D12: la lee
   build-kickoff, que ya no hace GraphQL propio). Lanza sin clave, sin red, o
   si el issue no existe; el timeout es corto (3 s) porque corre en cada
   `/wayfinder JAR-n` y sin respuesta la ruta sigue sin él. */
export async function issueInfo(key, env = process.env) {
  let data;
  try { data = await gql(Q_STATE, { key }, env, { timeoutMs: 3000 }); }
  catch (e) {
    if (/not found|no existe/i.test(e.message)) throw new Error(`${key} no existe en Linear`);
    if (e.name === "TimeoutError" || e.name === "AbortError") throw new Error(`sin red: timeout leyendo ${key} en Linear`);
    if (e.name === "TypeError" || e.cause) throw new Error(`sin red: ${e.cause?.code || e.message}`);
    throw e;
  }
  const issue = data?.issue;
  if (!issue) throw new Error(`${key} no existe en Linear`);
  const github = (issue.attachments?.nodes || []).filter((a) => a.sourceType === "github");
  const pr = github.length ? (github.at(-1).metadata?.status || null) : null;
  const m = /Spec:\s*`?([^`\n]+?)`?\s*$/m.exec(issue.description || "");
  return { type: issue.state.type, name: issue.state.name, pr, title: issue.title || null, spec: m ? m[1].trim() : null };
}

/* Lo que el wayfinder necesita, y solo eso: hace spread del resultado en su
   salida, así que aquí no entra nada más. */
export async function issueState(key, env = process.env) {
  const { type, name, pr } = await issueInfo(key, env);
  return { type, name, pr };
}

/* ---------------------------------------------------------------- main --- */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const invokedDirectly = (() => { try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  const has = (flag) => rest.includes(flag);
  const words = rest.filter((a) => !a.startsWith("--"));
  /* Las opciones se declaran por comando y lo que no está declarado es un
     error, no un argumento que se descarta: `--dry-runn` tiene que doler
     aquí y no en la card de Andy (hallazgo del review adversarial). El valor
     de una opción nunca empieza por `--`, así que todo `--x` es una opción. */
  const OPCIONES = {
    resolve: [], issue: [], comment: ["--dry-run"], "comment-draft": ["--dry-run"],
    assign: ["--dry-run"], move: ["--dry-run"], link: ["--dry-run"],
    publish: ["--dry-run", "--resume"],
    create: ["--dry-run", "--team", "--title", "--description", "--label", "--priority", "--blocked-by", "--assignee", "--spec"],
  };
  const USO = "uso: linear.mjs resolve <equipo> | publish <plan.json> [--dry-run] [--resume] | issue <clave>\n"
    + "     comment <clave> <texto | -> | comment-draft <borrador.json> <texto | ->\n"
    + "     create --team <equipo> --title <t> --description <texto | -> [--label L] [--priority 0-4] [--blocked-by CLAVE] [--assignee me]\n"
    + "     assign <clave> [me] | move <clave> <estado> | link <A> blocks <B>\n"
    + "     los que escriben aceptan --dry-run: renderizan el payload sin escribir";
  /* Un texto largo (un comentario, una descripción) entra por stdin con `-`:
     así no hay que escapar comillas ni saltos de línea en el prompt. */
  const textOf = (arg, qué) => {
    if (arg === "-") return readFileSync(0, "utf8").trim();
    if (arg === undefined) throw new Error(`falta ${qué} (o \`-\` para leerlo de stdin)`);
    return arg;
  };
  /* --flag valor, repetible: --label a --label b → ["a", "b"]. */
  const flags = (name) => rest.flatMap((a, n) => (a === name && rest[n + 1] !== undefined && !rest[n + 1].startsWith("--") ? [rest[n + 1]] : []));
  const flag = (name) => flags(name).at(-1);

  const dryRun = has("--dry-run");
  /* stdout a un pipe se escribe en trozos, y process.exit() no espera al
     último: el informe llegaba cortado en 65536 bytes, justo el que dice qué
     claves nacieron. exitCode deja que Node vacíe y salga solo. */
  const salirCon = (code) => { process.exitCode = code; };
  /* Un informe de publish (también el de create, que es publish) puede volver
     ok:false con issues ya creados: se imprime entero, la causa va a stderr y
     el exit es 1. Imprimirlo y salir 0 deja seguir a quien lo llamó sin la
     relación que pidió (hallazgo del review adversarial, 2026-09-15). */
  const report = (r) => { out(r); if (r.ok === false) { console.error(r.why); salirCon(1); } };
  try {
    const conocidas = OPCIONES[cmd];
    const mala = conocidas && rest.find((a) => a.startsWith("--") && !conocidas.includes(a));
    if (mala) {
      const e = new Error(`opción desconocida ${mala} en \`${cmd}\`${conocidas.length ? `; admite ${conocidas.join(", ")}` : ": es de solo lectura, nunca escribe, así que no admite opciones"}`);
      e.exit = 2;
      throw e;
    }
    if (cmd === "resolve") out(await resolveTeam(words[0]));
    else if (cmd === "issue") out(await issueInfo(words[0]));
    else if (cmd === "comment") out(await comment(words[0], textOf(words[1], "el texto del comentario"), { dryRun }));
    else if (cmd === "comment-draft") {
      const file = words[0];
      if (!file) throw new Error("comment-draft necesita el borrador (docs/tickets/<slug>.json)");
      const plan = JSON.parse(readFileSync(file, "utf8"));
      const r = await commentDraft(plan, textOf(words[1], "el texto del comentario"), { dryRun });
      /* Los recibos se escriben también cuando el paso paró a mitad: lo
         comentado hasta ahí es justo lo que no hay que repetir. */
      if (!r.dryRun && r.commented.length) writeFileSync(file, JSON.stringify(withComments(plan, r), null, 2) + "\n");
      report(r);
    }
    else if (cmd === "assign") out(await assign(words[0], words[1] || "me", { dryRun }));
    else if (cmd === "move") out(await move(words[0], words.slice(1).join(" "), { dryRun }));
    else if (cmd === "link") out(await link(words[0], words[1], words[2], { dryRun }));
    else if (cmd === "create") {
      const priority = flag("--priority");
      if (priority !== undefined && !/^[0-4]$/.test(priority)) throw new Error(`--priority es un entero 0-4; llegó "${priority}"`);
      const assignee = flag("--assignee");
      if (assignee !== undefined && assignee !== "me") throw new Error(`--assignee solo admite "me"; llegó "${assignee}"`);
      report(await create({
        team: flag("--team"), title: flag("--title"),
        description: textOf(flag("--description"), "la descripción (--description)"),
        labels: flags("--label"), blockedBy: flags("--blocked-by"), spec: flag("--spec"),
        ...(priority === undefined ? {} : { priority: Number(priority) }),
      }, { dryRun }));
    }
    else if (cmd === "publish") {
      const file = words[0];
      const plan = JSON.parse(readFileSync(file, "utf8"));
      const r = await publish(plan, { dryRun, resume: has("--resume") });
      /* Con claves aterrizadas, el borrador se reescribe con ellas; a mitad
         de camino también, porque lo creado hasta ahí es lo que hay que
         saber para no duplicarlo en un reintento. */
      if (!r.dryRun && r.created.length) writeFileSync(file, JSON.stringify(withKeys(plan, r), null, 2) + "\n");
      report(r);
    } else {
      console.error(USO);
      salirCon(2);
    }
  } catch (e) { console.error(e.message); salirCon(e.exit || 1); }
}
