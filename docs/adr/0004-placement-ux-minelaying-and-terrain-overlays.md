# ADR 0004: Placement UX, lane-locked minelaying, and terrain overlays

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

Post–ADR 0003 playtesting and UI review surfaced four gaps:

1. **Reference drift:** The in-game STRATEGIC READOUT panel (static HTML) listed stale unit stats (e.g. drone DPS/strikes) that no longer matched `UNIT_DEFS` or ADR 0003 balance.
2. **Mine layer underperformance:** Heidar minelaying stations picked random water points within radius and only *hoped* to land near a lane (`MINE_LANE_PROXIMITY`). Convoys travel fixed TSS/TR splines; random placement wasted most mines off-lane on a map too small for wandering traffic.
3. **Naming:** The mine-layer asset lacked a plausible Iranian designation aligned with real-world mine-warfare vocabulary.
4. **Placement opacity:** Players could not see unit range while placing, escort destroyer gun range when assessing threats, or which terrain bands accept which unit types — despite ADR 0003’s inland vs littoral threat model.

## Decision

### 1. Documentation sync

- Treat **`UNIT_DEFS` + balance constants** as authoritative for numeric stats.
- Update the reference panel, `DESIGN.md`, and regression assertions whenever shipped stats or mechanics change.
- Add a **TERRAIN & PLACEMENT** section to the reference panel describing overlay colors and destroyer range preview.

### 2. Lane-locked minelaying

- Replace random polar mine coordinates with **`pickLaneMinePoint(mineLayer, activePaths)`**: sample cached path points on **active shipping lanes only**, filtered to the layer’s placement radius and minimum standoff.
- USV delivery behavior unchanged; only the target selection becomes lane-deterministic.

### 3. Unit designation

- Rename mine layer to **`Heidar-5 Coastal Minelaying Station`** (`shortName: HEIDAR-5`).
- Rationale: *Heidar-5* appears in open-source ORBAT/handbook listings as an Iranian minelayer designation; the in-game asset abstracts a coastal control point that dispatches USVs to seed influence mines (EM-series family) onto transit lanes — not a 1:1 vehicle model.

### 4. Placement and threat visualization

Introduce **mutually exclusive terrain zones** (precomputed `terrainOverlayGrid`, one category per land/water cell):

| Zone | Color (placement mode) | Meaning |
|------|------------------------|---------|
| **Inland sanctuary** | Green tint | Mainland interior — land units; escort destroyers **cannot** engage (ADR 0003) |
| **Littoral exposure** | Amber tint | Coast / island — land units allowed; destroyer-vulnerable |
| **Coast strip** | Cyan tint | Valid **Heidar-5** coast placement only (subset of littoral) |
| **Naval deployment** | Blue tint | Open water — FAB / submarine placement |

Rules:

- Overlays render **only while a unit type is selected** for purchase/placement.
- At most **one highlight class per map cell**; land placement shows inland **or** littoral, never both.
- **Placement range circle** follows cursor (`placementCursor`) with green/red validity.
- **Destroyer gun range** (`DESTROYER_RANGE`) shows on hover or click of an escort DDG (`hoveredEnemy` / `selectedEnemy`).

Constants: `TERRAIN_ZONE_*`, `TERRAIN_OVERLAY_ALPHA`, `ENEMY_CLICK_RADIUS`.

## Consequences

- Minelayers become materially stronger against convoy packets (ADR 0003) without changing mine damage or caps.
- Reference panel must be maintained when balance changes — prefer eventually generating readout from `UNIT_DEFS` (out of scope here).
- Terrain overlay adds one full-grid pass at init and per-frame fill during placement; view-culled to visible cells.
- Headless/self-play unaffected visually; `pickLaneMinePoint` is testable via path cache.

## Success criteria

- Mines spawn on active lane geometry within layer range (regression test).
- Reference panel matches `UNIT_DEFS` stats and documents terrain overlays.
- Placement preview range and DDG threat range visible in browser play.
- `npm test` and embedded regression suite pass.

## Failure criteria

- Overlay colors overlap on the same cell → fix zone classification.
- Mine density on lanes feels oppressive → tune `MINE_PLACEMENT_MIN_DIST` or layer cooldown in a follow-up.
- Heidar-5 naming confuses players → adjust copy while keeping designation.

## Links

- Builds on [ADR 0003](./0003-balance-verisimilitude-layered-threat.md) (threat zones, convoy lanes)
- Implementation: `hormuz-game.html` (`pickLaneMinePoint`, `drawTerrainOverlay`, reference panel §TERRAIN)
