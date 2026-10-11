# What REA contributed

REA = `rea-agents` 6.4.0 from npm (`npm i -g rea-agents`), 2026-10-11.

**Short version: REA didn't find the endpoint. Three curl probes did.** What REA
did was show, with evidence, that driving any of these sites from a browser
is a dead end, and that saved me from building a scraper on top of one.

## What I ran

`rea capture-browser-scenario` (headless Playwright, network events, request
and response bodies). Inputs are in `rea/*.json`.

| site | what REA's capture showed |
|---|---|
| Redfin | The first navigation redirected to `ratelimited.redfin.com`. Curl gets a CloudFront 403 on `/stingray/*` too. Dead. |
| Zillow | Every page loaded PerimeterX (`px-cloud.net` collector, `captcha.js`). That happened in REA's own Chromium and also in real Chrome `--headless=new` through REA's `connect` mode. |
| Realtor.com | Kasada's `/tl` challenge POST, with no listing XHRs. |

`rea analyze-javascript-application` on Zillow's downloaded Next.js chunks
found 702 findings and 0 network endpoints, because the analyser is built for
Electron (IPC, preload, native add-ons). A plain `grep /graphql/` found Zillow's
route in seconds. Zillow's GraphQL is behind PerimeterX for non-browser
clients anyway.

## What actually found the endpoint

Plain HTTP probing, from knowing where these sites usually keep their data:

- Zillow serves full `__NEXT_DATA__` HTML to curl, but that server-rendered
  data is thin: no event types in the price history, no tax history.
- Realtor.com's page is Kasada-walled, but two of the hosts behind it answer a
  plain request: `parser-external.geo.moveaws.com/suggest` (address → id) and
  `www.realtor.com/frontdoor/graphql` (id → the whole house). The GraphQL
  error messages name the missing fields ("Cannot query field … Did you
  mean …"), so the schema can be worked out without introspection.

## REA versus devtools/HAR

A human with devtools open in a real, logged-out Chrome would have seen the
`frontdoor/graphql` call on the first page load, because a human passes Kasada.
That's the honest comparison. REA's browser is the automated kind, so it got
challenged on every site. REA is useful for documenting what an app does when
the app lets it in. It can't get past a bot wall, and the sites that hold
listing data all have one.

## Quirks worth knowing

- With no `timeout_ms` on a step, a `fill` whose selector never appears hangs
  the run forever. Always set `timeout_ms`.
- A failed step cancels the rest, and the evidence is still written (`status:
  incomplete`). That's useful.
- `capture-browser-scenario --schema` prints only `{inputJson: string}`. The
  real schema is in `dist/domain/browserScenarioValues.js`.
- `doctor` reports `healthy: false` when Hopper, Ghidra and IDA are missing,
  even though browser capture needs none of them.
