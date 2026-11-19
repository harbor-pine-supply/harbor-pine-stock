#!/usr/bin/env node
// Second opinion: asks Codex, a different AI model, to review the current change, read-only.
// Codex can't open files on every machine, so this script puts what it needs in the prompt:
// the work package, `git status`, the diff against main, and the full text of every changed or new file.
// Writes the review to .scratch/second-opinion.md and prints one line: the verdict and the number of findings.
// It's advice, not a gate: exit 0 whatever the verdict; exit 1 only if Codex couldn't run.
//
// Needs the Codex CLI. Set CODEX_BIN to its path if `codex` isn't on your PATH.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trimEnd();
const SKIP = /^(\.scratch\/|\.env($|\.)|node_modules\/)/;

const status = git("status", "--short");
const diff = git("diff", "main");
const changed = status.split("\n").filter(Boolean).map((l) => l.slice(3).trim()).filter((p) => !SKIP.test(p) && existsSync(join(root, p)) && !p.endsWith("/"));
const untrackedDirs = status.split("\n").filter((l) => l.startsWith("?? ") && l.endsWith("/")).map((l) => l.slice(3));
for (const dir of untrackedDirs) for (const p of git("ls-files", "--others", "--exclude-standard", dir).split("\n").filter(Boolean)) if (!SKIP.test(p)) changed.push(p);
const packages = git("ls-files", "docs/work-packages").split("\n").filter(Boolean);

const prompt = `You are the second-opinion reviewer for a small change in a fictional company's repository (Harbor & Pine Supply, made-up data). You can't run anything; review only what is below.

Review the change against its work package. Look for: acceptance criteria that aren't met or aren't tested; bugs and unhandled edge cases; tests that would pass even if the code were wrong; anything outside the work package's scope; security problems. Don't invent problems: if something is fine, don't list it.

Answer in this format:
VERDICT: READY | SHIP WITH FIXES | NOT READY
Then numbered findings, each on its own lines:
N. [high|medium|low] file:line: the problem, in one or two sentences.
   Fix: the concrete change you'd make.
If there are no findings, write "No findings."

=== Work package(s) ===
${packages.map((p) => `--- ${p} ---\n${readFileSync(join(root, p), "utf8")}`).join("\n")}

=== git status --short ===
${status || "(clean)"}

=== git diff main ===
${diff || "(no tracked changes)"}

=== Full text of changed and new files ===
${[...new Set(changed)].map((p) => `--- ${p} ---\n${readFileSync(join(root, p), "utf8")}`).join("\n")}
`;

const bin = process.env.CODEX_BIN || "codex";
const r = spawnSync(bin, ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"], { cwd: root, input: prompt, encoding: "utf8", timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
if (r.error || r.status !== 0) {
  console.log(`second-opinion: Codex couldn't run (${r.error ? r.error.code ?? r.error.message : `exit ${r.status}`}). Nothing was reviewed.`);
  process.exit(1);
}
// Keep Codex's answer only: the text after its last "codex" line, without the token count.
const out = r.stdout.replace(/\r/g, "");
const answer = (out.split(/^codex$/m).pop() || out).replace(/^tokens used[\s\S]*$/m, "").trim();
mkdirSync(join(root, ".scratch"), { recursive: true });
writeFileSync(join(root, ".scratch", "second-opinion.md"), `# Second opinion (Codex, read-only)\n\n${answer}\n`);
const verdict = (/VERDICT:\s*(READY|SHIP WITH FIXES|NOT READY)/i.exec(answer) ?? [, "no verdict given"])[1].toUpperCase();
const findings = (answer.match(/^\d+\.\s/gm) ?? []).length;
console.log(`second-opinion: ${verdict}, ${findings} finding${findings === 1 ? "" : "s"}. Full review: .scratch/second-opinion.md`);
