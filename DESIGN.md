# W.O.P.R. — STRAIT OF HORMUZ DEFENSE

## Authoritative Design Document v2.0

**Genre:** Real-time Tower Defense (Iranian perspective)
**Platform:** Single portable HTML + CSS + JavaScript file (no external assets or libraries)
**Aesthetic:** 1980s WOPR / DEFCON phosphor-CRT terminal (exactly as in the supplied `hormuz-map.html`)

---

## 1. Core Objective

As Iran, build and manage coastal/naval defenses to disrupt oil tanker convoys transiting the Strait of Hormuz. Destroyed tankers raise the global oil price (player income). Tankers that escape lower it. The player must gradually push the oil price to $250/barrel to win — or watch it collapse below $60 and lose.

---

## 2. Map Foundation

`hormuz-map.html` is the **canonical, sacrosanct map**. It must never suffer regression or unauthorized change.

- The entire `<body>` structure, `.crt-container`, `.viewport`, grid, radar-sweep, scanlines, phosphor styles, clock, overlays, mouse/keyboard panning, and the 2400x1680 SVG viewBox are kept 100% intact.
- All existing labels, cities, borders, islands, and crosshatch pattern remain exactly as supplied.
- Shipping lane (TR-7) remains the exact path `M 120,1080 L 600,912 L 960,720 L 1272,600 L 1632,840 L 2280,1392` — used as the primary enemy movement spline.
- A new `<canvas id="game-layer">` (absolute, same dimensions as SVG, z-index 3) draws ALL dynamic elements (units, projectiles, enemies, effects, range circles) between map and UI.

### 2.1 Placement Validity

- **Land units** (Coastal Battery, SAM, Drone Launcher): Only inside Iranian landmass polygon or Iranian-controlled islands (Qeshm, Hormuz, Larak, Greater Tunb, Lesser Tunb, Abu Musa, Sirri, Kish). Hit-test via SVG `isPointInStroke`/`isPointInFill` or predefined safe regions. **No placement on Arabian (UAE/Oman) territory.**
- **Water units** (FABs, Submarines): Only in water (outside all landmass paths). **Critical: water units must never cross onto land during patrol or movement.**
- **Mine Layers**: Placed on a strip along the Iranian coast or on islands. The mine layer then places mines in water within its placement radius.

---

## 3. Economy System

All constants declared at top of code for tuning.

### 3.1 Oil Price
- **Starting price:** $85 USD/barrel
- **Lose condition:** Price drops below $60
- **Win condition:** Price exceeds $250
- Oil price is **global and persistent** across waves.
- Tankers affect oil price **proportionate to their size**:
  - **Small tanker:** destroyed +3, escaped -2
  - **Medium tanker:** destroyed +6, escaped -4
  - **Large/VLCC tanker:** destroyed +9, escaped -6
- Oil price is clamped to a reasonable display range but the lose/win thresholds are the hard boundaries.

### 3.2 Funds
- **Starting funds:** 800M
- **Wave income:** `oil_price * 12` (funds depend only on current oil price; no reward for tanker kills)
- **Escort destroyer kill bonus:** Immediate modest funds bonus (tunable, nominally 150M)
- **F-35 kill bonus:** Immediate larger bonus (tunable, nominally 200M) since they are rarer and harder to kill
- Funds rounded to nearest 5.

---

## 4. Game Phases & Wave Structure

### 4.1 Timeline
- **Wave 1 begins:** March 1, 2026
- **Each wave advances the date by 1 week** (displayed in the HUD)
- Waves continue until Victory ($250), Defeat (<$60), or Stalemate (20 waves without either)

### 4.2 Phase Flow

```
[SETUP PHASE] → [DEFEND PHASE] → [WAVE END] → [SETUP PHASE] → ...
   18 sec          until clear       funding
```

- **Setup Phase (18 seconds):** Player receives wave income and places/upgrades units. Cruise missiles still attack during setup, but at **reduced intensity** (e.g., 25% of defend-phase rate).
- **Defend Phase:** Convoy spawns and traverses the Strait. All enemy units active at full intensity. Player may still place and upgrade units during this phase.
- **Wave End:** When all convoy units are destroyed or have escaped, the wave ends. Player receives funding for the next wave.

