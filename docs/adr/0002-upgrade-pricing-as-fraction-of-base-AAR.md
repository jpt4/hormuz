# AAR: ADR 0002 — Upgrade pricing as fraction of base

- **Date:** 2026-05-07
- **ADR:** [0002-upgrade-pricing-as-fraction-of-base.md](./0002-upgrade-pricing-as-fraction-of-base.md)

## Outcome

Implemented `UPGRADE_COST_FRACTION_TIER1` / `TIER2`, `computeUpgradeGoldCost`, balance override keys, rebalancer `TOO_HARD` adjustments, DESIGN/README memory updates, and migrated `balance-config.js` + archived cycle JSON keys.

## Validation

- `npm test` and `npm run test:extended` passed after change.

## Revisit when

- Meta shifts toward “upgrades should hurt more” globally (raise defaults or tighten wave income instead).
