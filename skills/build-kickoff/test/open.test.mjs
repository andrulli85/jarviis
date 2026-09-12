import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deepLink, kickoffPrompt, repoRoot, parseKey, branchName, fetchIssue } from "../scripts/open.mjs";

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

test("fetchIssue: sin clave devuelve {} sin llamar; con clave lee título y la línea Spec:; error o issue ausente devuelven {}", async () => {
  let calls = 0;
  const noKey = { LINEAR_API_KEY: "", LINEAR_KEY_FILE: "/nonexistent", HOME: "/nonexistent" };
  assert.deepEqual(await fetchIssue("JAR-12", { env: noKey, fetchFn: async () => { calls++; return {}; } }), {});
  assert.equal(calls, 0, "sin clave no toca la red");
  const env = { LINEAR_API_KEY: "lin_fake", JARVIIS_LINEAR_URL: "http://127.0.0.1:9/graphql" };
  const ok = async (url, init) => {
    calls++;
    assert.equal(init.headers.Authorization, "lin_fake");
    assert.match(init.body, /"id":"JAR-12"/);
    return { json: async () => ({ data: { issue: { title: "Login mágico", description: "## Objetivo\n…\n\nSpec: `docs/specs/login-magico.md`" } } }) };
  };
  assert.deepEqual(await fetchIssue("JAR-12", { env, fetchFn: ok }), { title: "Login mágico", spec: "docs/specs/login-magico.md" });
  const sinSpec = async () => ({ json: async () => ({ data: { issue: { title: "T", description: "sin línea de spec" } } }) });
  assert.deepEqual(await fetchIssue("JAR-12", { env, fetchFn: sinSpec }), { title: "T", spec: null });
  assert.deepEqual(await fetchIssue("JAR-99", { env, fetchFn: async () => ({ json: async () => ({ data: { issue: null } }) }) }), {});
  assert.deepEqual(await fetchIssue("JAR-12", { env, fetchFn: async () => { throw new Error("red"); } }), {});
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
