# house-lookup

**Live:** https://house-lookup.vercel.app

Type any US home address and get back whether it's for sale, what it's listed
at, what it last sold for, every listing and price change on record, its taxes
and assessed value by year, its facts (beds, baths, square feet, lot, year
built) and its photos.

## Use it

```bash
node bin/lookup.js "9706 Woodshire Dr, Austin, TX"          # summary + JSON
node bin/lookup.js --json "2104 Irving Ave S, Minneapolis, MN"
npm test
node scripts/serve.mjs                                       # the web page at localhost:4180
```

Example output for four houses (TX for sale, MN/CO off market, WA condo) is in
`examples/`.

## How it works

One lookup makes two requests to the endpoints Realtor.com's own site uses:

1. `parser-external.geo.moveaws.com/suggest`: address → property id. The
   suggester returns its closest guess even when the street is wrong, so a hit
   has to match the house number and street name. If it doesn't, you get "did
   you mean" instead of the wrong house.
2. `www.realtor.com/frontdoor/graphql`, `home(property_id)`: everything else.

Every response is cached on disk for 24 hours (`cache/`; `/tmp` on Vercel),
and uncached requests are spaced 1.5 s apart (`HOUSE_LOOKUP_DELAY_MS`). It
looks up one address at a time and doesn't crawl.

Field-by-field coverage against the ideal model is in `DATA_MODEL.md`. The one
field it can't fill is the parcel number. Why Realtor.com and not Zillow or
Redfin is in `REA-NOTES.md`.

These are undocumented endpoints, so they can change without notice. If a
lookup starts failing, re-check the query in `lib/lookup.js` against the live
site.

## Deploy

`VERCEL_TOKEN=… python3 scripts/deploy.py` (REST API, no CLI).

MIT.
