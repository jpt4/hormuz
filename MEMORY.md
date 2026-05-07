# Project memory (high-priority context)

Facts that should stay **visible** to future work without re-reading the whole repo:

- **Canonical gameplay** lives in **`hormuz-game.html`** (single portable file). **DESIGN.md** is the authoritative product spec; the SVG map layer is treated as non-regressing.
- **Balance overrides:** `window.__BALANCE_OVERRIDES` (`balance-config.js`) may tune stats and **`UPGRADE_COST_FRACTION_TIER1` / `UPGRADE_COST_FRACTION_TIER2`** (gold cost for each upgrade step = fraction of that unit’s base shop price). See **docs/adr/0002**.
- **AGENTS.md** is the binding engineering policy for this workspace (TDD expectation, ADRs, documentation layers, fast vs extended tests).
- **Tests:** in-browser suite (Ctrl+T) in the HTML file; `npm test` = fast Node contracts; `npm run test:extended` = full headless smoke. See **docs/COVERAGE.md**.
