# GLB Results Viewer

A local web viewer for comparing 3D assets, delivery variants and animation clips. Experiment data stays local and is excluded from Git.

```sh
bun install
bun run results
```

Open the printed address, normally [localhost:4175](http://127.0.0.1:4175/). Use `bun run results --port=4176` for another port. The read-only server uses no external viewer service.

The viewer includes:

- All-assets browsing, search, commercial-license filters and historical review panels.
- An inline GLB viewer that loads automatically, with PNG fallback when the local model is absent.
- Animation selection, playback, scrubbing and pose framing.
- Size, timing and custom metrics, including scoped qualityPerMB and qualityPerSec.
- Comparisons and charts that distinguish compatible evaluation contexts.
- Human assessment annotations alongside preserved model-review evidence.

**Quality scores are estimates within a named rubric and review.** Material-only scores do not measure complete assets. Model reviewers are not independent human validation. The user's assessment of Query1024 as **at most 7/10** takes precedence over its inflated model estimates. Frozen ballots remain available as evidence, not accepted quality claims. An upper bound is not an exact rating or a valid numerator for ordinary quality ratios.

## Project layout

| Path | Purpose | In Git |
|---|---|---|
| `tools/results/` | Viewer, data adapters and tests | Yes |
| `experiments/` | Local manifests, models, images and reviews | No |
| `results/` | Local historical data, license audits and human assessments | No |
| `runs/` | Local authoring outputs | No |
| `local/archive/` | Original demo files and pre-cleanup snapshots | No |
| `local/research-tools/` | Archived experiment tooling | No |
| `tmp/` | Temporary work | No |

The source works with an empty dataset. Add `experiments/<group>/<asset>/experiment.json` to make local results appear, then refresh from disk. Missing times, costs, ratings and files remain missing. See the [data schema and viewer guide](tools/results/README.md).

The installable skill lives in [skill-glb-creator](https://github.com/asilvas/skill-glb-creator). Its **2.1** update contains previews, automatic optimization and size variants. Experimental reconstruction backends are not part of that release.

```sh
bun run test
bun run check
```

License: [MIT](LICENSE).
