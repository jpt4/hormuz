# 2026-05-07 — Aligning the repository with AGENTS.md

## Goal

Bring an existing single-file game + Node self-play tree into alignment with documented development practices: documentation layers, ADR baseline, coverage transparency, fast vs extended test separation, and CI for the fast path.

## Work completed

- Established ADR **0001** and linked it from the ADR index.
- Added `docs/COVERAGE.md` explaining three verification layers and documented gaps.
- Added Node contract tests under `self-play/test/` and npm scripts.
- Wired GitHub Actions CI for `npm test`.

## Follow-ups (not blocking)

- Optional: make `self-play/run.js test` exit non-zero on invariant failure for stricter extended gating.
- Optional: add unit tests for `analyzer.js` / `rebalancer.js` when those modules are next refactored.
