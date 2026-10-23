# Historical review panels

The **Data view** picker defaults to **All assets**, spanning every current bucket with each current record appearing once. Enable **Include historical reviews** to append every retained Powerhouse review observation, or select a single historical panel to show only that panel. Historical rows show their round, rubric and observation status. Frozen review boards, focal boards where retained, and identity-bound fixed views remain available. Commercial use still defaults to FREE; select **All licenses** explicitly to inspect restricted history.

Examples:

- Current assets: `http://127.0.0.1:4175/`
- Current assets plus historical observations: `http://127.0.0.1:4175/?includeHistory=1&license=all`
- Round 10: `http://127.0.0.1:4175/?reviewRound=round-10&license=all`
- Round 11: `http://127.0.0.1:4175/?reviewRound=round-11&license=all`
- API: `/api/results?reviewRound=round-11`
- Global history API: `/api/results?includeHistory=1`

The default `/api/results` shape remains schema version 1 and retains its existing current records. An additive `reviewHistory` descriptor lists available panels and identifies the selected round or `includeHistory: true`. An explicit round request returns only historical observations; `includeHistory=1` returns current records plus all retained observations under their distinct observation IDs. The two options are mutually exclusive. Unknown rounds yield an empty dataset with a diagnostic; malformed or repeated `reviewRound` / `includeHistory` parameters receive HTTP 400. Unrelated legacy query arguments retain their existing behavior. Round 5 has no retained `quality.json`, so the reader does not manufacture observations for it.

## Meaning of an observation

`review-history/round-N/<encoded original asset ID>` is an observation ID, not a new asset. Its `parentId` and `history.originalAssetId` identify the original model. The reader joins retained `quality.json` and `map.json` entries by **both ID and blind code**, checks their schema, rubric and reference hash, and checks a retained manifest when present. Invalid or ambiguous observations are quarantined; unrelated panels remain usable.

Means, ranges, criteria and reviewer counts are read without regrading or pooling panels. Tiny arithmetic roundoff is retained. Each quality metric keeps its round, quality-file/map hashes, rubric and reference as its evaluation context. Mixed review scopes have no numerical quality ranking: table sorting falls back to an unranked name order, and quality charts require one compatible scope. The plot scope never removes table rows; cross-scope cards withhold numerical deltas. Model votes remain unvalidated estimates. An exact-binary human assessment can withhold their displayed quality and ratios while preserving raw votes and showing a human ceiling only as an upper bound. Reviewer spread is disagreement, not a confidence interval or calibrated human rating.

No generation time, component time, tokens or cost is copied from the current record. `qualityPerSec` stays missing. Criteria become additive metric columns/axes with their own rubric scopes. No historical grade or source file is overwritten by this reader.

## Binary, image and license identity

Archived bytes, geometry counts, fixed views and animation metadata require the map's reviewed GLB SHA256 to match the original current record's GLB SHA256, plus a consistent manifest when one exists. Without that binding, the score and frozen board evidence remain readable, but size metrics, qualityPerMB, current asset metadata and the viewer are withheld.

A missing local GLB does not erase identity-bound archived bytes or qualityPerMB. A present GLB is fully hashed on the historical API request; size or timestamp equality alone is insufficient to enable its viewer. Global history requests share hash promises within that request so a binary reused across rounds is read once, with no persistent size/timestamp cache. Historical viewer URLs also contain `reviewSHA256`. The server hashes and serves the **same byte buffer** for that request and returns HTTP 409 if a file changed after the API response. The original unguarded asset URLs keep their existing behavior. A conflicting archived byte count on an otherwise hash-matched local binary is withheld instead of silently replaced.

Frozen review/focal board hashes and manifest fixed-image hashes are checked where retained. A mismatched image is disabled. Earlier identity maps did not retain board hashes; their boards remain labeled historical evidence with that explicit limitation, rather than receiving invented historical checksums. Boards work without local GLBs.

Historical observations inherit the same binary's **current resolved license policy**, including upstream restrictions and revocations. Historical FREE strings are ignored. Missing or ambiguous ancestry fails closed to Restricted License / unverified. The reader does not change the license registry or any experiment record.

## Running and checking

Run `bun run results` as before. The server bundles the UI once at startup and rereads data for each request. Refreshing discovers new data, but code changes require restarting that server or starting a separate instance with `bun tools/results/serve.ts --port=0`. Do not stop unrelated processes to make a test port available.

Focused tests: `bun test tools/results/review-history.test.ts`. The tests cover explicit selection and default compatibility, retained grades and contexts, current license restrictions, missing and same-length wrong GLBs, delivery-time hash checks, frozen board damage, malformed sources, ambiguous joins, arithmetic roundoff, input immutability, and API/UI wiring. The complete results suite remains `bun test tools/results`.

Local validation of this change found 475 current records with no historical duplicates, plus 140 retained historical observations in 10 panels. Per-round counts were 13, 13, 25, 8, 16, 24, 5, 8, 20 and 8 for rounds 1, 2, 3, 4, 6, 7, 8, 9, 10 and 11. All 140 retained scores, same-binary bindings and board sets loaded without import issues. All 180 checked review/current-record JSON input hashes stayed unchanged. These are reader checks, not a new quality or generation-throughput result.

The complete results suite passed 41 tests and 295 assertions. After the final client guard for quality-only charts with a missing unused X metric, the focused history/API suite passed all 6 tests and 89 assertions. A live separate server and browser check confirmed round 11's 8 observations, round 10's 20 observations, historical labels, retained boards/fixed views, current Restricted labels and absent generation-time ratios. Existing port 4175 was left untouched; it needs its normal owner-managed restart to use changed code.
