# ADR 0005: Performance-adaptive wave difficulty (convoy pressure only)

- **Status:** Accepted (design); implementation pending
- **Date:** 2026-06-13

## Context

Static wave scaling (`wave × TANKERS_PER_WAVE_MULT`, compounding HP/speed, fixed escort/F-35 cadence, salvo size ∝ wave index) produces a **fixed difficulty curve** independent of how well the player actually performed last wave. Balance analysis (`self-play/convoy-balance-sheet.js`) shows:

- **Oil economy** (logarithmic kill/escape deltas, wave income) already creates strong feedback on tanker outcomes.
- **Combat demand** can still feel misaligned: a dominant player faces the same spawn schedule as a struggling one until raw wave index catches up; a recovering player may face full wave-*N* pressure immediately after near-wipe.

The product goal is **adaptive coalition response**: when Iran’s defenses clear convoys quickly with low losses, the next wave’s **convoy and standoff pressure** intensifies; when the player barely survives or leaks tankers, the next wave eases **spawn pressure** (not oil payouts).

### Explicit non-goals

- **Do not modify** `applyOilDelta`, per-tanker `oilDestroy` / `oilEscape`, `calculateWaveIncome`, win/lose thresholds, or any formula that maps kills/escapes → oil price.
- **Do not** use current oil price as a direct input to adaptive spawn math (oil already affects difficulty indirectly via player funds and psychology; this ADR is about **physical convoy/threat spawns**).
- **Do not** replace baseline wave-index scaling; adaptive modifiers **multiply** existing wave formulas.

### Alternatives considered

| Approach | Rejected because |
|----------|------------------|
| Scale HP/speed adaptively | Obscures readable progression; confounds balance sheet wave tables; HP/speed already compound per wave index. |
| Rubber-band oil deltas | Violates constraint; double-punishes/rewards on price axis. |
| Single global difficulty knob | Cannot model “more Tomahawks, same tanker count” asymmetric response. |
| Hidden random spikes | Unfair; hard to tune and test. |

## Decision

Introduce a **Performance Pressure Index (PPI)** computed at each wave boundary from a **Wave After-Action Report (WAAR)**. PPI drives **smoothed channel multipliers** applied to the **next** wave’s spawn and cruise-missile parameters only.

### 1. Wave After-Action Report (WAAR)

Captured across setup → defend → waveEnd for wave *w*. Reset at `transitionToDefend()`; finalized in `checkWaveComplete()` before `advanceToNextWave()`.

| Field | When captured | Use |
|-------|---------------|-----|
| `playerUnitsDefendStart` | `transitionToDefend()` | Survivability denominator |
| `playerHpDefendStart` | sum `hp` at defend start | HP retention |
| `playerUnitsWaveEnd` | wave complete | Survivability |
| `playerHpWaveEnd` | sum `hp` at wave complete | HP retention |
| `tankersSpawned` | increment on tanker spawn | Kill / leak rates |
| `tankersKilled` | `handleEnemyKill` (tanker types) | Kill rate |
| `tankersEscaped` | `handleTankerEscape` | Leak penalty |
| `escortsSpawned` / `escortsKilled` | spawn / kill hooks | Military clearance |
| `f35Spawned` / `f35Killed` | spawn / kill hooks | Military clearance |
| `defendDurationSec` | accumulate dt in defend phase | Speed score |
| `expectedDefendDurationSec` | from spawn queue size + path length at wave start (same model as balance sheet) | Speed normalization |
| `cruiseMissilesFired` | `spawnCruiseMissile()` | Standoff intensity context (optional weight) |
| `samIntercepts` | SAM intercept success | Skill signal (small bonus easing) |
| `f14StrikesUsed` | F-14 activation count | Optional; player spent extra power |

Store last WAAR on `GameState.waarHistory[]` (cap length e.g. 5) for debug HUD / self-play traces.

### 2. Performance Pressure Index (PPI)

All sub-scores in **[0, 1]** unless noted. **Higher PPI = player performed better = coalition raises physical pressure next wave.**

