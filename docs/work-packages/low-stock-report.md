# Work package: low-stock report

**Goal:** the warehouse team can run one command to see which products need reordering, so nothing runs out before the reorder is placed.

**In scope (the only files the agent may create or edit):**
- `src/low-stock.js`: the logic, as a function that takes the items and returns the report
- `scripts/low-stock.mjs`: the command, which loads `data/inventory.json` and prints the report
- `test/low-stock.test.js`: the tests
- `README.md`: one short section on how to run it

**Out of scope:** `data/` (it's the warehouse's export: read it, never change it), `src/inventory.js`, any new package or dependency, and anything in `.claude/`.

## Acceptance criteria (each one can fail)
1. An item whose `count` is **below** its `reorder_level` is listed.
2. An item whose `count` is **exactly at** its `reorder_level` is listed too (reorder at or below the level).
3. Items with a missing, non-integer or negative `count` or `reorder_level` are **not** silently dropped: they're listed under "Skipped", with the SKU and the reason.
4. The low-stock rows are sorted by **shortfall** (`reorder_level - count`), largest first, then by SKU.
5. Each row shows the SKU, the name, the count, the reorder level and the shortfall.
6. If no item is low, it prints `No low-stock items.` and exits with code 0.
7. `node scripts/check.mjs` passes, with a test for each criterion above.

## How we'll verify
- `node scripts/check.mjs` prints PASS.
- `node scripts/low-stock.mjs` on today's `data/inventory.json` lists STOVE-1B, TENT-2P, AXE-HAND, BAG-20F and LANTERN-LED (in that order: the last two tie at a shortfall of 0, so SKU decides), and skips PAD-FOAM (no reorder level) and FILTER-H2O (count isn't a number).
- A second opinion (Codex, read-only) reviews the change before the pull request; each finding is accepted, accepted in part or declined, with a reason, in the pull request.

## Restore point
Tag `before-low-stock` on `main` before the agent starts.

## Threat model (one page)
- **What we're building:** a read-only report over a file another system produces.
- **Where data crosses a trust boundary:** the export file comes from the warehouse system, not from us, so its fields can be missing or the wrong type.
- **What could go wrong:** a bad row crashes the report, or is silently dropped, so a product runs out and nobody saw it coming.
- **Guard:** validate every field and list skipped rows with the reason (criterion 3). **Owner:** the warehouse tools team.