### 4.3 Wave Scaling
- **Wave n** spawns: `(n * 3)` tankers + `floor(n / 3)` escort destroyers
- F-35s begin appearing at wave 5, at rate `floor((n - 4) / 4)` per wave
- **Speed multiplier:** +0.08x per wave (compounding)
- **Enemy HP scaling:** +10% per wave (compounding)

### 4.4 Stalemate & Unlimited Mode
- If 20 waves pass without Victory or Defeat: **"FOREVER WAR — STALEMATE"** screen
- Player may **Restart** or **Continue Playing**
- Continuing enters unlimited scaling: each additional wave adds +5 tankers, +1 escort, +1 F-35 (every other wave), speed multiplier x1.05, escort/F-35 HP x1.08
- Player can still win ($250) or lose (<$60) after passing through Stalemate
- This is NOT a separate "Unlimited Mode" — it is a continuation of the same game

---

## 5. Player Units (Iranian Defenses)

All units drawn on canvas with phosphor glow + unique distinctive shapes. Range circles shown on hover/selection. All stats are tunable constants.

### 5.1 HY-2 Silkworm Coastal Battery
- **Placement:** Land (Iranian mainland or islands)
- **Targets:** Tankers (priority), then escort destroyers
- **Icon:** Distinctive upward triangle with base marks (heavy weapon silhouette)
- **Signature:** HEAVY (highest cruise missile priority)
- **Base stats:** Cost 200M, HP 450, DPS 50, Range 750px, Cooldown 2.5s
- **Upgrades:**
  - Tier 1: +30% range, anti-ship damage boost
  - Tier 2: Dual-target capability, faster reload

### 5.2 Misagh-2 SAM Site
- **Placement:** Land (Iranian mainland or islands)
- **Targets:** Cruise missiles (priority) → F-35s → escort destroyers → tankers
- **Icon:** Distinctive cross/plus with radar dish marks
- **Signature:** MEDIUM
- **Base stats:** Cost 120M, HP 250, DPS 20 (vs aircraft), Range 650px, Cooldown 1.2s
- **Anti-missile intercept chance:** 30% per missile targeted
- **Special:** Only player unit capable of anti-air vs cruise missiles
- **Upgrades:**
  - Tier 1: Anti-ship capability added, improved intercept chance
  - Tier 2: Dual-target + splash damage

### 5.3 Shahed Drone Swarm Launcher
- **Placement:** Land (Iranian mainland or islands)
- **Targets:** Tankers (priority), then escorts. Never targets air units.
- **Icon:** Hexagon with rotor/propeller marks
- **Signature:** LOW
- **Base stats:** Cost 60M, HP 80, DPS 120, Range 900px, Cooldown 4.0s
- **Attritable:** Each swarm can attack **5 times** before depletion (unit removed from map)
- **Evasion:** 90% chance to evade cruise missiles
- **Splash damage** on impact
- **Upgrades:**
  - Tier 1: 7 attacks before depletion, +damage
  - Tier 2: 10 attacks, faster drone speed, increased splash radius

### 5.4 Mine Layer System
- **Placement:** Two-step mechanic
  1. Player places mine layer unit on Iranian coast strip or island
  2. Mine layer autonomously places mines at **random positions along the tanker corridor** within its placement radius
- **Max active mines:** 4 at a time per mine layer
- **Icon:** Circle with concentric ring marks (mine layer); pulsing dot (mine)
- **Signature:** MEDIUM (the mine layer itself; mines are invisible to cruise missiles)
- **Base stats:** Cost 100M, HP 280, Mine damage 300 (splash), Mine placement radius 550px
- **Mine behavior:** Detonates on any ship passing within proximity. Splash damage hits nearby ships too. Mines do NOT damage aircraft.
- **Upgrades:**
  - Tier 1: Mine damage +60%, faster mine respawn
  - Tier 2: 6 max active mines, larger splash radius

