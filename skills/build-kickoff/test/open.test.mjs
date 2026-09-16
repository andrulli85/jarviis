import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deepLink, kickoffPrompt, repoRoot, parseKey, branchName, fetchIssue } from "../scripts/open.mjs";
import { linearStub } from "../../to-tickets-linear/test/stub.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "open.mjs");

test("parseKey: misma regla que el wayfinder, y la URL de Linear manda", () => {
  const noPrefix = { JARVIIS_LINEAR_PREFIX: "" };
  assert.equal(parseKey("JAR-12", noPrefix), "JAR-12");
  assert.equal(parseKey("abre jar-12 ya", noPrefix), null, "minúsculas sin prefijo no es clave");
  assert.equal(parseKey("abre jar-12 ya", { JARVIIS_LINEAR_PREFIX: "JAR" }), "JAR-12");
  assert.equal(parseKey("usa gpt-5 para JAR-12", noPrefix), "JAR-12");
  assert.equal(parseKey("https://linear.app/jarviis-2/issue/JAR-12/login", noPrefix), "JAR-12", "el slug del workspace no es la clave");
  assert.equal(parseKey("https://linear.app/jarviis-2/issue/jar-12/login", noPrefix), "JAR-12");
  assert.equal(parseKey("ABC-3 no es del proyecto", { JARVIIS_LINEAR_PREFIX: "JAR" }), null);
  assert.equal(parseKey("login mágico", noPrefix), null);
  assert.equal(parseKey("", noPrefix), null);
});

test("kickoffPrompt: nombra la clave, la spec, tdd, git-conventions y la PR", () => {
  const p = kickoffPrompt({ key: "JAR-12", spec: "docs/specs/login.md" });
  assert.match(p, /JAR-12/);
  assert.match(p, /docs\/specs\/login\.md/);
  assert.match(p, /\/tdd/);
  assert.match(p, /git-conventions/);
  assert.match(p, /PR/);
  assert.match(p, /Slice/);
  const sinSpec = kickoffPrompt({ key: "JAR-12" });
  assert.match(sinSpec, /Spec:/, "sin ruta conocida, dice dónde buscarla");
});

test("branchName: <slug de la spec>/<clave>-<título en kebab>; sin spec no hay grupo; sin título, solo la clave", () => {
  assert.equal(branchName({ key: "JAR-12", spec: "docs/specs/flujos-end-to-end.md", title: "El wayfinder entra por la estación que dicta el estado del issue en Linear" }),
    "flujos-end-to-end/jar-12-el-wayfinder-entra-por-la-estacion");
  assert.equal(branchName({ key: "JAR-12", title: "Login mágico" }), "jar-12-login-magico");
  assert.equal(branchName({ key: "JAR-12", spec: "docs/specs/login-magico.md" }), "login-magico/jar-12");
  assert.equal(branchName({ key: "jar-12", spec: "login-magico.md", title: "  Ñandú & co  " }), "login-magico/jar-12-nandu-co", "sin ruta, sin acentos, sin símbolos");
});

test("kickoffPrompt: con título manda el nombre exacto de la rama; sin él, la plantilla", () => {
  const exact = kickoffPrompt({ key: "JAR-12", spec: "docs/specs/login-magico.md", title: "Enviar el enlace mágico por email" });
  assert.match(exact, /renombra la rama a exactamente `login-magico\/jar-12-enviar-el-enlace-magico-por-email`/);
  const tpl = kickoffPrompt({ key: "JAR-12", spec: "docs/specs/login-magico.md" });
  assert.match(tpl, /`login-magico\/jar-12-<título-del-issue-en-kebab-6-palabras>`/);
  const nada = kickoffPrompt({ key: "JAR-12" });
  assert.match(nada, /`<slug-de-la-spec>\/jar-12-<título-del-issue-en-kebab-6-palabras>`/);
});

/* D12: sin GraphQL propio. Lo que sabe del issue lo lee por `issueInfo` de
   linear.mjs, contra el mismo stub que prueba a linear.mjs. Mejor esfuerzo:
   sin clave, sin red, o con el issue ausente devuelve {} y nunca lanza. */
test("fetchIssue: sin clave devuelve {} sin tocar la red; con clave lee título y Spec: por linear.mjs; ausente o sin red devuelve {}", async () => {
  const noKey = { LINEAR_API_KEY: "", LINEAR_KEY_FILE: "/nonexistent", HOME: "/nonexistent" };
  const stub = await linearStub({ issues: [
    { identifier: "JAR-12", title: "Login mágico", description: "## Objetivo\n…\n\nSpec: `docs/specs/login-magico.md`", state: { name: "Todo", type: "unstarted" } },
    { identifier: "JAR-13", title: "T", description: "sin línea de spec", state: { name: "Todo", type: "unstarted" } },
  ] });
  try {
    const env = { LINEAR_API_KEY: "lin_fake", JARVIIS_LINEAR_URL: stub.url };
    assert.deepEqual(await fetchIssue("JAR-12", { env: { ...noKey, JARVIIS_LINEAR_URL: stub.url } }), {});
    assert.deepEqual(await fetchIssue("JAR-12", { env }), { title: "Login mágico", spec: "docs/specs/login-magico.md" });
    assert.deepEqual(await fetchIssue("JAR-13", { env }), { title: "T", spec: null });
    assert.deepEqual(await fetchIssue("JAR-99", { env }), {});
    assert.deepEqual(stub.state.mutations, [], "leer no escribe");
  } finally { await stub.close(); }
  assert.deepEqual(await fetchIssue("JAR-12", { env: { LINEAR_API_KEY: "lin_fake", JARVIIS_LINEAR_URL: "http://127.0.0.1:1/" } }), {}, "sin red");
});

