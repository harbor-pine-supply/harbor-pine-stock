---
description: Commit the change on its branch, push it and open the pull request with the checks and the second-opinion decisions. Only when asked with /open-pr.
disable-model-invocation: true
---

# Open the pull request

1. Run `node scripts/check.mjs`. If it fails, stop and report the line.
2. If you're on `main`, stop: the change must be on its own branch.
3. `git status --short`, then `git add` only the files the work package lists as in scope, and commit with a message that says what changed and why.
4. Write `.scratch/pr-body.md` with these sections:
   - **What changed and why** (link the work package)
   - **How it was checked** (paste the check line, and the report's output on today's data)
   - **Second opinion** (Codex's verdict, then the decisions table from `.scratch/review-decisions.md`)
   - **Risks** and **What to review first**
5. `git push -u origin <branch>`, then `gh pr create --base main --title "<short title>" --body-file .scratch/pr-body.md`.
6. Print the pull request's address. Don't merge it: a person reviews and approves it.
