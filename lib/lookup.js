// One US address in, one house record out.
// Source: Realtor.com's own web endpoints (address suggest + frontdoor GraphQL).
// Polite by construction: every response is cached on disk, and uncached
// requests are spaced at least DELAY_MS apart. One lookup = two requests.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SUGGEST = "https://parser-external.geo.moveaws.com/suggest";
const GRAPHQL = "https://www.realtor.com/frontdoor/graphql";
const DELAY_MS = Number(process.env.HOUSE_LOOKUP_DELAY_MS ?? 1500);
const CACHE_DIR = process.env.HOUSE_LOOKUP_CACHE ?? join(process.cwd(), "cache");
const CACHE_TTL_MS = 24 * 3600 * 1000; // a listing status can change daily

const HOME_QUERY = `query HomeDetails($property_id: ID!) {
  home(property_id: $property_id) {
    property_id href status list_price list_date last_sold_price last_sold_date
    flags { is_pending is_contingent is_new_listing is_foreclosure }
    description { beds baths sqft lot_sqft year_built type stories garage text }
    location { address { line city state_code postal_code coordinate { lat lon } } county { name fips_code } }
    hoa { fee }
    estimates { current_values { estimate source { name } } }
    advertisers { name type office { name } }
    source { id }
    tax_record { apn }
    property_history { date event_name price source_name }
    tax_history { year tax assessment { total land building } }
    photos { href }
  }
}`;

let lastNetworkAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cachedFetch(key, doFetch) {
  const file = join(CACHE_DIR, createHash("sha256").update(key).digest("hex").slice(0, 32) + ".json");
  try {
    const hit = JSON.parse(await readFile(file, "utf8"));
    if (Date.now() - hit.at < CACHE_TTL_MS) return { body: hit.body, cached: true };
  } catch {}
  const wait = lastNetworkAt + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastNetworkAt = Date.now();
  const body = await doFetch();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), key, body }));
  } catch {} // a read-only filesystem just means no cache
  return { body, cached: false };
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}: ${text.slice(0, 120)}`);
  return JSON.parse(text);
}

export async function suggest(address) {
  const url = `${SUGGEST}?${new URLSearchParams({ input: address, client_id: "rdc-home", limit: "5", area_types: "address" })}`;
  const { body } = await cachedFetch("suggest:" + address.toLowerCase().trim(), () => getJson(url));
  return body.autocomplete ?? [];
}

export async function home(propertyId) {
  const { body, cached } = await cachedFetch("home:" + propertyId, () =>
    getJson(GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "rdc-client-name": "RDC_WEB_DETAILS_PAGE", "rdc-client-version": "2.0.0" },
      body: JSON.stringify({ operationName: "HomeDetails", variables: { property_id: propertyId }, query: HOME_QUERY }),
    }),
  );
  if (body.errors?.length) throw new Error("GraphQL: " + body.errors.map((e) => e.message).join("; "));
  return { home: body.data?.home, cached };
}

const STATUS = { for_sale: "for_sale", ready_to_build: "for_sale", sold: "off_market", off_market: "off_market", for_rent: "for_rent", pending: "pending", contingent: "pending" };
const EVENT = (name = "") => {
  const n = name.toLowerCase();
  if (n.includes("sold")) return "sold";
  if (n.includes("price")) return "price_change";
  if (n.includes("removed") || n.includes("expired") || n.includes("withdrawn") || n.includes("delist")) return "delisted";
  if (n.includes("pending") || n.includes("contingent")) return "pending";
  if (n.includes("relist")) return "relisted";
  if (n.includes("rent")) return "rental";
  if (n.includes("list")) return "listed";
  return n.replace(/\s+/g, "_") || null;
};
const money = (n) => (n ? n : null); // 0 means undisclosed (e.g. Texas non-disclosure), never $0
const day = (s) => (s ? String(s).slice(0, 10) : null);

export function normalize(h) {
  const d = h.description ?? {};
  const a = h.location?.address ?? {};
  let status = STATUS[h.status] ?? h.status ?? null;
  if (status === "for_sale" && (h.flags?.is_pending || h.flags?.is_contingent)) status = "pending";
  const forSale = status === "for_sale" || status === "pending";
  const history = (h.property_history ?? []).map((e) => ({ date: day(e.date), event: EVENT(e.event_name), event_raw: e.event_name, price: money(e.price), source: e.source_name ?? null }));
  const lastSold = history.find((e) => e.event === "sold");
  const listDays = forSale && h.list_date ? Math.floor((Date.now() - Date.parse(h.list_date)) / 86400000) : null;
  const est = h.estimates?.current_values ?? [];
  const agent = (h.advertisers ?? []).find((x) => x.type === "seller") ?? null;
  return {
    property: {
      address: { line: a.line ?? null, city: a.city ?? null, state: a.state_code ?? null, zip: a.postal_code ?? null },
      lat: a.coordinate?.lat ?? null,
      lon: a.coordinate?.lon ?? null,
      county: h.location?.county?.name ?? null,
      apn: h.tax_record?.apn ?? null,
      property_type: d.type ?? null,
      beds: d.beds ?? null,
      baths: d.baths ?? null,
      sqft: d.sqft ?? null,
      lot_sqft: d.lot_sqft ?? null,
      year_built: d.year_built ?? null,
      stories: d.stories ?? null,
      garage: d.garage ?? null,
      hoa_monthly: h.hoa?.fee ?? null,
      photos: (h.photos ?? []).map((p) => p.href),
      description: d.text ?? null,
      source_url: h.href ?? null,
    },
    listing: {
      status,
      list_price: forSale ? h.list_price ?? null : null,
      last_list_price: forSale ? null : h.list_price ?? null,
      list_date: day(h.list_date),
      days_on_market: listDays,
      // The public record (deed) wins; the MLS "Sold" event can differ from it,
      // and both are kept: the MLS one stays in price_history.
      last_sold_price: money(h.last_sold_price) ?? lastSold?.price ?? null,
      last_sold_date: day(h.last_sold_date) ?? lastSold?.date ?? null,
      estimate: est.length ? Math.round(est.reduce((s, e) => s + e.estimate, 0) / est.length) : null,
      estimate_sources: est.map((e) => ({ source: e.source?.name ?? null, estimate: e.estimate })),
      agent: forSale ? agent?.name ?? null : null,
      brokerage: forSale ? agent?.office?.name ?? null : null,
    },
    price_history: history,
    tax_history: (h.tax_history ?? []).map((t) => ({ year: t.year, tax_paid: t.tax ?? null, assessed_total: t.assessment?.total ?? null, assessed_land: t.assessment?.land ?? null, assessed_improvements: t.assessment?.building ?? null })),
  };
}

export async function lookup(address) {
  const hits = await suggest(address);
  if (!hits.length) return { query: address, found: false, error: "No US address matched." };
  // The suggester returns its nearest guess even when the street is wrong
  // (W 37th Ave came back as E Warren Ave). Require the house number and the
  // first street-name word to agree before trusting a hit.
  const want = address.toLowerCase().match(/^\s*(\d+[a-z]?)\s+(?:[nsew]\.?\s+|north\s+|south\s+|east\s+|west\s+)?([a-z0-9]+)/);
  const ok = (hit) => {
    if (!want) return true;
    const got = (hit.line ?? "").toLowerCase().match(/^\s*(\d+[a-z]?)\s+(?:[nsew]\s+)?([a-z0-9]+)/);
    return got && got[1] === want[1] && got[2] === want[2];
  };
  const best = hits.find(ok);
  if (!best) return { query: address, found: false, error: "No exact match for that street address.", did_you_mean: hits.map((h) => h.full_address?.[0]).filter(Boolean) };
  const { home: h, cached } = await home(best.mpr_id);
  if (!h) return { query: address, found: false, error: "Address matched but no property record came back.", matched: best.full_address?.[0] };
  return { query: address, found: true, matched: best.full_address?.[0] ?? null, property_id: best.mpr_id, cached, fetched_at: new Date().toISOString(), ...normalize(h) };
}

const $ = (n) => (n == null ? "undisclosed" : "$" + Math.round(n).toLocaleString("en-US"));
export function summary(r) {
  if (!r.found) return `${r.query}: ${r.error}` + (r.did_you_mean?.length ? `\nDid you mean: ${r.did_you_mean.join(" | ")}` : "");
  const p = r.property, l = r.listing;
  const lines = [];
  lines.push(`${p.address.line}, ${p.address.city}, ${p.address.state} ${p.address.zip}`);
  const statusLine = { for_sale: `FOR SALE at ${$(l.list_price)}` + (l.days_on_market != null ? `, listed ${l.list_date} (${l.days_on_market} days)` : ""), pending: `PENDING at ${$(l.list_price)}`, off_market: "OFF MARKET", for_rent: "FOR RENT" }[l.status] ?? String(l.status).toUpperCase();
  lines.push(statusLine + (l.agent ? ` — ${l.agent}, ${l.brokerage}` : ""));
  lines.push(`Last sold ${$(l.last_sold_price)} on ${l.last_sold_date ?? "—"} · estimate ${l.estimate == null ? "none published" : $(l.estimate)}${l.estimate_sources.length ? ` (avg of ${l.estimate_sources.length})` : ""}`);
  lines.push(`${p.beds ?? "—"} bd · ${p.baths ?? "—"} ba · ${p.sqft?.toLocaleString() ?? "—"} sqft · lot ${p.lot_sqft?.toLocaleString() ?? "—"} sqft · built ${p.year_built ?? "—"} · ${p.property_type ?? "—"}`);
  const t = r.tax_history[0];
  if (t) lines.push(`Tax ${t.year}: ${$(t.tax_paid)} paid · assessed ${$(t.assessed_total)}`);
  if (r.price_history.length) {
    lines.push("Price history:");
    for (const e of r.price_history.slice(0, 8)) lines.push(`  ${e.date}  ${(e.event_raw ?? "").padEnd(16)} ${$(e.price)}`);
    if (r.price_history.length > 8) lines.push(`  … ${r.price_history.length - 8} more`);
  }
  lines.push(`${p.photos.length} photos · ${p.source_url ?? ""}`);
  return lines.join("\n");
}