```
killRate      = tankersKilled / max(1, tankersSpawned)
leakRate      = tankersEscaped / max(1, tankersSpawned)
milSpawned    = escortsSpawned + f35Spawned
milKillRate   = (escortsKilled + f35Killed) / max(1, milSpawned)
survivalRate  = playerUnitsWaveEnd / max(1, playerUnitsDefendStart)
hpRetention   = playerHpWaveEnd / max(1, playerHpDefendStart)
speedRatio    = clamp(expectedDefendDurationSec / max(1, defendDurationSec), 0.5, 2.0)
speedScore    = (speedRatio - 0.5) / 1.5          // 0..1
standoffRelief = clamp(samIntercepts / max(1, cruiseMissilesFired), 0, 1)  // small term
```

**Composite PPI** (default weights — all `let` + `__BALANCE_OVERRIDES`):

```
PPI = ADAPT_W_KILL   * killRate
    + ADAPT_W_MIL    * milKillRate
    + ADAPT_W_SURV   * survivalRate
    + ADAPT_W_HP     * hpRetention
    + ADAPT_W_SPEED  * speedScore
    + ADAPT_W_SAM    * standoffRelief
    - ADAPT_W_LEAK   * leakRate

PPI = clamp(PPI, 0, 1)
```

Default weights (sum ≈ 1.0 on positive terms, leak subtracted):

| Constant | Default | Rationale |
|----------|---------|-----------|
| `ADAPT_W_KILL` | 0.30 | Primary objective alignment |
| `ADAPT_W_MIL` | 0.15 | Clearing escorts/F-35 reduces player income noise |
| `ADAPT_W_SURV` | 0.20 | Fleet intact → coalition escalates |
| `ADAPT_W_HP` | 0.10 | Damaged but alive still counts |
| `ADAPT_W_SPEED` | 0.15 | Fast wave clear = strong DPS/positioning |
| `ADAPT_W_SAM` | 0.05 | Rewards active missile defense |
| `ADAPT_W_LEAK` | 0.25 | Escaped tankers → ease physical pressure (oil already punished) |

Wave 1 uses **neutral multipliers** (no prior WAAR).

### 3. Channel multipliers (next wave only)

Map PPI to a **target pressure** around neutral 0.5:

```
pressure = (PPI - 0.5) * 2                    // [-1, +1]
target   = 1 + ADAPT_SPAN * pressure          // e.g. SPAN=0.25 → [0.75, 1.25]
```

Apply **exponential smoothing** per channel to avoid whiplash:

```
adapt[C] = lerp(adapt[C], target[C], ADAPT_SMOOTH_ALPHA)   // default alpha = 0.35
adapt[C] = clamp(adapt[C], ADAPT_FLOOR, ADAPT_CEIL)       // e.g. [0.70, 1.35]
```

**Asymmetric channel targets** (coalition doctrine: standoff first when player dominates):

| Channel | `target` formula | Applied to |
|---------|------------------|------------|
| `adaptTanker` | `1 + ADAPT_SPAN * pressure * ADAPT_TANKER_GAIN` | `tankerCount` in `buildWaveSpawnQueue` (after interdiction mult) |
| `adaptEscort` | `1 + ADAPT_SPAN * pressure * ADAPT_ESCORT_GAIN` | `escortCount` |
| `adaptF35` | `1 + ADAPT_SPAN * pressure * ADAPT_F35_GAIN` | `f35Count` |
| `adaptCruise` | `1 + ADAPT_SPAN * pressure * ADAPT_CRUISE_GAIN` | `initDefendSalvo` count **and** drip `rate` in `updateCruiseMissiles` |

Default gains (sublinear tankers, superlinear standoff when player hot):

| Constant | Default |
|----------|---------|
| `ADAPT_TANKER_GAIN` | 0.6 |
| `ADAPT_ESCORT_GAIN` | 0.9 |
| `ADAPT_F35_GAIN` | 1.0 |
| `ADAPT_CRUISE_GAIN` | 1.2 |

**Application rules:**

- Counts: `count = max(0, round(baselineCount * adaptChannel))` — never below 0; F-35 still respects `F35_START_WAVE` baseline of 0.
- Cruise salvo: `salvoCount = round(baselineSalvo * adaptCruise)`; drip `rate *= adaptCruise`.
- **Do not** multiply `WAVE_HP_SCALING` / `WAVE_SPEED_SCALING` / unlimited-mode HP mults — those stay index-driven.
- Interdiction waves: adaptive mults apply **after** `INTERDICTION_TANKER_MULT` (fewer tankers but harder standoff if player dominated).

