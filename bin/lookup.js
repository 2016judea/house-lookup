#!/usr/bin/env node
// Usage: lookup "<address>" [--json]
import { lookup, summary } from "../lib/lookup.js";

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const address = args.filter((a) => a !== "--json").join(" ").trim();
if (!address) {
  console.error('usage: lookup "<US street address>" [--json]');
  process.exit(2);
}
try {
  const r = await lookup(address);
  if (!jsonOnly) console.log(summary(r) + "\n");
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.found ? 0 : 1);
} catch (e) {
  console.error("lookup failed:", e.message);
  process.exit(1);
}
