import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../lib/lookup.js";

// Synthetic record shaped like the frontdoor GraphQL `home` reply.
const home = {
  href: "https://example.test/h", status: "for_sale", list_price: 500000, list_date: "2026-10-01T00:00:00Z",
  last_sold_price: 0, last_sold_date: "2020-01-02",
  flags: { is_pending: true },
  description: { beds: 3, baths: 2, sqft: 1500, lot_sqft: 6000, year_built: 1990, type: "single_family" },
  location: { address: { line: "1 Test St", city: "Town", state_code: "TX", postal_code: "70000", coordinate: { lat: 1, lon: 2 } } },
  estimates: { current_values: [{ estimate: 400000, source: { name: "A" } }, { estimate: 600000, source: { name: "B" } }] },
  advertisers: [{ name: "Agent", type: "seller", office: { name: "Office" } }],
  property_history: [{ date: "2026-10-01", event_name: "Price Changed", price: 500000 }, { date: "2020-01-02", event_name: "Sold", price: 0 }],
  tax_history: [{ year: 2025, tax: 9000, assessment: { total: 450000, land: 100000, building: 350000 } }],
  photos: [{ href: "p1" }],
};

test("pending flag overrides for_sale, $0 is undisclosed, estimates average", () => {
  const r = normalize(home);
  assert.equal(r.listing.status, "pending");
  assert.equal(r.listing.list_price, 500000);
  assert.equal(r.listing.last_sold_price, null);
  assert.equal(r.price_history[1].price, null);
  assert.equal(r.price_history[0].event, "price_change");
  assert.equal(r.listing.estimate, 500000);
  assert.equal(r.tax_history[0].assessed_improvements, 350000);
  assert.equal(r.listing.agent, "Agent");
});

test("off-market hides list price and agent", () => {
  const r = normalize({ ...home, status: "sold", flags: {} });
  assert.equal(r.listing.status, "off_market");
  assert.equal(r.listing.list_price, null);
  assert.equal(r.listing.last_list_price, 500000);
  assert.equal(r.listing.agent, null);
});