### 5.5 Zolfaghar Fast Attack Boat (FAB)
- **Placement:** Water only (Strait waters)
- **Targets:** Tankers and escorts within attack radius
- **Movement:** Auto-patrols an area around its placement point. **Must never cross onto land.**
- **Icon:** Arrowhead/chevron shape (small, fast)
- **Signature:** LOW
- **Base stats:** Cost 75M, HP 100, DPS 20, Range 350px, Cooldown 1.0s, Patrol radius 200px, Speed 120px/s
- **Evasion:** 90% chance to evade cruise missiles
- **Upgrades:**
  - Tier 1: +damage, faster speed
  - Tier 2: Torpedo capability (burst damage), wider patrol

### 5.6 Ghadir Submarine
- **Placement:** Water only (Strait waters)
- **Targets:** Escort destroyers (priority), then tankers. Torpedoes.
- **Icon:** Elongated oval/cylinder with periscope line
- **Signature:** STEALTH (immune to cruise missiles entirely)
- **Base stats:** Cost 250M, HP 200, DPS 65, Range 500px, Cooldown 2.2s
- **Upgrades:**
  - Tier 1: +range, +damage
  - Tier 2: Dual torpedo salvo, reduced cooldown

### 5.7 F-14 Tomcat Strike (Special Ability)
- **Not a placed unit** — activated via hotkey or UI button
- **Charges build up** as coalition ships (escort destroyers) are destroyed
- **Tunable constants:**
  - `F14_KILLS_PER_CHARGE`: 2 (destroyer kills needed per charge)
  - `F14_MAX_CHARGES`: 3
  - `F14_COOLDOWN_SEC`: 30
  - `F14_DAMAGE`: 500 (devastating to escort destroyers)
- **On activation:** F-14 sweeps across screen, fires missiles at highest-value naval targets (escort destroyers priority)
- **Icon:** Swept-wing jet silhouette (white)
- **Sound:** Jet roar (sawtooth sweep via Web Audio)

### 5.8 Upgrade System
- Each placed unit can be upgraded through tiers by clicking/selecting it and spending funds
- **Upgrade cost multiplier:** Each tier costs 1.4x the previous tier's cost
- All upgrade stats (range boost %, damage boost, new abilities) are tunable constants at top of code
- Upgrades are per-unit-instance (not global)

---

## 6. Enemy Units

### 6.1 Oil Tankers (Unarmed)
Follow shipping lanes from west (Persian Gulf) to east (Gulf of Oman).

| Type | HP | Speed | Oil if Destroyed | Oil if Escaped |
|------|-----|-------|-----------------|----------------|
| Small | 100 | 65 px/s | +3 | -2 |
| Medium | 220 | 50 px/s | +6 | -4 |
| Large/VLCC | 420 | 40 px/s | +9 | -6 |

HP and speed scale with wave number (see 4.3).

### 6.2 Escort Destroyers (Arleigh Burke class)
- **HP:** 300 (scales with wave)
- **Speed:** 55 px/s
- **Behavior:** Follow shipping lanes alongside tankers. Fire at any player unit within attack radius, **prioritizing mobile units** (drones, FABs) first.
- **Attack radius:** 600px, DPS: 25, Cooldown: 2.0s
- **On destruction:** Immediate funds bonus to player. Contributes to F-14 charge buildup.

### 6.3 Cruise Missiles
- **Origin:** Offscreen (randomized entry point along map edges)
- **Targeting priority** (highest signature first): Coastal Batteries → SAM Sites → Drone Launchers → Fast Attack Boats → Mine Layers
- **Submarines are NOT targetable** by cruise missiles
- **Each unit type has a different evasion chance:**
  - Coastal Battery: 5%
  - SAM Site: 10%
  - Drone Launcher: 90%
  - FAB: 90%
  - Mine Layer: 10%
- **SAMs can intercept** cruise missiles (30% chance per intercept attempt)
- **No other player unit provides anti-air vs cruise missiles**
- **Intensity:** Reduced during Setup phase (25% rate), full during Defend phase
- **Rate scales with wave number**