test("deepLink via linear: linear_id y prompt codificados", () => {
  const url = deepLink({ via: "linear", key: "JAR-12", prompt: "hola ñ & fin" });
  assert.equal(url, "conductor://linear_id=JAR-12&prompt=hola%20%C3%B1%20%26%20fin");
});

test("deepLink via path: prompt y path codificados; sin path es un error", () => {
  const url = deepLink({ via: "path", key: "JAR-12", prompt: "p", path: "/Users/a/code/my app" });
  assert.equal(url, "conductor://prompt=p&path=%2FUsers%2Fa%2Fcode%2Fmy%20app");
  assert.throws(() => deepLink({ via: "path", key: "JAR-12", prompt: "p" }), /path/);
  assert.throws(() => deepLink({ via: "otro", key: "JAR-12", prompt: "p" }), /via/);
});

test("repoRoot: la raíz de Conductor si está, si no la de git, si no null", () => {
  assert.equal(repoRoot({ CONDUCTOR_ROOT_PATH: "/r" }, "/cualquiera"), "/r");
  const t = mkdtempSync(join(tmpdir(), "bk-")); mkdirSync(join(t, ".git")); mkdirSync(join(t, "sub"));
  assert.equal(repoRoot({}, join(t, "sub")), t);
  assert.equal(repoRoot({}, mkdtempSync(join(tmpdir(), "bk-nogit-"))), null);
});

test("CLI --print imprime la URL y no abre nada; JARVIIS_NO_OPEN también", () => {
  const out = execFileSync("node", [script, "JAR-12", "--print"], { encoding: "utf8", env: { ...process.env, JARVIIS_NO_OPEN: "", LINEAR_API_KEY: "", LINEAR_KEY_FILE: "/nonexistent" } });
  assert.match(out, /^conductor:\/\/linear_id=JAR-12&prompt=/m);
  const out2 = execFileSync("node", [script, "JAR-12"], { encoding: "utf8", env: { ...process.env, JARVIIS_NO_OPEN: "1", LINEAR_API_KEY: "", LINEAR_KEY_FILE: "/nonexistent" } });
  assert.match(out2, /^conductor:\/\/linear_id=JAR-12/m);
});

test("CLI --title y --spec: el prompt de la URL lleva la rama exacta, sin tocar Linear", () => {
  const out = execFileSync("node", [script, "JAR-7", "--spec", "docs/specs/login-magico.md", "--title", "Enviar el enlace mágico por email", "--print"],
    { encoding: "utf8", env: { ...process.env, LINEAR_API_KEY: "", LINEAR_KEY_FILE: "/nonexistent", JARVIIS_LINEAR_URL: "http://127.0.0.1:9/graphql" } });
  const prompt = decodeURIComponent(out.trim().split("prompt=")[1]);
  assert.match(prompt, /exactamente `login-magico\/jar-7-enviar-el-enlace-magico-por-email`/);
});

test("CLI: sin clave sale 2 con motivo; --via path sin repo sale 1", () => {
  assert.throws(() => execFileSync("node", [script, "sin clave", "--print"], { encoding: "utf8", stdio: "pipe" }), (e) => e.status === 2 && /clave/.test(e.stderr));
  const t = mkdtempSync(join(tmpdir(), "bk-nogit-"));
  assert.throws(() => execFileSync("node", [script, "JAR-1", "--via", "path", "--print"], { encoding: "utf8", stdio: "pipe", cwd: t, env: { ...process.env, CONDUCTOR_ROOT_PATH: "" } }),
    (e) => e.status === 1 && /repositorio/.test(e.stderr));
});

/* D1-D6 y D9: el prompt de arranque es lo único que el agente del workspace
   lee antes de tocar el tablero, así que lleva la regla única, los tres
   momentos con su comando exacto y el camino por linear.mjs. Lo que no está
   aquí no pasa: medido el 2026-09-12, un issue derivado (JAR-8) apareció sin
   explicación porque nadie se lo había pedido al agente. */
