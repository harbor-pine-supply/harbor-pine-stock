#!/usr/bin/env node
// PostToolUse hook: after the agent edits a file in src/ or test/, run the full check.
// On FAIL, exit 2 with one line on stderr, so the agent sees the result and can fix it.
// (The edit has already happened: PostToolUse can't undo it, only report.)
// Every run is written to .scratch/hooks.log (best effort: logging can't hide a failing check).

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

let root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const log = (line) => { try { mkdirSync(join(root, ".scratch"), { recursive: true }); appendFileSync(join(root, ".scratch", "hooks.log"), line + "\n"); } catch { /* best effort */ } };
const report = (line) => { process.stderr.write(line + "\n"); process.exit(2); };

let call;
try { call = JSON.parse(readFileSync(0, "utf8")); } catch { report("check-after-edit: couldn't read the tool call, so the check didn't run."); }
root = process.env.CLAUDE_PROJECT_DIR || call?.cwd || process.cwd();
const target = call?.tool_input?.file_path;
if (typeof target !== "string") process.exit(0);
const file = relative(root, isAbsolute(target) ? target : resolve(call.cwd || root, target)).replace(/\\/g, "/");
if (!/^(src|test)\//.test(file)) process.exit(0); // docs and notes don't need the check

const r = spawnSync(process.execPath, [join(root, "scripts", "check.mjs")], { cwd: root, encoding: "utf8", timeout: 120000 });
const line = r.error ? `check: could not run (${r.error.code ?? r.error.message})` : (r.stdout || r.stderr || "check: no output").trim().split("\n").pop();
log(`PostToolUse ${call.tool_name} ${file}: ${line}`);
if (r.error || r.status !== 0) report(`${line} [check-after-edit, after your edit to ${file}]`);
process.exit(0);
