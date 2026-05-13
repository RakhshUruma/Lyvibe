/**
 * vj-lyrics MCP server + HTTP shim.
 *
 * Run:    node --import tsx relay/vj-mcp.ts          (default: stdio MCP + HTTP on :8787)
 *         RELAY_PORT=9999 node ... relay/vj-mcp.ts
 *
 * MCP tools:
 *   - generate_mood   (vibe) -> { mood: string }
 *   - validate_mood   (json) -> { ok, errors }
 *   - list_presets    () -> { presets: string[] }
 *   - remix           (mood, hint) -> { mood: string }
 *   - subscription_call (vibe) -> { mood: string } [via `claude -p` shim]
 *
 * HTTP shim (for browser): /health, /generate { vibe }, /validate { json }, /sub { vibe }
 *
 * The HTTP server is what the browser talks to; the MCP stdio transport
 * is what Claude Code / Claude Desktop / Cursor connect to.
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MOOD_SYSTEM_PROMPT, buildUserPrompt } from "../src/mood/prompt";
import { normalizeMood } from "../src/mood/normalize";
import { PRESETS } from "../src/mood/presets";

const PORT = Number(process.env.RELAY_PORT ?? 8787);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// ---------------------------------------------------------------------
// core mood generators
// ---------------------------------------------------------------------

const anth = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

const extractJson = (s: string): string => {
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i === -1 || j === -1) throw new Error("no JSON object in model output");
  return s.slice(i, j + 1);
};

const genMoodAnthropic = async (vibe: string): Promise<string> => {
  if (!anth) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await anth.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: "text", text: MOOD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }] as any,
    messages: [{ role: "user", content: buildUserPrompt(vibe) }],
  });
  const txt = (r.content as any[]).filter(b => b.type === "text").map(b => b.text).join("");
  return extractJson(txt);
};

/** Subscription relay via local `claude -p` (Pro/Max plan, no API key). */
const genMoodSubscription = (vibe: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const prompt = `${MOOD_SYSTEM_PROMPT}\n\n${buildUserPrompt(vibe)}`;
    const proc = spawn("claude", ["-p", prompt], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude -p exit ${code}: ${err}`));
      try { resolve(extractJson(out)); } catch (e) { reject(e); }
    });
  });

const validateMood = (raw: string): { ok: boolean; errors: string[] } => {
  try {
    const obj = JSON.parse(raw);
    normalizeMood(obj);
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
};

const remix = async (moodJson: string, hint: string): Promise<string> => {
  const v = `Take this existing mood JSON and remix it according to: "${hint}". Keep the schema. Return JSON only.\n\nbase:\n${moodJson}`;
  return genMoodAnthropic(v);
};

// ---------------------------------------------------------------------
// HTTP shim (for browser fallback)
// ---------------------------------------------------------------------

const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
};

const readBody = (req: http.IncomingMessage): Promise<any> =>
  new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => { buf += c; });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });

/**
 * HTTP shim — protocol matches reference/vj-relay.mjs:
 *   GET  /health                       -> { ok, version, claude, model, hasKey }
 *   POST /generate { prompt, model? }  -> { result, source, raw? }
 * Plus VJ-Lyrics-specific extras:
 *   POST /mood     { vibe }            -> { json }   (server builds the prompt)
 *   POST /validate { json }            -> { ok, errors }
 */

/**
 * Run `claude -p` with prompt piped via stdin.
 *
 * Why stdin: passing the prompt as a CLI argument with shell:true on Windows
 * lets cmd.exe interpret the quotes/special chars in our long schema prompt,
 * which silently mangles the input — claude then returns prose ("I don't
 * understand…") and the caller hits "no JSON in result".
 *
 * Stdin sidesteps all shell escaping. We still need shell:true on Windows so
 * that PATH resolves `claude.cmd`.
 */
const runClaudeCli = (prompt: string, model?: string): Promise<{ result: string; raw: any }> =>
  new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json"];
    if (model) args.push("--model", model);
    const child = spawn("claude", args, {
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => reject(new Error("spawn failed: " + e.message)));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || `claude exited ${code}: ${out.slice(0, 300)}`));
      // log the first 200 chars so we can debug "no JSON in result" cases
      console.error(`[vj-lyrics] claude returned ${out.length} bytes; first chars: ${out.slice(0, 120).replace(/\s+/g," ")}`);
      try {
        const data = JSON.parse(out);
        resolve({ result: data.result ?? data.text ?? out, raw: data });
      } catch {
        resolve({ result: out, raw: null });
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "600",
};

// pending mood pushed from Claude side; consumed by next /pull-mood
let pendingMood: unknown = null;
let pendingMoodId: string | null = null;

const httpServer = http.createServer(async (req, res) => {
  // CORS preflight needs the full set of allow-* headers, not just 204.
  // Without them the browser blocks the subsequent POST → "Failed to fetch".
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }
  console.error(`[vj-lyrics] ${req.method} ${req.url}`);

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, version: 1, claude: "claude", model: MODEL, hasKey: !!anth });
  }

  // Reference-compatible: { prompt, model? } -> { result, source, raw? }
  if (req.method === "POST" && req.url === "/generate") {
    try {
      const { prompt, model } = await readBody(req);
      if (!prompt || typeof prompt !== "string") return json(res, 400, { error: "missing 'prompt' string" });
      if (anth) {
        const r = await anth.messages.create({
          model: model ?? MODEL,
          max_tokens: 2048,
          system: [{ type: "text", text: MOOD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }] as any,
          messages: [{ role: "user", content: prompt }],
        });
        const txt = (r.content as any[]).filter(b => b.type === "text").map(b => b.text).join("");
        return json(res, 200, { result: txt, source: "anthropic", raw: r });
      }
      const out = await runClaudeCli(prompt, model);
      return json(res, 200, { result: out.result, source: "subscription", raw: out.raw });
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // VJ-Lyrics convenience — server composes the prompt
  if (req.method === "POST" && req.url === "/mood") {
    try {
      const { vibe } = await readBody(req);
      if (!vibe) return json(res, 400, { error: "vibe required" });
      const out = anth ? await genMoodAnthropic(vibe) : await genMoodSubscription(vibe);
      return json(res, 200, { json: out });
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // === Live state sync — browser POSTs current mood/lyrics; Claude reads files ===
  if (req.method === "POST" && req.url === "/sync") {
    try {
      const body = await readBody(req);
      const stateDir = path.resolve(process.cwd(), ".state");
      await fs.mkdir(stateDir, { recursive: true });
      const writes: string[] = [];
      const ts = new Date().toISOString();
      if (body.mood !== undefined) {
        await fs.writeFile(path.join(stateDir, "current-mood.json"),
          JSON.stringify({ updatedAt: ts, mood: body.mood }, null, 2));
        writes.push("mood");
      }
      if (body.lyrics !== undefined) {
        await fs.writeFile(path.join(stateDir, "current-lyrics.json"),
          JSON.stringify({ updatedAt: ts, lyrics: body.lyrics }, null, 2));
        writes.push("lyrics");
      }
      if (body.meta !== undefined) {
        await fs.writeFile(path.join(stateDir, "current-meta.json"),
          JSON.stringify({ updatedAt: ts, ...body.meta }, null, 2));
        writes.push("meta");
      }
      return json(res, 200, { ok: true, wrote: writes });
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (req.method === "GET" && req.url === "/state") {
    try {
      const stateDir = path.resolve(process.cwd(), ".state");
      const read = async (name: string) => {
        try { return JSON.parse(await fs.readFile(path.join(stateDir, name), "utf-8")); }
        catch { return null; }
      };
      return json(res, 200, {
        mood:   await read("current-mood.json"),
        lyrics: await read("current-lyrics.json"),
        meta:   await read("current-meta.json"),
      });
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // === Push from Claude → buffer; browser polls /pull-mood to apply ===
  if (req.method === "POST" && req.url === "/push-mood") {
    try {
      const body = await readBody(req);
      if (!body || typeof body.mood !== "object") return json(res, 400, { error: "mood object required" });
      pendingMood = body.mood;
      pendingMoodId = `m${Date.now()}`;
      return json(res, 200, { ok: true, id: pendingMoodId });
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (req.method === "GET" && req.url === "/pull-mood") {
    if (!pendingMood) return json(res, 200, { mood: null });
    const out = { mood: pendingMood, id: pendingMoodId };
    pendingMood = null; pendingMoodId = null;
    return json(res, 200, out);
  }

  if (req.method === "POST" && req.url === "/validate") {
    try {
      const body = await readBody(req);
      return json(res, 200, validateMood(body.json));
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  json(res, 404, { error: "not found" });
});

// ---------------------------------------------------------------------
// MCP server (stdio)
// ---------------------------------------------------------------------

const mcp = new Server({ name: "vj-lyrics", version: "1.1.0" }, { capabilities: { tools: {} } });

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_mood",
      description: "Generate a VJ Lyrics mood JSON from a vibe prompt.",
      inputSchema: {
        type: "object",
        properties: { vibe: { type: "string" } },
        required: ["vibe"],
      },
    },
    {
      name: "validate_mood",
      description: "Validate a mood JSON string against the schema.",
      inputSchema: {
        type: "object",
        properties: { json: { type: "string" } },
        required: ["json"],
      },
    },
    {
      name: "list_presets",
      description: "List built-in mood preset names.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "remix",
      description: "Take an existing mood JSON and a remix hint; return a new mood JSON.",
      inputSchema: {
        type: "object",
        properties: { mood: { type: "string" }, hint: { type: "string" } },
        required: ["mood", "hint"],
      },
    },
    {
      name: "subscription_call",
      description: "Generate via local `claude -p` (no API key, uses Pro/Max).",
      inputSchema: {
        type: "object",
        properties: { vibe: { type: "string" } },
        required: ["vibe"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a } = req.params;
  const args = a as Record<string, any>;
  try {
    if (name === "generate_mood") {
      const out = await genMoodAnthropic(String(args.vibe));
      return { content: [{ type: "text", text: out }] };
    }
    if (name === "validate_mood") {
      return { content: [{ type: "text", text: JSON.stringify(validateMood(String(args.json))) }] };
    }
    if (name === "list_presets") {
      return { content: [{ type: "text", text: JSON.stringify({ presets: Object.keys(PRESETS) }) }] };
    }
    if (name === "remix") {
      const out = await remix(String(args.mood), String(args.hint));
      return { content: [{ type: "text", text: out }] };
    }
    if (name === "subscription_call") {
      const out = await genMoodSubscription(String(args.vibe));
      return { content: [{ type: "text", text: out }] };
    }
    throw new Error(`unknown tool: ${name}`);
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
  }
});

// ---------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------

const main = async () => {
  httpServer.listen(PORT, "127.0.0.1", () => {
    console.error(`[vj-lyrics] HTTP shim on http://127.0.0.1:${PORT} (anthropic=${!!anth})`);
  });
  // Only attach MCP transport if invoked from MCP host (stdin is not a TTY).
  if (!process.stdin.isTTY) {
    const t = new StdioServerTransport();
    await mcp.connect(t);
    console.error("[vj-lyrics] MCP stdio transport connected");
  } else {
    console.error("[vj-lyrics] (no stdio MCP — running HTTP only)");
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
