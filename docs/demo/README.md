# GRD demo viewer

Self-contained single-page HTML viewer for a representative
`.planning/` tree. Open `docs/demo/index.html` in a browser; no build,
no server, no dependencies.

To host:

- GitHub Pages: enable Pages on `main` branch, root `/docs/demo`
- Vercel / Netlify: point at `docs/demo/` as static root
- Local: `cd docs/demo && python -m http.server 8000` then visit
  http://localhost:8000

## Replacing the demo data with a real project snapshot

The current `DEMO_TREE` inside `index.html` is a hardcoded illustration.
To regenerate it from a live project:

```bash
# (future, not yet implemented)
node scripts/build-demo.js --project ~/path/to/project --out docs/demo/index.html
```

The build script (planned for v0.4.x) will read `.planning/PROJECT.md`,
`STATE.md`, `DEAD-ENDS.md`, `GENOME.md`, the most recent VERIFICATION.md,
and the output of `gd health` + `gd singularity --raw`, then inline them
as `textContent` strings in a regenerated `index.html`.

This is recommendation #3 from `docs/ouroboros-loop.md` §8 (hosted
demo). The static-page approach was chosen over a hosted backend
because (a) zero infra, (b) cacheable, (c) reproducible from any git
SHA.
