// Low-stock report over the inventory export. Pure functions, no I/O.
// The export comes from another system, so every field is validated; a row that
// can't be checked is reported under "Skipped" with the reason, never dropped.

const isCount = (v) => Number.isInteger(v) && v >= 0;

/** Why a count/reorder_level value is unusable, or null if it's fine. */
function problem(field, v) {
  if (v === undefined || v === null) return `${field} is missing`;
  if (typeof v !== "number" || !Number.isInteger(v)) return `${field} is not an integer (${JSON.stringify(v)})`;
  if (v < 0) return `${field} is negative (${v})`;
  return null;
}

// A bad name is flagged in the row, not skipped: skipping would hide a product that
// needs reordering, which is the risk the work package's threat model guards against.
function displayName(v) {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return "(name missing)";
  if (typeof v !== "string") return `(name is not text: ${JSON.stringify(v)})`;
  return v;
}

const bySku =(a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);

/**
 * Build the report. Returns { low, skipped }:
 * - low: [{ sku, name, count, reorder_level, shortfall }] for items with count <= reorder_level,
 *   sorted by shortfall (largest first), then SKU.
 * - skipped: [{ sku, reason }] for rows whose fields can't be checked.
 */
export function lowStockReport(items) {
  const low = [];
  const skipped = [];
  items.forEach((item, i) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      skipped.push({ sku: `(row ${i + 1})`, reason: "row is not an object" });
      return;
    }
    const sku = typeof item.sku === "string" && item.sku.trim() !== "" ? item.sku : null;
    const reasons = [];
    if (sku === null) reasons.push("sku is missing");
    for (const field of ["count", "reorder_level"]) {
      const p = problem(field, item[field]);
      if (p) reasons.push(p);
    }
    if (reasons.length) {
      skipped.push({ sku: sku ?? `(row ${i + 1})`, reason: reasons.join("; ") });
      return;
    }
    const { count, reorder_level } = item;
    if (isCount(count) && isCount(reorder_level) && count <= reorder_level) {
      low.push({ sku, name: displayName(item.name), count, reorder_level, shortfall: reorder_level - count });
    }
  });
  low.sort((a, b) => b.shortfall - a.shortfall || bySku(a, b));
  skipped.sort(bySku);
  return { low, skipped };
}

/** Render rows as left-aligned text columns under a header. */
function table(header, rows) {
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
  return [header, ...rows].map((r) => r.map((cell, c) => cell.padEnd(widths[c])).join("  ").trimEnd());
}

/** Turn a report into the text the command prints. */
export function formatReport({ low, skipped }) {
  const lines = [];
  if (low.length === 0) lines.push("No low-stock items.");
  else {
    lines.push("Low stock:");
    lines.push(...table(
      ["SKU", "Name", "Count", "Reorder level", "Shortfall"],
      low.map((r) => [r.sku, r.name, String(r.count), String(r.reorder_level), String(r.shortfall)]),
    ));
  }
  if (skipped.length) {
    lines.push("", "Skipped:");
    lines.push(...table(["SKU", "Reason"], skipped.map((s) => [s.sku, s.reason])));
  }
  return lines.join("\n");
}
