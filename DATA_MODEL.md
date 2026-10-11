# Data model — the ideal per-house record

Written 2026-10-11 from the need alone, before looking at what any listing site
returns (`~/.claude/BUSINESS.md` rule 5). The need: type any US residential
address, get back where the house stands on the market and what it is.

## Entities

### Property (one per address)
| field | question it answers |
|---|---|
| `address` (line, city, state, zip) | Is this the house I meant? |
| `lat`, `lon` | Where is it, exactly? |
| `apn` (parcel number) | What does the county call it? |
| `property_type` | Single family, condo, townhouse, multi? |
| `beds`, `baths` | How big is it, in rooms? |
| `sqft` | How big is it, in floor area? |
| `lot_sqft` | How much land comes with it? |
| `year_built` | How old is it? |
| `stories`, `garage`, `hoa_monthly` | What does living there cost / look like? |
| `photos[]` (url) | What does it look like? |
| `description` | What does the seller say about it? |
| `source_url` | Where can I check this? |

### Listing status (current)
| field | question |
|---|---|
| `status` (for_sale, pending, sold, off_market, for_rent) | Can I buy it right now? |
| `list_price` | What are they asking? |
| `list_date`, `days_on_market` | How long has it sat? |
| `last_sold_price`, `last_sold_date` | What did it last trade for? |
| `estimate` (AVM) + `estimate_source` | What's it worth if nobody is selling? |
| `agent`, `brokerage` | Who do I call? |

### Price event (many per property)
| field | question |
|---|---|
| `date` | When? |
| `event` (listed, price_change, pending, sold, delisted, relisted, rental) | What happened? |
| `price` | At what number? |
| `source` (MLS name) | Who reported it? |

Joins: Property 1—1 Listing status; Property 1—N Price event.

### Tax (many per property, one per year)
| field | question |
|---|---|
| `year` | Which assessment? |
| `assessed_value` (land, improvements, total) | What does the county think it's worth? |
| `tax_paid` | What does it cost to hold? |

Joins: Property 1—N Tax.

## Reality check (2026-10-11, after probing)

Source landed on: Realtor.com's address suggester + its `frontdoor/graphql`
`home(property_id)` query. Checked on 4 houses in TX, MN, CO, WA (`examples/`).

| field | fills? | note |
|---|---|---|
| address, lat/lon, county | yes, 4/4 | |
| apn | **no, 0/4** | `tax_record.apn` exists in the schema and came back null every time |
| property_type, beds, baths, sqft, lot_sqft, year_built | yes, 4/4 | |
| stories, garage, hoa_monthly | partial | null when the MLS record never carried them |
| photos | yes, 19–30 per house | full-size via a URL rewrite |
| description | listed homes; off-market keeps the last listing's text | |
| status | yes | `pending` only via `flags.is_pending/is_contingent`; not yet seen live |
| list_price, list_date | yes when for sale | |
| days_on_market | computed from list_date | the API's own field is null |
| last_sold_price, last_sold_date | yes, except non-disclosure states | TX returns 0 → reported as undisclosed, never $0 |
| estimate | 3/4 | three AVMs (Cotality, Quantarium, Collateral Analytics); none published for the MN house |
| agent, brokerage | yes when for sale | |
| price events (date, event, price, MLS source) | yes, 6–23 per house | event names are the source's own ("Listing removed"), mapped to the model's enum |
| tax (year, tax paid, assessed total/land/improvements) | yes, 17–20 years per house | years can be skipped (TX has no 2024 row) |

One field fails outright: **APN**. It is a join key, not something a buyer reads,
so the tool ships without it rather than reshaping around it; filling it would
mean per-county assessor lookups, which is a different product.

The deed price and the MLS "Sold" event disagree on some houses (MN: deed
$705,000 on 2016-11-01, MLS Sold $750,000 on 2016-11-18). Both are kept: the
deed figure is `last_sold_price`, the MLS one stays in `price_history`.
