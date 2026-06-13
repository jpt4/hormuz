# ADR 0003: Balance, verisimilitude, and layered threat geography

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

Playtesting and literature review (tower-defense lane defense, Iranian asymmetric assets, Hormuz geography) identified several gaps in the canonical **`master`** game:

- Destroyer escorts could engage **inland** launchers, making deep placement strictly dominant with no trade-off.
- Players could **stack** multiple units in one tile without mechanical cost.
- Cruise missiles arrived as a **flat drip**, not as saturation salvos that reward SAM investment.
- Convoys spawned as **independent** ships on random lanes, weakening lane-defense positioning.
- Standoff threats (F-35, Tomahawk) did not **prefer** mainland interior once destroyer LOS was fixed.
- New mechanics needed **`let` constants + `__BALANCE_OVERRIDES`** so the **`self-play`** branch can tune without forking magic numbers.

## Decision

1. **Destroyer LOS:** Escort destroyers may target only units whose `threatZone` is not `mainland_interior` (water, coast, islands remain in range).
2. **Anti-clustering:** Coarse deployment grid (`DEPLOYMENT_CELL_SIZE`); max one land/coast unit and one water unit per cell; cells released on unit death.
3. **Tomahawk splash:** Secondary damage to nearby player units on cruise-missile impact (`CRUISE_MISSILE_SPLASH_*`).
4. **Salvo waves:** At defend-phase start, spawn a bounded opening salvo (`CRUISE_SALVO_*`, interdiction multiplier); steady drip uses reduced `CRUISE_MISSILE_DRIP_MULT`.
5. **Convoy packets:** Escorts and grouped tankers share `pathId`; weighted lane pick via `PATH_LANE_META`; optional VLCC lead in late waves.
6. **Layered threat weights:** Tomahawk targeting multiplies signature weight by `THREAT_INLAND_WEIGHT` for interior units; F-35 pickers bias via `F35_INLAND_WEIGHT` (not exclusive).
7. **Destroyer CIWS (flak):** Before a drone fires, nearby destroyers may abort **one launch attempt** (`FLAK_INTERCEPT_CHANCE`, per-ship cooldown). Feedback is **visuo-auditory only** — no flak HUD text.
8. **Flavor / intel:** TSS lane labels and interdiction waves surface as brief **route intel** HUD text (major events only).
9. **Light geography bonuses:** Island overwatch range bonus; shallow-water patrol radius reduction; F-14 charges at oil milestones.
10. All tunables declared as **`let`** in the constants block and wired through **`__BALANCE_OVERRIDES`**.

## Consequences

- Inland placement becomes a deliberate trade: less destroyer fire, more standoff air/missile attention.
- SAM and spread deployment are rewarded; blob stacking is blocked mechanically.
- Spawn queue structure changes may affect self-play fitness baselines; selective sync to **`self-play`** per AGENTS.md §16 when shared engine behavior should match.
- Regression suite extended with ADR 0003 invariants.

## Success criteria

- Browser regression tests (Ctrl+T) pass, including ADR 0003 cases.
- `npm test` and `npm run test:extended` pass on **`master`**.
- Flak, splash, and salvo behavior observable in play without new combat-log clutter.

## Failure criteria

- Win rate collapses (too punishing inland) or inland becomes mandatory (weights too weak) — retune `THREAT_INLAND_WEIGHT` / `F35_INLAND_WEIGHT`.
- Convoy grouping causes spawn starvation or performance regression — adjust `CONVOY_*` or packet sizes.

## Links

- Implementation: `hormuz-game.html` (constants block, deployment helpers, spawn queue, cruise missile update)
- Product context: `DESIGN.md` §11 (constants architecture)
