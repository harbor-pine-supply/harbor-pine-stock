# Harbor & Pine stock tools

Small command-line tools over the warehouse's inventory export. Fictional company, made-up data.

## Commands
- Full check (tests and hook tests, one line): `node scripts/check.mjs`
- Second opinion from Codex (read-only review of the current change): `node scripts/second-opinion.mjs`

## Rules
- Work from the work package in `docs/work-packages/`. Touch only the files it lists as in scope.
- Plain Node.js, no dependencies. ES modules.
- Every change gets a test. Run the full check before you say you're done.
- `data/` is the warehouse's export: read it, never edit it.
- Never read `.env` or key files.
- Never commit to `main`. Work on a branch; a person approves every pull request.
