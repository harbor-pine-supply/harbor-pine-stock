import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { lowStockReport, formatReport } from "../src/low-stock.js";

const script = fileURLToPath(new URL("../scripts/low-stock.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const file = (items) => { const p = join(mkdtempSync(join(tmpdir(), "low-")), "inventory.json"); writeFileSync(p, JSON.stringify(items)); return p; };
const item = (sku, count, reorder_level, name = `${sku} name`) => ({ sku, name, count, reorder_level });
const skus = (rows) => rows.map((r) => r.sku);

// Criterion 1
test("lists an item whose count is below its reorder level", () => {
  const { low } = lowStockReport([item("A", 1, 3)]);
  assert.deepEqual(low, [{ sku: "A", name: "A name", count: 1, reorder_level: 3, shortfall: 2 }]);
});

test("does not list an item above its reorder level", () => {
  assert.deepEqual(lowStockReport([item("A", 4, 3)]).low, []);
});

// Criterion 2
test("lists an item whose count is exactly at its reorder level", () => {
  const { low } = lowStockReport([item("A", 5, 5)]);
  assert.deepEqual(low, [{ sku: "A", name: "A name", count: 5, reorder_level: 5, shortfall: 0 }]);
});

// Criterion 3
test("skips rows with bad count or reorder_level, with SKU and reason", () => {
  const { low, skipped } = lowStockReport([
    { sku: "NOLEVEL", name: "x", count: 1 },
    item("STRING", "4", 5),
    item("FRACTION", 2.5, 5),
    item("NEGCOUNT", -1, 5),
    item("NEGLEVEL", 1, -2),
    item("BOTH", null, "x"),
  ]);
  assert.deepEqual(low, []);
  assert.deepEqual(skipped, [
    { sku: "BOTH", reason: 'count is missing; reorder_level is not an integer ("x")' },
    { sku: "FRACTION", reason: "count is not an integer (2.5)" },
    { sku: "NEGCOUNT", reason: "count is negative (-1)" },
    { sku: "NEGLEVEL", reason: "reorder_level is negative (-2)" },
    { sku: "NOLEVEL", reason: "reorder_level is missing" },
    { sku: "STRING", reason: 'count is not an integer ("4")' },
  ]);
});

test("skips rows that aren't objects or have no SKU instead of crashing", () => {
  const { skipped } = lowStockReport([null, { name: "no sku", count: 0, reorder_level: 1 }]);
  assert.deepEqual(skipped, [
    { sku: "(row 1)", reason: "row is not an object" },
    { sku: "(row 2)", reason: "sku is missing" },
  ]);
});

test("prints skipped rows under a Skipped heading", () => {
  const out = formatReport(lowStockReport([{ sku: "PAD", name: "Pad", count: 9 }]));
  assert.match(out, /^Skipped:$/m);
  assert.match(out, /^PAD\s+reorder_level is missing$/m);
});

// Criterion 4
test("sorts by shortfall, largest first, then by SKU", () => {
  const { low } = lowStockReport([item("C", 2, 2), item("B", 0, 1), item("A", 2, 2), item("D", 0, 4), item("E", 9, 1)]);
  assert.deepEqual(skus(low), ["D", "B", "A", "C"]);
});

// Criterion 5
test("each row shows SKU, name, count, reorder level and shortfall", () => {
  const out = formatReport(lowStockReport([item("TENT-2P", 3, 5, "Ridgeline 2-person tent")]));
  assert.match(out, /^SKU\s+Name\s+Count\s+Reorder level\s+Shortfall$/m);
  assert.match(out, /^TENT-2P\s+Ridgeline 2-person tent\s+3\s+5\s+2$/m);
});

test("a low item with a missing, blank or non-text name stays listed, with the name flagged", () => {
  const { low, skipped } = lowStockReport([
    { sku: "A", count: 0, reorder_level: 1 },
    item("B", 0, 1, "   "),
    item("C", 0, 1, 42),
  ]);
  assert.deepEqual(skipped, []);
  assert.deepEqual(low.map((r) => [r.sku, r.name]), [
    ["A", "(name missing)"],
    ["B", "(name missing)"],
    ["C", "(name is not text: 42)"],
  ]);
  assert.match(formatReport({ low, skipped }), /^A\s+\(name missing\)\s+0\s+1\s+1$/m);
});

// Criterion 6
test("prints 'No low-stock items.' when nothing is low", () => {
  assert.equal(formatReport(lowStockReport([item("A", 10, 2)])), "No low-stock items.");
});

test("the command prints 'No low-stock items.' and exits 0 when nothing is low", () => {
  const r = run(file([item("A", 10, 2)]));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "No low-stock items.");
});

test("the command exits 1 when the file can't be loaded", () => {
  const p = join(mkdtempSync(join(tmpdir(), "low-")), "bad.json");
  writeFileSync(p, '{"not":"an array"}');
  assert.equal(run(p).status, 1);
});

// The work package's verification step, on today's export (read only).
test("today's data: lists the expected SKUs in order and skips the bad rows", () => {
  const r = run();
  assert.equal(r.status, 0);
  const [lowPart, skippedPart] = r.stdout.split("Skipped:");
  const listed = lowPart.split("\n").slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean);
  assert.deepEqual(listed, ["STOVE-1B", "TENT-2P", "AXE-HAND", "BAG-20F", "LANTERN-LED"]);
  assert.match(skippedPart, /^FILTER-H2O\s+count is not an integer \("4"\)$/m);
  assert.match(skippedPart, /^PAD-FOAM\s+reorder_level is missing$/m);
});
