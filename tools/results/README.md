# Asset Observatory

Run `bun run results`, then open the printed loopback URL (default `http://127.0.0.1:4175/`). Use `bun run results --port=4176` to choose another port. The command bundles the local viewer and UI, serves read-only workspace artifacts and reads retained evidence when **Refresh from disk** is clicked. No external CDN or viewer service is used. `bun run results --snapshot` writes a normalized JSON snapshot without starting a server.

The viewer source is standalone. Install the root package's Bun dependencies (`three` and `meshoptimizer`); no skill checkout, sibling repository, model runtime or experiment output is needed to build it. Local `results/` and `experiments/` data is optional and ignored by Git. An empty checkout starts with an empty dataset. Restore local artifacts to browse them; unavailable GLBs and PNGs remain unavailable rather than receiving invented measurements.

`results/license-audit.json` is optional runtime policy data. Without it, unknown and otherwise recognizable routes remain **Restricted License / unverified**. The browser does not bundle an experimental license inventory. Existing local policy is read explicitly by the registry and applies to current and historical observations.

The one shared viewer utility is retained locally in `viewer-runtime.ts` under the upstream project's MIT license. Original `glb-creator/scripts/review-viewer.ts` SHA256: `a12a18243667e59452e8bf759207809552a8f3095907e4b9fd2a7ce67439d722`. It depends only on Three.js and Meshoptimizer; the framing adapter and GLB-first/PNG-fallback behavior remain local to this dashboard.

The explorer can read locally retained authoring, replay, geometry, material-review, delivery and skinning records. These experiment outputs are not committed. Cohorts and timing/rubric scopes stay separate; available local reports remain linked and are never rewritten by the dashboard.

**Data view → All assets** is the default: the table spans every current bucket, with no automatically selected cohort. **All assets · every bucket** clears narrowing filters and returns to current assets while preserving the chosen commercial-use filter. The overview shows current records visible versus the total across all buckets. Choose **All licenses · include restricted** to include restricted results; FREE remains the default.

Use **Include historical reviews** to add all frozen Powerhouse review observations explicitly, or select a single panel in **Data view**. Toggling history preserves the current selection, filters and unchanged viewer or PNG choice; it does not jump to the first sorted row. Past grades remain separate observations, clearly labeled with their round and rubric, so the same model can appear in several rounds when history is enabled. Their boards remain accessible without local GLBs. History verifies local binary hashes on each request; the server uses a bounded120-second idle timeout so large retained inventories can finish that verification. See [historical review panels](HISTORY.md) for URLs, binary/image identity checks, current license inheritance and missing-metric rules.

Browse or search the table first, then compare the tradeoff chart and inspect the selected model below it. **Plot comparison scope** affects only the chart. Every matching asset remains in the table. Quality sorting across mixed scopes falls back to an unranked name order. Numerical quality ranking, deltas and frontiers require matching cohorts, units, scopes and evaluation contexts.

The graph defaults to an **unranked overview across reviews**. Select one compatible scope for the union of **top 15 score estimates** and **top 15 score estimates per MB**, up to 30 distinct assets. The reader refuses a global numerical shortlist across different rubrics or review contexts. Missing size/ratio is never zero and does not remove an otherwise compatible score leader. **All distinct assets** supports custom or unscored measurements, while quality comparisons remain guarded.

Graph duplicates use the exact reviewed/exported GLB SHA, with record ID as the fallback when that hash is unavailable. Current observations take precedence over historical ones; historical-only duplicates use the latest numbered round, with stable IDs resolving other ties. The dashboard never chooses the highest old score to inflate a duplicate. Different binary variants remain separate despite a shared parent/name/source geometry. All table/history/export observations remain intact.

The overview has no cross-review quality ranking, pooled Pareto frontier, deltas or averages. Chart mode changes preserve an explicit scope when its compatible successor is unique. Distributions and incompatible units require a compatible scope.