### 6.4 Israeli F-35 Lightning II (Air Unit)
- **Appears from:** Wave 5 onward, increasingly frequent
- **HP:** 90
- **Speed:** Fast (350 px/s flyover)
- **Targets:** Any player unit **except submarines** — prioritizes drones and FABs
- **DPS:** 35, Attack radius: 500px
- **On destruction:** Larger immediate funds bonus than destroyers (nominally 200M)
- **Targetable by:** SAM sites (primary counter), coastal batteries with Tier 1+ upgrade

---

## 7. Multi-Path System

Multiple tanker/escort routes through the Strait, defined as SVG `<path>` elements. Unlocked progressively:

- **Waves 1–7:** Only primary TR-7 route active (`M 120,1080 L 600,912 L 960,720 L 1272,600 L 1632,840 L 2280,1392`)
- **Waves 8–14:** Secondary northern route (near Qeshm and Hormuz islands) unlocked
- **Waves 15–20+:** All paths active simultaneously. Tankers and escorts randomly or intelligently assigned to different paths for pincer-style attacks.

Path following uses SVG `getPointAtLength` (or pre-sampled points for canvas performance). Each enemy group follows its assigned path.

**Critical:** All paths must remain in water. Land collision checking applies to path definitions.

---

## 8. UI & Controls

### 8.1 HUD (kept from hormuz-map.html + additions)
- **Top-left:** SYS_OP, SECTOR, STATUS (from original map) + FUNDS display + WAVE counter
- **Top-right:** DEFCON level, UTC clock (from original)
- **Top-center:** Oil price gauge (large phosphor number, color shifts red↔cyan based on price trend)
- **Bottom-left:** Coordinates, NAV hint (from original) + current date (week of wave)
- **Bottom-right:** Tracking/Link status (from original) + F-14 charge indicator
- **Phase indicator:** "SETUP — 18s" countdown or "DEFEND — WAVE N"

### 8.2 Toggleable Sidebar (right edge)
- Slide in/out on `S` key or click tab
- Unit buy list: icon + name + cost + brief stat summary
- Selected unit highlight + range preview on map
- Upgrade panel: appears when clicking a placed unit
- F-14 strike button with charge count

### 8.3 Controls (fully keyboard-playable)
- **Mouse:** Drag to pan, scroll to zoom, left-click to place/select, right-click to cancel
- **Arrow keys:** Pan map
- **1–6:** Select unit type for placement
- **7 or F:** Activate F-14 strike
- **U:** Upgrade selected placed unit
- **S:** Toggle sidebar
- **R or ?:** Toggle reference/instructions overlay
- **Escape:** Cancel current action
- **Tab:** Cycle through placed units
- **Space:** Pause/unpause (during any phase)
- Keyboard cursor for unit placement (moves a visible crosshair on the map; Enter to confirm placement)

### 8.4 Instructions/Reference Screen
- Full-screen phosphor overlay visible at game start
- Contains: objective, controls, unit summaries, economy rules, win/lose/stalemate conditions
- Dismiss with click, Escape, or `R`/`?`
- Toggleable anytime during gameplay

---

## 9. Audio (Web Audio API only — no external files)

All sounds generated procedurally. Master volume 0.4.

- **Missile launch:** Rising sine whoosh (400→1200 Hz, 0.3s)
- **Mine detonation:** Deep sonar ping + reverb
- **Drone flight:** Low pulse oscillation
- **F-14 flyby:** Jet roar (sawtooth sweep, dramatic)
- **Torpedo launch:** Low thud + water rush (filtered noise)
- **Ship explosion:** White noise burst with decay
- **Oil price increase:** Ascending chime (short)
- **Oil price decrease:** Descending tone (short, ominous)
- **Cruise missile incoming:** Warning klaxon (2-tone alternating)
- **Unit placed:** Confirmation click/beep
- **Wave start:** Alert tone sequence
- **Victory/Defeat/Stalemate:** Distinct musical stings

---

