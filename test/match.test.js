import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Everything below reads a seeded cache; a cache miss would try the network, so fetch is a trap.
const CACHE = await mkdtemp(join(tmpdir(), "house-lookup-test-"));
process.env.HOUSE_LOOKUP_CACHE = CACHE;
globalThis.fetch = async (url) => { throw new Error("test tried the network: " + url); };
const { addressKey, sameHouse, lookup } = await import("../lib/lookup.js");

// Two real suggester hits for one query (cache/ on 2026-10-11): the same building, two units,
// and the second one spelled without the "E" directional.
const SEATTLE = [
  { mpr_id: "1050223796", line: "7850 E Green Lake Dr N Apt 301", full_address: ["7850 E Green Lake Dr N Apt 301 Seattle WA 98103"] },
  { mpr_id: "2820482567", line: "7850 Green Lake Dr N Unit 101", full_address: ["7850 Green Lake Dr N Unit 101 Seattle WA 98103"] },
];

test("addressKey reads number, street and unit the same way from a typed query and a suggester line", () => {
  assert.deepEqual(addressKey("7850 E Green Lake Dr N Unit 101, Seattle, WA 98103-1234"), { number: "7850", street: "green", unit: "101" });
  assert.deepEqual(addressKey("7850 Green Lake Dr N Apt 101"), { number: "7850", street: "green", unit: "101" });
  assert.deepEqual(addressKey("500 E Grant St #1204"), { number: "500", street: "grant", unit: "1204" });
  assert.deepEqual(addressKey("Unit 3, 1830 Girard Ave S"), { number: "1830", street: "girard", unit: "3" });
  assert.deepEqual(addressKey("100 N. Main St"), { number: "100", street: "main", unit: null });
  assert.deepEqual(addressKey("1234 Northwest 23rd Ave, Portland, OR"), { number: "1234", street: "23rd", unit: null });
  assert.deepEqual(addressKey("Irving Ave S, Minneapolis MN 55405"), { number: null, street: "irving", unit: null }, "a ZIP is never a house number");
});

test("a query that names a unit must land on that unit, not the building's first listed unit", () => {
  const q = "7850 E Green Lake Dr N Unit 101, Seattle, WA";
  assert.equal(sameHouse(q, SEATTLE[0].line), false, "Apt 301 is not Unit 101");
  assert.equal(sameHouse(q, SEATTLE[1].line), true);
  assert.equal(SEATTLE.find((h) => sameHouse(q, h.line)).mpr_id, "2820482567");
});

test("directionals fold: N. / North / Northwest match N / N / NW", () => {
  assert.equal(sameHouse("100 N. Main St", "100 N Main St"), true);
  assert.equal(sameHouse("100 North Main St", "100 N Main St"), true);
  assert.equal(sameHouse("1234 Northwest 23rd Ave, Portland, OR 97210", "1234 NW 23rd Ave"), true);
  assert.equal(sameHouse("7850 E Green Lake Dr N", "7850 Green Lake Dr N"), true, "a dropped directional is the same street");
});

test("ZIP+4 and trailing city/state never take part in the match", () => {
  assert.equal(sameHouse("2104 Irving Ave S, Minneapolis, MN 55405-1234", "2104 Irving Ave S"), true);
});

test("the wrong street is still refused (the did-you-mean case), and a query with no number trusts the suggester", () => {
  assert.equal(sameHouse("3301 W 37th Ave, Denver, CO", "3301 E Warren Ave"), false);
  assert.equal(sameHouse("3301 E Warren Ave, Denver, CO", "3301 W Warren Ave"), true);
  assert.equal(sameHouse("Irving Ave S, Minneapolis", "2104 Irving Ave S"), true);
  assert.equal(sameHouse("500 E Grant St, Minneapolis", "500 E Grant St Apt 1204"), true, "no unit asked for: any unit is fine");
});

test("lookup() end to end from a seeded cache picks the asked-for unit", async () => {
  const file = (key) => join(CACHE, createHash("sha256").update(key).digest("hex").slice(0, 32) + ".json");
  const q = "7850 E Green Lake Dr N Unit 101, Seattle, WA";
  await writeFile(file("suggest:" + q.toLowerCase()), JSON.stringify({ at: Date.now(), body: { autocomplete: SEATTLE } }));
  const home = { property_id: "2820482567", status: "off_market", description: { beds: 1 }, location: { address: { line: "7850 Green Lake Dr N Unit 101", city: "Seattle", state_code: "WA", postal_code: "98103" } } };
  await writeFile(file("home:2820482567"), JSON.stringify({ at: Date.now(), body: { data: { home } } }));
  const r = await lookup(q);
  assert.equal(r.found, true);
  assert.equal(r.property_id, "2820482567");
  assert.equal(r.property.address.line, "7850 Green Lake Dr N Unit 101");
  await writeFile(file("suggest:" + q.replace("Unit 101", "Unit 999").toLowerCase()), JSON.stringify({ at: Date.now(), body: { autocomplete: SEATTLE } }));
  const miss2 = await lookup(q.replace("Unit 101", "Unit 999")).catch((e) => ({ found: false, error: e.message }));
  assert.equal(miss2.found, false);
  assert.deepEqual(miss2.did_you_mean, SEATTLE.map((h) => h.full_address[0]));
});