Powerhouse static votes are **unvalidated model estimates**, not calibrated human scores. An 8/10 vote never automatically establishes accepted quality or candidate eligibility. `material-all15` and `material-primary8` reviews are prominently marked **MATERIAL ONLY**; their scores do not rate complete assets.

Optional schema-1 `results/quality-assessments.json` contains an `assessments` array. A `human-upper-bound` entry binds exact `assetSHA256s`, `rubric` and `referenceSHA256`, records a finite `ceiling` in 0–10, `source`, `feedback` and the outcome `rejected-for-candidate-consideration`. The additive runtime overlay is applied after current/history records are constructed. Historical matching uses the frozen expected GLB hash; there is no name matching or inheritance to new binaries. Matched raw scores remain in `modelQuality`, `modelQualityMin` and `modelQualityMax`. Ordinary quality/ranges and derived ratios become null with a human-rejection reason. `humanQualityCeiling` is an explicit upper bound (`≤7`, for example), never an exact score, plot point or ratio numerator. `qualityAssessment` retains the original status, feedback, source, raw model score and `candidateEligible: false`. Disk records, ballots and old reviews are unchanged. CSV/JSON exports preserve these distinctions.

The selected GLB loads automatically inside its panel. Missing or failed GLBs fall back to a retained PNG with an error message and an explicit retry. Use **PNG preview** to switch formats, **GLB preview** to return, or click an animation by name. **Animated** filters the current bucket, while **View all animated assets** clears narrowing filters and returns to current assets. Advanced filters, metric axes, provenance and older reports are collapsed until needed.

The commercial-use filter defaults to **FREE**, including old bookmarks that have no license parameter. Restricted License results require choosing **All licenses** or **Restricted License** explicitly; the choice is retained in the URL. Changing back to FREE clears restricted selected models and comparisons. Clear filters restores FREE. Labels appear in the model table, selected view, comparisons, chart tooltips and CSV/JSON exports. The selected model's license disclosure links the primary evidence and required notices.

FREE identifies an audited execution route without commercial-use, geographic, revenue or paid-license gates. It does not waive attribution or certify ownership of caller-supplied references. Unknown routes fail closed as Restricted License; descendants inherit restrictive upstream provenance. The server reads an optional local `results/license-audit.json` and passes its policy explicitly to `license.ts`; the browser displays the resulting assessment independently of quality scores.

The inline viewer preserves playback, scrub position and an explicit PNG choice when a chart or sort changes. It makes one automatic GLB attempt per selection; failed attempts retry only through an explicit GLB or animation choice. Selecting a different model or refreshing from disk disposes the prior renderer and starts a fresh attempt. Four retained PNGs work without local GLBs; missing PNGs show a placeholder. Automatic-optimization records show render retention separately from reference quality and the descriptive paired-review ratio; a rejected default remains visible with its failed status.

The camera adapter fits all eight bounding-box corners against the vertical field of view and actual canvas aspect, with screen margin. One fit after initial reveal accounts for the toolbar and timeline layout. **Fit pose** recomputes current skinned bounds; clip selection, playback, scrubbing and ordinary dashboard rerenders keep the camera frame fixed.

## Adding experiments and metrics

To supply optional local data, use `experiments/<stage>/<case>/experiment.json` (or an array of such records). All paths are relative to the demo root. Experiment JSON, PNGs, GLBs and reports remain local and ignored by Git. Another clone receives no experiment evidence unless it is supplied separately; the UI clearly indicates missing artifacts.

