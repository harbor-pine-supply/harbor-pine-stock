// Tests for the protect-files hook: pipe sample tool calls to it, as Claude Code does, and check the exit code.
// 2 = blocked, 0 = allowed. Run: node --test ".claude/hooks/test/*.test.mjs" (scripts/check.mjs runs them too).
// The "known limitation" tests pin down what the hook can't see, so a change in behaviour is noticed.
// Those gaps are covered by the deny rules in .claude/settings.json, not by this hook.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HOOK = fileURLToPath(new URL("../protect-files.mjs", import.meta.url));
const project = mkdtempSync(join(tmpdir(), "hook-test-"));
const run = (input, env = {}) => {
  const r = spawnSync(process.execPath, [HOOK], { cwd: project, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env } });
  return { code: r.status, err: r.stderr };
};
const read = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });

test("blocks reading .env, .env.local and multi-part names", () => {
  for (const f of [".env", join(project, ".env"), ".env.local", "config/.env.production.local", ".env.example.secret"]) assert.equal(run(read(f)).code, 2, f);
});
test("allows .env.example, which holds names only", () => {
  assert.equal(run(read(".env.example")).code, 0);
});
test("blocks key and certificate files", () => {
  for (const f of ["server.key", "certs/site.pem", "signing.pfx"]) assert.equal(run(read(f)).code, 2, f);
});
test("blocks shell commands and searches that name a secret file", () => {
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "cat .env | head" } }).code, 2);
  assert.equal(run({ tool_name: "Grep", tool_input: { pattern: "KEY", path: ".env.local" } }).code, 2);
});
test("blocks edits to logs/, by any edit tool, relative or absolute", () => {
  assert.equal(run({ tool_name: "Edit", tool_input: { file_path: join(project, "logs", "sync.log") } }).code, 2);
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: "logs/new.log" }, cwd: project }).code, 2);
  assert.equal(run({ tool_name: "NotebookEdit", tool_input: { notebook_path: "logs/x.ipynb" }, cwd: project }).code, 2);
});
test("allows ordinary work: code, tests, reading logs, other folders named logs outside the project", () => {
  assert.equal(run(read("src/order.js")).code, 0);
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "npm test" } }).code, 0);
  assert.equal(run(read("logs/sync.log")).code, 0);
  assert.equal(run({ tool_name: "Edit", tool_input: { file_path: join(project, "src", "logs", "note.md") } }).code, 0);
});
test("fails closed on input it can't read or doesn't understand", () => {
  for (const bad of ["not json", "null", "{}", '{"tool_name":"Read"}', '"a string"']) assert.equal(run(bad).code, 2, bad);
});
test("still blocks when it can't write its log", () => {
  const notAFolder = join(project, "file-not-folder");
  writeFileSync(notAFolder, "x");
  assert.equal(run(read(".env"), { CLAUDE_PROJECT_DIR: notAFolder }).code, 2);
});
test("never writes the command or path to its log", () => {
  run({ tool_name: "Bash", tool_input: { command: "echo SENTINEL-not-a-real-secret > .env" } });
  const log = join(project, ".scratch", "hooks.log");
  assert.ok(existsSync(log));
  assert.ok(!readFileSync(log, "utf8").includes("SENTINEL"));
});
test("known limitation: a script that opens the file itself isn't seen", () => {
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "node scripts/print-config.mjs" } }).code, 0);
});
test("known limitation: a broad search that never names the file isn't seen", () => {
  assert.equal(run({ tool_name: "Grep", tool_input: { pattern: "API_KEY", path: "." } }).code, 0);
});
test("known limitation (safe side): a command that only mentions .env is blocked too", () => {
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "git status .env" } }).code, 2);
});
