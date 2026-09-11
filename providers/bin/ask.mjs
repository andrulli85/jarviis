#!/usr/bin/env node
/* ask.mjs: la puerta de proveedores desde la terminal.

   node providers/bin/ask.mjs --status
   node providers/bin/ask.mjs --need text "clasifica esto"
   node providers/bin/ask.mjs --need agent --opposite claude --cwd . "revisa el árbol"
   echo "prompt largo" | node providers/bin/ask.mjs --need text --model terra

   Sale 0 solo si llegó una respuesta. Un fallo del proveedor sale 1 con el
   `why` en stderr; un mal uso sale 2. */

import { ask, resolve, status } from "../index.mjs";

const argv = process.argv.slice(2);
const opts = { need: "text", mode: "readonly", effort: "high" };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const take = () => { if (i + 1 >= argv.length) usage(`${a} necesita un valor`); return argv[++i]; };
  if (a === "--status") opts.status = true;
  else if (a === "--json") opts.json = true;
  else if (a === "--need") opts.need = take();
  else if (a === "--channel") opts.channel = take();
  else if (a === "--model") opts.model = take();
  else if (a === "--family") opts.family = take();
  else if (a === "--opposite") opts.opposite = take();
  else if (a === "--mode") opts.mode = take();
  else if (a === "--effort") opts.effort = take();
  else if (a === "--cwd") opts.cwd = take();
  else if (a === "--system") opts.system = take();
  else if (a === "-h" || a === "--help") usage();
  else if (a.startsWith("--")) usage(`opción desconocida ${a}`);
  else positional.push(a);
}

if (opts.status) {
  const s = status();
  for (const [k, v] of Object.entries(s)) {
    console.log(`${k.padEnd(10)} ${v == null ? "—" : typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  process.exit(0);
}

let prompt = positional.join(" ");
if (!prompt && !process.stdin.isTTY) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  prompt = Buffer.concat(chunks).toString("utf8");
}
if (!prompt.trim()) usage("falta el prompt (argumento o stdin)");

const resolved = resolve(opts);
if (!resolved.ok) { console.error(resolved.why); process.exit(1); }
console.error(`→ ${resolved.channel} ${resolved.model} (${resolved.how})`);
const r = await ask(resolved, { ...opts, prompt });
if (!r.ok) { console.error(`✗ ${r.why}`); process.exit(1); }
process.stdout.write(r.text + "\n");
const u = r.usage ? ` in=${r.usage.in} out=${r.usage.out} reasoning=${r.usage.reasoning} cost=$${r.usage.cost}` : "";
console.error(`✓ ${r.seconds}s${r.provider ? " via " + r.provider : ""}${u}`);

function usage(msg) {
  if (msg) console.error(msg);
  console.error(`uso: ask.mjs [--status] [--need text|agent] [--channel claude|codex|openrouter]
       [--model id|alias] [--family claude|gpt] [--opposite claude|gpt]
       [--mode readonly|edit|full] [--effort low|medium|high|xhigh] [--cwd DIR]
       [--system TEXTO] [--json] PROMPT`);
  process.exit(2);
}
