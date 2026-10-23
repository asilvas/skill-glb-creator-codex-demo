# Results viewer design

This project maintains a small, reusable viewer. Asset generation experiments and their tools stay local, preserved and ignored by Git. The installable glb-creator skill is a separate product; its2.1 delivery update includes previews, quality-guided automatic optimization and variants, without experimental reconstruction backends.

The original priorities still guide evaluation:

1. Maximize reference fidelity and complete asset quality. Measure byte savings at a comparable quality level separately.
2. Minimize time to deliver N accepted assets, including retries, rendering and review. Component timings do not establish accepted-asset throughput. Productivity comparisons require four overlapping authoring workers per arm with matched inputs.
3. Minimize tokens and actual cost at a given quality. Preserve missing usage and prices; do not invent dollar savings.

Keep quality, bytes, time and cost separate. A recognizable model, valid GLB or small variant is not proof of a faithful replica. Original reference, textures, instructions and evaluation settings must match within controlled comparisons.

## Evidence and assessment

Every score belongs to a rubric and review context. Material-only and complete-asset ratings are different measurements. Model-review panels can share systematic bias; agreement does not establish human calibration or an industry quality level. Preserve raw votes and failures, but do not use a rejected estimate as an accepted quality score. Human upper bounds stay explicitly bounded and do not produce ordinary qualityPerMB or qualityPerSec values. Query1024's disputed8.17 model estimate is rejected by the user's at-most7 assessment; no experimental master is accepted for product promotion.

Only rank quality within compatible evaluation contexts. Keep an all-assets overview for browsing without implying a common numerical quality scale. Static pictures cannot establish animation, topology, collision or target-engine readiness. Inspect requested clips separately.

## Runtime and local data

The viewer uses Bun and a browser GLB renderer. It must install and build without .agents, sibling repositories, Blender, model checkpoints or local experiment data. Its read-only loopback server loads optional local manifests on refresh. GLBs are preferred when present; retained PNGs remain usable when absent. Unknown commercial eligibility fails closed.

Metrics remain extensible. Validate finite numbers and denominator scopes, retain unknown values as null, and render the graphs supported by compatible observations. Preserve exact identities when joining historical reviews to local binaries.

Keep code in tools/results/. Keep experiments/, results/, runs/, local/, .agents/, caches and generated artifacts out of source control. Archive rather than delete local research when cleaning. No commit, push, publication or experimental skill promotion is implied by a successful test.
