// Only public/ may be static. 2026-10-19: with outputDirectory "." the functions' own source
// (prompt, paywall, router) was served as plain text at /api/<file>.js (curl, 200).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("only public/ is served, in vercel.json and in the deploy payload", () => {
  assert.equal(JSON.parse(read("vercel.json")).outputDirectory, "public");
  const deploy = read("scripts/deploy.py");
  assert.match(deploy, /"outputDirectory": "public"/);
  assert.doesNotMatch(deploy, /"outputDirectory": "\."/);
  assert.match(deploy, /STATIC = \{"index.html", "example.json"\}/);
});
