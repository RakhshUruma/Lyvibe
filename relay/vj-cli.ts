/**
 * Standalone CLI: spawn `claude -p` with the mood prompt and print JSON to stdout.
 * Usage:  node --import tsx relay/vj-cli.ts "horror heartbeat"
 */

import { spawn } from "node:child_process";
import { MOOD_SYSTEM_PROMPT, buildUserPrompt } from "../src/mood/prompt";

const vibe = process.argv.slice(2).join(" ").trim();
if (!vibe) {
  console.error("usage: vj-cli <vibe>");
  process.exit(2);
}

const prompt = `${MOOD_SYSTEM_PROMPT}\n\n${buildUserPrompt(vibe)}`;
const proc = spawn("claude", ["-p", prompt], { stdio: ["ignore", "inherit", "inherit"] });
proc.on("close", (code) => process.exit(code ?? 0));
