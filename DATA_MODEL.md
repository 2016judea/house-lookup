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

## Reality check (filled in after probing — see bottom of README)

Pending: written after the endpoint probe, field by field.
