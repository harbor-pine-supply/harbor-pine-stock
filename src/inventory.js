// Loads the warehouse inventory export (data/inventory.json): an array of
// { sku, name, count, reorder_level }. The export comes from another system, so
// callers must not assume every field is present or well formed.
import { readFileSync } from "node:fs";

/** Read and parse an inventory file. Throws if the file isn't a JSON array. */
export function loadInventory(path) {
  const items = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(items)) throw new Error(`${path}: expected a JSON array of items`);
  return items;
}
