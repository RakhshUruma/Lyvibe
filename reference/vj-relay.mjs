#!/usr/bin/env node
// vj-relay.mjs
// Bridges browser fetch -> local `claude` CLI so the web app can use
// the Claude Pro/Max subscription instead of an API key.
//
// Usage:
//   node vj-relay.mjs               # listens on http://127.0.0.1:8787
//   node vj-relay.mjs --port 9000
//
// Endpoints (CORS-open):
//   GET  /health         -> { ok: true, version: 1, claude: "<resolved path>" }
//   POST /generate       -> body { prompt, model? } -> { result, source: "subscription", raw? }
//
// Requires: `claude` CLI on PATH (Claude Code). The CLI uses your active
// Pro/Max subscription session.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { argv } from "node:process";

const args = Object.fromEntries(
  argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]);
    return a;
  }, [])
);
const PORT = parseInt(args.port || "8787", 10);
const HOST = args.host || "127.0.0.1";
const CLAUDE_BIN = args.claude || "claude";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function jsonOut(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", c => (buf += c));
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

function runClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    const cliArgs = ["-p", prompt, "--output-format", "json"];
    if (model) cliArgs.push("--model", model);
    const child = spawn(CLAUDE_BIN, cliArgs, {
      shell: process.platform === "win32",
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => (stdout += d));
    child.stderr.on("data", d => (stderr += d));
    child.on("error", err => reject(new Error("spawn failed: " + err.message)));
    child.on("close", code => {
      if (code !== 0) return reject(new Error(stderr || `claude exited with ${code}`));
      // claude --output-format json returns a wrapper object containing `.result`
      try {
        const data = JSON.parse(stdout);
        resolve({ result: data.result ?? data.text ?? stdout, raw: data });
      } catch {
        resolve({ result: stdout, raw: null });
      }
    });
  });
}

const server = createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  if (req.method === "GET" && req.url === "/health") {
    return jsonOut(res, 200, { ok: true, version: 1, claude: CLAUDE_BIN });
  }

  if (req.method === "POST" && req.url === "/generate") {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonOut(res, 400, { error: "invalid json body" }); }
    const { prompt, model } = body;
    if (!prompt || typeof prompt !== "string") {
      return jsonOut(res, 400, { error: "missing 'prompt' string" });
    }
    try {
      const out = await runClaude(prompt, model);
      return jsonOut(res, 200, { result: out.result, source: "subscription", raw: out.raw });
    } catch (e) {
      return jsonOut(res, 500, { error: e.message });
    }
  }

  jsonOut(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`vj-lyrics relay listening on http://${HOST}:${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  POST /generate  { prompt, model? }`);
  console.log(`  uses '${CLAUDE_BIN}' CLI (Pro/Max subscription)`);
});
