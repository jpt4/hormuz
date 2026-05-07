# ADR 0001: Repository governance, documentation layers, and test gates

- **Status:** Accepted
- **Date:** 2026-05-07

## Context

The codebase predates **AGENTS.md** but must conform to its practices: documented coverage gaps, layered project memory (LOG / MEMORY / LESSONS), ADR-first workflow for new features, and separation of fast vs extended automated tests. The playable game remains a single HTML file with an in-browser suite; the self-play balance system runs under Node with a VM-wrapped copy of the game script.

## Decision

1. Add **LOG.md**, **MEMORY.md**, and **LESSONS.md** at the repo root for chronological notes, durable context, and lessons respectively.
2. Maintain **docs/COVERAGE.md** stating which behaviors are covered by browser tests, Node tests, and extended smoke—and which gaps are intentional.
3. Introduce **npm** scripts: `test` (fast Node runner), `test:extended` (full headless smoke via `run.js`), documented in **README.md**.
4. Add **CI** (GitHub Actions) running the fast suite on push/PR to mainline branches.
5. Record implementation decisions in **docs/adr/** with sequence numbers and optional **AAR** files.

## Consequences

- Contributors have a clear map from policy (AGENTS.md) to artifacts (docs, tests, CI).
- Fast feedback in CI does not block on multi-second extended runs; developers run extended locally when touching VM-facing code.
- New gameplay or balance features should add new ADRs + tests rather than only editing this ADR.

## Success criteria

- `npm test` passes in CI on supported Node versions.
- README points new contributors to AGENTS.md, COVERAGE.md, and test commands within two clicks.

## Failure criteria

- If CI becomes flaky or extended tests are never run before risky merges, revisit splitting integration tests or gating extended on `workflow_dispatch` only.

## Links

- Longer process notes: [docs/log/2026-05-07-agents-alignment.md](../log/2026-05-07-agents-alignment.md)