```json
{
  "schemaVersion": 1,
  "id": "stage-2/trellis-normal-detail",
  "name": "TRELLIS + reference normal detail",
  "cohort": "Stage 2 · fixed-surface materials",
  "baseStrategy": "TRELLIS",
  "subStrategy": "Reference detail / master",
  "status": "reviewed",
  "parentId": "material-all15/hybrid-trellis-compact",
  "metrics": {
    "quality": {"value": 8.25, "unit": "points/10", "scope": "stage2-material-rubric-v1", "source": "experiments/stage-2/quality.json", "direction": "higher"},
    "bytes": {"value": 79753396, "unit": "bytes", "direction": "lower"},
    "seconds": {"value": 20, "unit": "s", "scope": "stage2-material-adapter-only", "direction": "lower"},
    "newMetric": {"value": 0.12, "unit": "ratio", "scope": "fixed-camera-contrast-v1", "direction": "higher"}
  },
  "views": [
    {"label": "Reference three-quarter", "path": "experiments/stage-2/case/view-315.png"},
    {"label": "Opposite front quarter", "path": "experiments/stage-2/case/view-045.png"},
    {"label": "Rear quarter", "path": "experiments/stage-2/case/view-135.png"},
    {"label": "Opposite rear quarter", "path": "experiments/stage-2/case/view-225.png"}
  ],
  "artifacts": {"glb": "experiments/stage-2/case/master.glb"},
  "animations": [{"name": "idle", "duration": 2}, {"name": "attack", "duration": 1.2}],
  "notes": ["Times measure this adapter only, not upstream reconstruction or four-worker authoring."],
  "provenance": {"referenceSHA256": "...", "seed": 42}
}
```

The example numbers illustrate schema use, not new measured results. Do not inherit a master's quality score onto a variant without a review. New metric keys are discovered automatically, retained in JSON/CSV and offered as graph axes. Specify units, scope and direction to support useful comparison. Missing, non-finite and invalid values stay missing; numerical strings are not coerced. Unsupported schema versions are quarantined. Additive metric keys do not require a schema version change.

`qualityPerMB = quality / (bytes / 1,000,000)`. `qualityPerSec = quality / seconds`. Quality needs an explicit rubric scope, and seconds needs a positive value and explicit timing boundary. Batch elapsed time paired with mean per-asset quality is deliberately not converted to qualityPerSec. These are descriptive score-density indices, not ratio-scale physical quality, billing savings or accepted-asset throughput.

Optional `assetRole` (`master`, `variant`, `experiment`) distinguishes a preserved master from its historical lineage. Without it, size-budget labels identify variants, master status identifies masters, and ordinary child experiments remain separate. Optional `motionViews` uses the same safe PNG-path schema as `views`, retaining any number of phase sheets without replacing the required four perspectives.

Compatible chart detail groups by cohort, metric scopes, units and independent evaluation context; the default overview is unranked. A shared rubric does not calibrate separate review panels or rounds. Quality uses its recorded review source (`metrics.quality.source`, falling back to `provenance.review.source`) as the context. Quality-based ratios retain that context. Tables and the selected model show the review round; measurement details and exports retain full context/source. Compare deltas and Pareto dominance only apply within compatible groups, including direct Pareto calls. A human-assessment overlay can withhold a score without rewriting its raw source.

Any metric can declare an optional string `evaluationContext` to identify a matched evaluation independently of its rubric or source file. Named `qualityPer…` metrics inherit the quality observation's context unless they explicitly declare one; other point-score metrics can use their own review source. Custom quality ratios with other names should declare `evaluationContext` explicitly. Ordinary bytes/time sources do not create review groups. Legacy observations with no explicit quality review context retain their existing scope/unit compatibility with each other; a known review context is separate from an unrecorded one. The dashboard never invents a context from a record ID or its experiment file.

Tables can show every cohort without silently averaging them. Choose scatter/Pareto, numerical bars or distribution, select custom axes, filter/search, add columns, export the filtered CSV/JSON, compare up to four observations or inspect four fixed PNGs. The local GLB viewer reads every actual animation clip and supports rest, playback and scrubbing. Missing files never prevent the page from displaying the retained evidence.

License filtering defaults to FREE, including old URLs without a license query.
Explicit `license=all` or `license=Restricted%20License` exposes restricted history.
An optional local results/license-audit.json defines reviewed route families;
new experiment provenance must name the actual reviewed licenseAuditFamily.
Unknown routes fail closed, and restricted ancestry survives downstream changes.
Any supporting audit documents are optional local data too. Refresh from disk
to reread data and policy; restart the server after changing its UI source bundle.