### 4. GameState shape

```javascript
GameState.adaptive = {
    tanker: 1.0,
    escort: 1.0,
    f35: 1.0,
    cruise: 1.0,
    lastPpi: null,
};
GameState.waar = { /* current wave tallies */ };
GameState.waarHistory = [];
```

Reset `adaptive.*` to 1.0 on `startGame()`. Optional difficulty flag: `ADAPTIVE_DIFFICULTY_ENABLED` (default true; training mode may disable).

### 5. Player-facing feedback

- **No new HUD clutter** during combat. Optional debug line in reference panel or self-play trace: `Next wave pressure: tankers ×1.08, cruise ×1.12`.
- Major step-changes (|Δadapt| > 0.15) may reuse route-intel alert pattern: *"INTEL: COALITION SURGE — INCREASED STANDOFF TEMPO"* (copy tunable).

### 6. Self-play and balance tooling

- Headless `trace-recorder.js`: emit `waveSummary.adaptive` and WAAR fields.
- `convoy-balance-sheet.js`: **unchanged** for baseline wave tables; add optional `--adapt-ppi=0.8` mode later to project adapted counts without full sim.
- Rebalancer on `self-play` may override `ADAPT_*` weights via `__BALANCE_OVERRIDES`.

### 7. Constants block (new `let` entries)

```
ADAPTIVE_DIFFICULTY_ENABLED = true
ADAPT_SPAN = 0.25
ADAPT_SMOOTH_ALPHA = 0.35
ADAPT_FLOOR = 0.70
ADAPT_CEIL = 1.35
ADAPT_W_KILL, ADAPT_W_MIL, ADAPT_W_SURV, ADAPT_W_HP, ADAPT_W_SPEED, ADAPT_W_SAM, ADAPT_W_LEAK
ADAPT_TANKER_GAIN, ADAPT_ESCORT_GAIN, ADAPT_F35_GAIN, ADAPT_CRUISE_GAIN
```

All wired through `__BALANCE_OVERRIDES`.

## Consequences

- Strong players face **earlier** standoff saturation and slightly larger convoys without flattening oil economy tuning.
- Struggling players get **spawn relief** after leaky/slow waves while still paying full oil penalties for escapes (price axis unchanged).
- Wave-index tables in docs remain the **baseline**; adaptive is an overlay — documentation must label both.
- Regression tests need WAAR + PPI golden cases; headless must reset adaptive state in `startGame()`.

## Success criteria

- Oil deltas and wave income **bit-identical** to pre-ADR behavior when `ADAPTIVE_DIFFICULTY_ENABLED = false`.
- With adaptive on, synthetic WAAR fixtures produce monotonic channel mults: higher PPI → `adaptCruise >= adaptTanker` gain ordering.
- Playtest: a deliberate “perfect” wave 3 (100% kills, >80% fleet survival, fast clear) yields measurably higher wave-4 salvo/F-35 than a “leaky slow” wave 3 at the same wave index.
- `npm test` / extended suite pass; new ADR 0005 regression block passes.

## Failure criteria

- Players cannot recover after one bad wave (mults stick at ceiling) — lower `ADAPT_CEIL` or raise `ADAPT_SMOOTH_ALPHA` toward baseline.
- Adaptive changes are invisible in outcomes (always ~1.0) — increase `ADAPT_SPAN` or reduce smoothing.
- Convoy counts explode past performance budget — cap `adaptTanker` contribution separately (`ADAPT_TANKER_CEIL`).
- Any change to oil price formulas sneaks in — revert; adaptive is spawn-only.

## Implementation sketch (next branch)

1. WAAR counters + defend-start snapshot hooks.
2. `finalizeWavePerformance()` → PPI → update `GameState.adaptive`.
3. Thread multipliers through `buildWaveSpawnQueue`, `initDefendSalvo`, `updateCruiseMissiles`.
4. Tests + headless trace fields.
5. AAR after playtest data.

## Links

- Baseline wave math: `hormuz-game.html` (`buildWaveSpawnQueue`, `initDefendSalvo`, `updateCruiseMissiles`)
- Analysis tooling: `self-play/convoy-balance-sheet.js`, `self-play/convoy-balance-analysis.js`
- Prior scaling ADR: [0003](./0003-balance-verisimilitude-layered-threat.md)
