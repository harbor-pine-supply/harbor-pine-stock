import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadInventory } from "../src/inventory.js";

const file = (text) => { const p = join(mkdtempSync(join(tmpdir(), "inv-")), "inventory.json"); writeFileSync(p, text); return p; };

test("loads an array of items", () => {
  assert.deepEqual(loadInventory(file('[{"sku":"A","count":1,"reorder_level":2}]')), [{ sku: "A", count: 1, reorder_level: 2 }]);
});

test("rejects a file that isn't an array", () => {
  assert.throws(() => loadInventory(file('{"sku":"A"}')), /expected a JSON array/);
});
