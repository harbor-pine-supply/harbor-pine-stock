#!/usr/bin/env node
// PreToolUse guard: blocks tool calls that name a secret file, and edits to logs/.
// Claude Code sends the tool call as JSON on stdin. Exit 2 blocks the call, and stderr tells the agent why.
// Exit 0 lets the call go ahead.
//
// What it is: a text-matching guard for EXPLICIT references. It reads the call's file paths, search
// paths and patterns, and shell commands. It can't see a file that a script opens by itself, or a broad
// search that never names the file. That's why .claude/settings.json also has Read and Edit deny rules,
// which Claude Code checks as well. Tests: .claude/hooks/test/protect-files.test.mjs.
//
// Fail closed: any error, or input it doesn't understand, blocks the call. (Exit 1 would let it go ahead.)
// The log (.scratch/hooks.log) records only the tool and the rule, never the command or path, because a
// blocked command could itself contain a secret. Logging is best effort and can't stop a block.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

let root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
function block(reason, rule, tool = "unknown") {
  try {
    mkdirSync(join(root, ".scratch"), { recursive: true });
    appendFileSync(join(root, ".scratch", "hooks.log"), `PreToolUse ${String(tool).replace(/\W/g, "")} blocked (${rule})\n`);
  } catch { /* best effort */ }
  process.stderr.write(`Blocked by the protect-files hook: ${reason}\n`);
  process.exit(2);
}

// A file name is secret if it's .env or .env.<anything> (except exactly .env.example), or a key or certificate file.
const isSecretName = (name) => (/^\.env(\..+)?$/i.test(name) && name.toLowerCase() !== ".env.example") || /\.(pem|key|pfx|p12)$/i.test(name);
// Every word of a path, pattern or command, reduced to its last path segment: "cat ./config/.env" -> "cat", ".env"
const names = (text) => text.split(/[\s"'`=;|&<>(),{}]+/).map((t) => t.replace(/^!+/, "").split(/[\\/]/).pop()).filter(Boolean);

try {
  let call;
  try { call = JSON.parse(readFileSync(0, "utf8")); } catch { block("it couldn't read the tool call, so it blocked it to be safe.", "bad-input"); }
  if (!call || typeof call !== "object" || typeof call.tool_name !== "string" || !call.tool_input || typeof call.tool_input !== "object") {
    block("the tool call wasn't in the expected shape, so it blocked it to be safe.", "bad-input");
  }
  const tool = call.tool_name, input = call.tool_input;
  root = process.env.CLAUDE_PROJECT_DIR || call.cwd || process.cwd();

  const texts = [input.file_path, input.notebook_path, input.path, input.pattern, input.glob, input.command].filter((x) => typeof x === "string");
  if (texts.some((t) => names(t).some(isSecretName))) {
    block(".env and key files hold secrets, and agents never read them. Use .env.example for the variable names, and ask a person if you need a value.", "secret-file", tool);
  }

  // logs/ is a record: no edits by the agent's edit tools. (Shell writes are covered by the Edit deny rule.)
  const target = input.file_path ?? input.notebook_path;
  if (["Edit", "Write", "NotebookEdit"].includes(tool) && typeof target === "string") {
    const full = isAbsolute(target) ? target : resolve(call.cwd || root, target);
    const rel = relative(root, full).replace(/\\/g, "/");
    if (rel === "logs" || rel.startsWith("logs/")) block("logs/ is a record and isn't edited. Put notes in .scratch/ instead.", "logs", tool);
  }
  process.exit(0);
} catch {
  block("it hit an error, so it blocked the call to be safe.", "error");
}