## 10. Win / Lose / Stalemate

- **Victory ($250+):** "IRAN CONTROLS THE STRAIT" — option to Restart
- **Defeat (<$60):** "COALITION FORCES GUARANTEE SAFE PASSAGE" — option to Restart
- **Stalemate (20 waves, no win/loss):** "FOREVER WAR — STALEMATE" — options: Restart or Continue
  - Continue: waves scale indefinitely, player can still win or lose
  - Date display: starts March 1 2026, continues advancing weekly
- **High score table:** localStorage persistence (waves survived + peak oil price)

---

## 11. Constants Architecture

**Every single tunable value** must be declared in a clearly labeled constants block at the very top of the `<script>` section. Categories:

```
// === ECONOMY ===
STARTING_FUNDS, STARTING_OIL_PRICE, OIL_WIN_THRESHOLD, OIL_LOSE_THRESHOLD,
WAVE_INCOME_MULTIPLIER, ESCORT_KILL_BONUS, F35_KILL_BONUS,
OIL_SMALL_DESTROY, OIL_SMALL_ESCAPE, OIL_MED_DESTROY, OIL_MED_ESCAPE,
OIL_LARGE_DESTROY, OIL_LARGE_ESCAPE

// === WAVE SCALING ===
SETUP_PHASE_DURATION, TANKERS_PER_WAVE_MULTIPLIER, ESCORTS_PER_WAVE_DIVISOR,
F35_START_WAVE, F35_WAVE_DIVISOR, WAVE_SPEED_SCALING, WAVE_HP_SCALING,
STALEMATE_WAVE, UNLIMITED_TANKER_INCREMENT, UNLIMITED_ESCORT_INCREMENT, ...

// === PLAYER UNITS (per unit type) ===
UNIT_COST, UNIT_HP, UNIT_DPS, UNIT_RANGE, UNIT_COOLDOWN, UNIT_EVASION,
UNIT_SIGNATURE, UPGRADE_COST_MULTIPLIER, UPGRADE_TIER1_*, UPGRADE_TIER2_*

// === ENEMY UNITS ===
TANKER_SMALL_HP, TANKER_SMALL_SPEED, TANKER_MED_HP, ...
DESTROYER_HP, DESTROYER_DPS, DESTROYER_RANGE, ...
F35_HP, F35_DPS, F35_SPEED, ...
CRUISE_MISSILE_SPEED, CRUISE_MISSILE_RATE, CRUISE_MISSILE_SETUP_RATE_MULT, ...

// === F-14 SPECIAL ===
F14_KILLS_PER_CHARGE, F14_MAX_CHARGES, F14_COOLDOWN_SEC, F14_DAMAGE

// === PATROL / MOVEMENT ===
FAB_PATROL_RADIUS, FAB_PATROL_SPEED, MINE_PLACEMENT_RADIUS,
MINE_MAX_ACTIVE, MINE_RESPAWN_TIME, DRONE_STRIKES_BEFORE_DEPLETION, ...

// === AUDIO ===
MASTER_VOLUME, per-sound volume/frequency tuning

// === PATHS ===
PATH_UNLOCK_WAVES (array of wave numbers when new paths activate)
```

---

## 12. Implementation Order (single-file, zero regressions)

### Step 1: Scaffold
- Copy entire `hormuz-map.html` as base
- Insert `<canvas id="game-layer">` after `.map-layer`
- Add constants block (all values, no logic yet)
- Add game state object skeleton
- Add `requestAnimationFrame` loop (empty update/draw)
- **Test:** Map renders identically to `hormuz-map.html`. Canvas overlays without disrupting map. No visual regression.

### Step 2: Core Game Loop & Economy
- Implement phase state machine (Intro → Setup → Defend → Wave End → ...)
- Wave timer, phase transitions
- Oil price tracking, funds calculation
- Win/Lose/Stalemate detection
- Date display (March 1, 2026 + weekly)
- **Test:** Phase transitions work. Oil price updates correctly. Win/Lose/Stalemate triggers at correct thresholds. Economy math is correct.

