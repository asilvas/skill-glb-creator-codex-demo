Read [DESIGN.md](DESIGN.md) before changing this project.

This repository maintains the local results viewer in tools/results/. The installable skill is maintained separately in ../skill-glb-creator. Keep experiment outputs, source snapshots, research tools, model caches and local skill copies ignored. Preserve local files when reorganizing them; do not commit or push unless asked.

Use Bun. Run bun run test and bun run check after code changes. The viewer must work without experiment data, local GLBs, a .agents folder, model runtimes or Blender.

Preserve raw observations. Compare quality only within compatible rubrics and evaluation contexts. Label model estimates and material-only reviews. Human rejection takes precedence over conflicting model scores; an upper bound must not become an exact grade or quality ratio. Missing metrics remain null rather than zero.
