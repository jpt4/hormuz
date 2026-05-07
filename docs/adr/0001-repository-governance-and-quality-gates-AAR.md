# AAR: ADR 0001 — Repository governance and quality gates

- **Date:** 2026-05-07
- **ADR:** [0001-repository-governance-and-quality-gates.md](./0001-repository-governance-and-quality-gates.md)

## What was implemented

- Root documentation spine: `LOG.md`, `MEMORY.md`, `LESSONS.md`
- `docs/COVERAGE.md` with explicit gaps (visual map regression, partial Node coverage of analyzers)
- `docs/adr/` index, template, ADR 0001, and this AAR
- `package.json` with `test` / `test:extended` / `test:all`
- `self-play/test/*.test.js` using Node’s built-in test runner
- CI workflow running `npm ci` and `npm test`

## Effect on the project

Contributors can trace policy to artifacts. The extended suite remains opt-in in CI to preserve latency; this trade-off should be **revisited** if self-play regressions slip through because extended is not run before merges.

## Revisit when

- A change breaks headless play but fast tests still pass (signal to move or duplicate checks).
- Visual map regression is automated (e.g. dedicated image snapshot tool).
- New subsystems (e.g. analyzer overhaul) warrant dedicated unit tests.