test("kickoffPrompt: la regla única, los tres momentos y el comando de cada uno", () => {
  const p = kickoffPrompt({ key: "JAR-17", spec: "docs/specs/linear-comentarios-para-humanos.md" });
  assert.match(p, /solo si Andy tomaría una decisión distinta/, "la regla única, literal");
  assert.match(p, /linear\.mjs move JAR-17 "In Progress"/, "arranque: a In Progress por comando");
  assert.match(p, /linear\.mjs move JAR-17 "In Review"/, "cierre: a In Review al abrir la PR");
  assert.match(p, /linear\.mjs comment JAR-17/, "los tres momentos comentan por comando");
  assert.match(p, /Arranque/); assert.match(p, /Cambio de plan/); assert.match(p, /Cierre/);
  assert.match(p, /linear\.mjs create .*--blocked-by JAR-17/, "issue derivado: create con el bloqueo");
  assert.match(p, /se cierra con esta PR/, "el cierre lo dice en palabras");
  assert.match(p, /Slack/, "el tono");
  /* D2 (GPT quitó rama y workspace del arranque): eso ya lo muestra Conductor. */
  const arranque = p.split("\n").find((l) => /^1\./.test(l));
  assert.ok(arranque, "el arranque es el momento 1");
  assert.doesNotMatch(arranque, /rama|workspace/i, "el arranque no nombra rama ni workspace");
});

/* Negativo (D7): el prompt no pide una petición a mano por ninguna vía, y no
   nombra ni la tecnología ni la clave de API. Nombrarlas ya es media
   invitación a saltarse la única puerta, así que la prohibición se escribe
   sin ellas: "nunca una petición a mano contra la API de Linear". El criterio
   de JAR-17 es literal: el prompt no contiene `curl` ni `graphql`. */
test("kickoffPrompt: nunca pide una petición a mano, y no nombra la tecnología", () => {
  const p = kickoffPrompt({ key: "JAR-17", spec: "docs/specs/x.md", title: "Un título" });
  for (const prohibido of [/curl/i, /graphql/i, /api\.linear\.app/, /mutation /i, /LINEAR_API_KEY/]) {
    assert.doesNotMatch(p, prohibido, `el prompt no puede nombrar ${prohibido}`);
  }
  assert.match(p, /nunca una petición a mano/i, "y lo prohíbe en palabras");
});

/* El comando tiene que ser ejecutable desde cualquier workspace, no solo
   desde este repo: la skill personal está enlazada en ~/.claude/skills. */
test("kickoffPrompt: el comando del tablero apunta a la skill personal y el equipo sale de la clave", () => {
  const p = kickoffPrompt({ key: "JAR-17", spec: "docs/specs/x.md" });
  assert.match(p, /~\/\.claude\/skills\/to-tickets-linear\/scripts\/linear\.mjs/);
  assert.match(p, /--team JAR\b/);
  assert.match(kickoffPrompt({ key: "OPS-3" }), /--team OPS\b/);
});

/* Los comentarios y los move los pide este prompt: si la última línea los
   deja bajo "no publiques nada sin decirlo", el agente se para a preguntar y
   la card se queda muda. Medido en este mismo workspace el 2026-09-15. */
test("kickoffPrompt: el permiso pendiente es git, no el tablero", () => {
  const p = kickoffPrompt({ key: "JAR-17", spec: "docs/specs/x.md" });
  assert.match(p, /push y PR cuando lo pida/);
  assert.match(p, /no necesitan permiso aparte/);
});

/* El criterio de aceptación de JAR-17, tal cual: lo que llega al agente es el
   prompt DECODIFICADO de la URL, no el que devuelve la función. Un carácter
   mal codificado (las comillas de "In Progress", los acentos) lo rompería sin
   que ningún test de kickoffPrompt se enterara. */
test("CLI: el prompt decodificado de la URL lleva la regla única y los dos comandos", () => {
  const out = execFileSync("node", [script, "JAR-15", "--print"],
    { encoding: "utf8", env: { ...process.env, LINEAR_API_KEY: "", LINEAR_KEY_FILE: "/nonexistent", HOME: "/nonexistent" } });
  const prompt = decodeURIComponent(out.trim().split("prompt=")[1]);
  assert.match(prompt, /solo si Andy tomaría una decisión distinta/);
  assert.match(prompt, /linear\.mjs comment JAR-15/);
  assert.match(prompt, /linear\.mjs move JAR-15 "In Progress"/);
  assert.match(prompt, /linear\.mjs move JAR-15 "In Review"/);
  assert.doesNotMatch(prompt, /curl|graphql/i);
});

/* Hallazgo del review adversarial de Codex (2026-09-16, pasada 2): el prompt
   pedía el comentario AL bloquearse y ninguno al salir del bloqueo, así que la
   card se quedaba diciendo "esperando X" con el trabajo ya reanudado — y Andy
   iría a desbloquear algo que ya está suelto, que es exactamente la decisión
   distinta que D1 usa como test. No es el temporizador que la spec deja fuera:
   ocurre dentro de la sesión que reanuda el trabajo, no en un reloj. */
test("kickoffPrompt: salir del bloqueo también se cuenta", () => {
  const p = kickoffPrompt({ key: "JAR-17", spec: "docs/specs/x.md" });
  assert.match(p, /qué esperas y qué lo desbloquea/, "el bloqueo, como antes");
  assert.match(p, /cuando vuelvas a moverte, dilo/i, "y la salida del bloqueo, antes de seguir");
  assert.doesNotMatch(p, /cada \d+ ?(h|hora|min)/i, "sin promesa de reloj");
});
