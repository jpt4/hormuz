# ADR 0002: Upgrade gold cost as a fraction of base unit price

- **Status:** Accepted
- **Date:** 2026-05-07

## Context

Upgrade pricing used `def.cost × UPGRADE_COST_MULTIPLIER^(tier+1)`, which grew steeply and made higher tiers feel economically out of reach compared to placing new units. Gameplay feedback called for **radically lower** upgrade prices anchored to the unit’s **base shop price**, not an exponential stack.

## Decision

1. Replace the single multiplier with two tuned fractions: **`UPGRADE_COST_FRACTION_TIER1`** (0→1) and **`UPGRADE_COST_FRACTION_TIER2`** (1→2), each applied to **`def.cost`** only.
2. Introduce **`computeUpgradeGoldCost(def, currentTier)`** as the single source of truth; **`getUpgradeCost`** and **`upgradeUnit`** use it.
3. Balance overrides and the self-play rebalancer adjust these fractions (not a legacy multiplier).

Canonical defaults (in `hormuz-game.html`): **0.32** / **0.38**. Self-play `balance-config.js` may use slightly lower fractions (e.g. 0.30 / 0.36) when tuning.

## Consequences

- Upgrades become affordable relative to base cost across all unit types (expensive units still pay more gold in absolute terms, proportional to their role).
- Rebalance scripts and historical JSON configs must use the new keys; `UPGRADE_COST_MULTIPLIER` is removed.

## Success criteria

- In-browser regression tests pass; self-play headless smoke passes.
- DESIGN.md and UI copy describe fraction-of-base pricing, not `1.4^tier`.

## Failure criteria

If win rate spikes due to upgrade spam, tighten fractions or adjust enemy scaling in a follow-up ADR.

## Links

- Implementation: `hormuz-game.html` (`computeUpgradeGoldCost`, balance override keys)
- Self-play: `self-play/rebalancer.js` (`TOO_HARD` path)
