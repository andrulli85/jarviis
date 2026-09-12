#!/usr/bin/env node
/* linear.mjs: la vía de publicación de /to-tickets-linear.

   node linear.mjs resolve <equipo>                  → tabla de resolución (JSON)
   node linear.mjs publish <plan.json> [--dry-run] [--resume]   → informe (JSON)
   node linear.mjs issue <clave>                     → estado y PR adjunta (JSON)

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
    if (!byRef.has(b)) throw new Error(`${i.ref} dice estar bloqueado por ${b}, que no está en el plan`);
  }
  const out = [], state = new Map();
  const visit = (i, path) => {
    const s = state.get(i.ref);
    if (s === "done") return;
    if (s === "visiting") throw new Error(`ciclo de bloqueos: ${[...path, i.ref].join(" → ")}`);
    state.set(i.ref, "visiting");
    for (const b of i.blockedBy || []) visit(byRef.get(b), [...path, i.ref]);
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

  const payloads = ordered.filter((i) => !i.key).map((i) => {
    const labelIds = (i.labels || []).map((name) => {
      const id = labelId.get(String(name).toLowerCase());
      if (!id) throw new Error(`la etiqueta "${name}" no existe en ${res.team.key}; hay: ${res.labels.map((l) => l.name).join(", ") || "ninguna"}`);
      return id;
    });
    if (i.priority !== undefined && !(Number.isInteger(i.priority) && i.priority >= 0 && i.priority <= 4)) {
      throw new Error(`priority de ${i.ref} debe ser un entero 0-4 (0 sin prioridad, 1 urgente … 4 baja); llegó ${JSON.stringify(i.priority)}`);
    }
    const input = { teamId: res.team.id, title: i.title, description: description(i, plan), stateId: res.backlogState.id, labelIds };
    if (i.priority !== undefined) input.priority = i.priority;
    const subtasks = (i.subtasks || []).map((s) => ({ title: s.title, input: { teamId: res.team.id, title: s.title, description: description(s, plan), stateId: res.backlogState.id, labelIds } }));
    return { ref: i.ref, input, subtasks, blockedBy: i.blockedBy || [] };
  });
  const isNew = new Set(payloads.map((p) => p.ref));
  const relations = [];
  for (const i of ordered) for (const b of i.blockedBy || []) {
    if (isNew.has(i.ref) || isNew.has(b)) relations.push({ blocker: b, blocked: i.ref });
  }

  const report = { dryRun, resume, team: res.team, backlogState: res.backlogState, payloads, relations, created: [], relationsCreated: [], skipped: keyed.map((i) => ({ ref: i.ref, key: i.key })) };
  if (dryRun) return report;

  const idOf = new Map();
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

/* ---------------------------------------------------------- issueState --- */

const Q_STATE = `query IssueState($key: String!) { issue(id: $key) {
  identifier
  state { name type }
  attachments { nodes { sourceType metadata } }
} }`;

/* Lo que el wayfinder necesita para enrutar un issue: { type, name, pr }.
   `type` es la categoría del estado (backlog, unstarted, started, completed,
   canceled, duplicate), `name` el nombre tal cual, `pr` el `metadata.status`
   del último attachment de GitHub ("open" | "merged") o null. Lanza sin
   clave, sin red, o si el issue no existe; el timeout es corto (3 s) porque
   corre en cada `/wayfinder JAR-n` y sin respuesta la ruta sigue sin él. */
export async function issueState(key, env = process.env) {
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
  return { type: issue.state.type, name: issue.state.name, pr };
}

/* ---------------------------------------------------------------- main --- */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
const invokedDirectly = (() => { try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (invokedDirectly) {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  try {
    if (cmd === "resolve") out(await resolveTeam(arg));
    else if (cmd === "issue") out(await issueState(arg));
    else if (cmd === "publish") {
      const plan = JSON.parse(readFileSync(arg, "utf8"));
      const r = await publish(plan, { dryRun: rest.includes("--dry-run"), resume: rest.includes("--resume") });
      /* Con claves aterrizadas, el borrador se reescribe con ellas; a mitad
         de camino también, porque lo creado hasta ahí es lo que hay que
         saber para no duplicarlo en un reintento. */
      if (!r.dryRun && r.created.length) writeFileSync(arg, JSON.stringify(withKeys(plan, r), null, 2) + "\n");
      out(r);
      if (r.ok === false) process.exit(1);
    } else {
      console.error("uso: linear.mjs resolve <equipo> | publish <plan.json> [--dry-run] [--resume] | issue <clave>");
      process.exit(2);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