### Step 3: Enemy Pathfinding & Spawning
- Implement primary TR-7 path following
- Tanker spawning (3 sizes) with HP/speed scaling
- Tankers follow path, escape at end → oil price drops
- Basic rendering of enemy ships on canvas
- **Test:** Tankers spawn, follow path, escape correctly. Oil price changes on escape. Different sizes have correct HP/speed.

### Step 4: Player Unit Placement & Basic Combat
- Implement placement validation (land/water/coast checks)
- All 6 unit types placeable with correct restrictions
- Basic attack logic: units fire at targets in range
- Projectile system
- Tanker destruction → oil price rises
- Keyboard and mouse placement
- **Test:** All units placeable only in valid zones. Units fire at enemies. Tankers can be destroyed. No placement on Arabian territory. Water units stay in water.

### Step 5: Escort Destroyers & Cruise Missiles
- Escort destroyers follow paths, fire at player units
- Cruise missile system with signature-based targeting
- SAM intercept logic (30% chance)
- Evasion mechanics per unit type
- Reduced cruise missile rate during Setup phase
- **Test:** Escorts attack correctly. Cruise missiles target by signature priority. SAMs intercept. Evasion works per unit type. Setup phase has lower missile rate.

### Step 6: F-35s, F-14 Strike, Mine Layer
- F-35 air units (appear wave 5+, target non-subs)
- F-14 special ability with charge buildup
- Mine layer two-step placement
- Mine detonation with splash damage
- FAB auto-patrol movement (with land collision avoidance)
- **Test:** F-35s appear on schedule, attack correctly, give bonus on kill. F-14 charges accumulate, strike works. Mines place and detonate. FABs patrol without crossing land.

### Step 7: Upgrades & Multi-Path
- Upgrade UI and mechanics for all unit types
- Tier 1 and Tier 2 effects
- Additional shipping paths (northern Qeshm, southern flanking)
- Path unlock at wave thresholds
- Enemy path assignment logic
- **Test:** Upgrades apply correct stat changes. Costs scale with tier. New paths appear at correct waves. Enemies use multiple paths.

### Step 8: UI Polish, Audio, & Final Integration
- Full HUD implementation
- Sidebar with buy list and upgrade panel
- Reference/instructions overlay
- All keyboard controls
- Full audio system (Web Audio API procedural sounds)
- Stalemate screen and continue logic
- High score persistence (localStorage)
- Visual polish: phosphor glow on all canvas elements, range circles, health bars
- **Test:** Full playthrough. All controls work. Audio plays. Stalemate at wave 20. Continue works. High scores persist.

### Step 9: Testing Harness & Balance Pass
- Embed in-console test suite (activated via hidden hotkey, e.g., Ctrl+T)
- Tests cover: placement validation, targeting specificity, economy math, upgrade effects, mine mechanics, wave scaling, path unlocking, win/lose/stalemate triggers
- Manual playthrough checklist for edge cases
- Balance tuning of all constants
- **Final regression check:** compare visual output against original `hormuz-map.html` — zero differences in map layer.

---

## 13. Testing Directive

The final HTML file must incorporate a comprehensive test suite covering every code path:

- Unit placement validation (land/water, SVG hit-testing)
- Targeting specificity (ships/aircraft, upgrade effects)
- Mine two-step boat pathing, respawn, and destruction
- Economy calculations (oil price proportionate to tanker size, funds = oil_price * 12)
- Wave progression (20 baseline + Stalemate + unlimited scaling)
- Collision, projectile, and damage logic
- Upgrade cost scaling and tier effects
- Input handling (pan, hotkeys, sidebar, instructions)
- Win/lose conditions (oil < 60, oil > 250)
- Stalemate at wave 20, continue option
- Water unit land-collision avoidance
- F-14 charge accumulation and activation
- Visual/audio fidelity and phosphor rendering
- **Regression from original hormuz-map.html: ZERO tolerance**

Tests run as in-browser console unit tests (assert functions, auto-run via hidden hotkey). Manual playthrough checklists for visual/interaction verification.
