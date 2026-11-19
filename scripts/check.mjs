#!/usr/bin/env node
// The full check, in one line: the tests and the hook tests.
// Prints one line (PASS or FAIL). The full output goes to .scratch/check.log.
// Exit code 0 on PASS, 1 on FAIL, so the after-edit hook, CI and people can rely on it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const logLines = [];
const parts = [];
let ok = true;

/** Run one set of tests with the TAP reporter. Returns { pass, fail, firstFail, error }. */
function runTests(glob) {
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", glob], { cwd: root, encoding: "utf8", timeout: 120000 });
  const out = (r.stdout || "") + (r.stderr || "");
  logLines.push(`## node --test ${glob}`, out);
  if (r.error || r.signal) return { error: r.error ? r.error.code ?? r.error.message : `stopped by ${r.signal}` };
  const n = (k) => Number((new RegExp(`^# ${k} (\\d+)`, "m").exec(out) ?? [])[1] ?? 0);
  return { pass: n("pass"), fail: n("fail") + (r.status !== 0 && n("fail") === 0 ? 1 : 0), firstFail: (/^not ok \d+ - (.+)$/m.exec(out) ?? [])[1] };
}
function addTests(label, glob) {
  const t = runTests(glob);
  if (t.error) { ok = false; parts.push(`${label}: could not run (${t.error})`); return; }
  if (t.pass + t.fail === 0) { ok = false; parts.push(`${label}: none found`); return; }
  if (t.fail) { ok = false; parts.push(`${t.pass} of ${t.pass + t.fail} ${label} pass${t.firstFail ? `, first failure: ${t.firstFail}` : ""}`); }
  else parts.push(`${t.pass} ${label}`);
}

try {
  addTests("tests", "test/**/*.test.js");
  if (existsSync(join(root, ".claude", "hooks", "test"))) addTests("hook tests", ".claude/hooks/test/*.test.mjs");
} catch (e) {
  ok = false;
  parts.push(`error: ${e.code ?? e.message}`);
}

try { mkdirSync(join(root, ".scratch"), { recursive: true }); writeFileSync(join(root, ".scratch", "check.log"), logLines.join("\n") + "\n"); } catch { /* the result line still prints */ }
console.log(`check: ${ok ? "PASS" : "FAIL"} (${parts.join("; ")})${ok ? "" : ". Full log: .scratch/check.log"}`);
process.exit(ok ? 0 : 1);
