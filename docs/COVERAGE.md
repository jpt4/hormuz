# Test coverage and gaps

This document satisfies **AGENTS.md** requirement that any non-total coverage be justified. The project has three complementary verification layers.

## 1. Browser regression suite (`hormuz-game.html`)

The shipped game embeds an automated suite (Ctrl+T, also runs on load) covering placement validation, economy, wave logic, upgrades, path unlocks, audio hooks, and related invariants—aligned with **DESIGN.md §13**.

**Gap (acceptable):** Full visual regression against the original `hormuz-map.html` map layer is a **manual** check; automating pixel-diff across browsers is out of scope for the current toolchain. **Mitigation:** DESIGN.md declares the map sacrosanct; releases that touch SVG/layout require explicit before/after comparison.

## 2. Fast Node suite (`npm test`)

Runs `node --test` on `self-play/test/*.test.js`:

- **PRNG:** determinism, range contracts, serialize/restore, fork divergence
- **Strategy genome:** structural validity, mutation/crossover invariants
- **Fitness:** monotonicity and outcome weighting against synthetic traces
- **Headless VM:** bounded smoke (simulation starts and steps without throw)

**Gap (acceptable):** Not every branch of `analyzer.js`, `rebalancer.js`, or `evolution.js` is unit-tested; those modules are exercised primarily via **extended** runs and operational use. **Mitigation:** Incremental ADRs can add targeted tests when a subsystem changes.

## 3. Extended suite (`npm run test:extended`)

Invokes `self-play/run.js test`: full headless game with random strategy, placement, multi-phase ticks, and fitness—several seconds per run.

**When to run (per AGENTS.md):** after substantive changes to game logic consumed by the VM, self-play drivers, or balance outputs—before commits that affect those paths. Default CI runs the **fast** suite only to keep feedback latency low.

## Coverage target

**Total** coverage of every path is not claimed. The split above documents **what is automated**, **what is manual**, and **how to extend** tests when features land (ADR-first, then tests, then implementation per project policy).
