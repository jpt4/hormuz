/**
 * Rebalancer
 * Maps balance signals to game constant adjustments.
 *
 * PRIORITY ORDER for unit adjustments:
 *   1. HP, DPS, cooldown (primary levers — direct combat effectiveness)
 *   2. Cost, upgrade price fractions (secondary — economy effects)
 *   3. Range (tertiary — affects map-scale relationships, change sparingly)
 *
 * All adjustments are subject to REALISM CONSTRAINTS that preserve
 * inter-unit relationships from the original game configuration.
 * Constraints are expressed as relative/proportional invariants wherever
 * possible, not absolute pixel values.
 */

'use strict';

// --- Unit stat keys for vm.runInContext injection ---
const UK = {
    cost:     i => `UNIT_DEFS[${i}].cost`,
    dps:      i => `UNIT_DEFS[${i}].dps`,
    range:    i => `UNIT_DEFS[${i}].range`,
    hp:       i => `UNIT_DEFS[${i}].hp`,
    cooldown: i => `UNIT_DEFS[${i}].cooldown`,
};

// Unit indices for readability
const SILKWORM = 0, SAM = 1, DRONE = 2, MINE_LAYER = 3, FAB = 4, SUB = 5;

// Default base values per unit (from initial game config)
const UNIT_DEFAULTS = [
    { cost: 250, dps: 55,  range: 700, hp: 400, cooldown: 2.5 },  // 0: Silkworm ASCM
    { cost: 150, dps: 15,  range: 600, hp: 200, cooldown: 1.2 },  // 1: SAM
    { cost: 45,  dps: 100, range: 850, hp: 60,  cooldown: 4.0 },  // 2: Drone
    { cost: 90,  dps: 250, range: 550, hp: 250, cooldown: 10.0 }, // 3: Mine Layer
    { cost: 55,  dps: 15,  range: 300, hp: 80,  cooldown: 1.0 },  // 4: FAB
    { cost: 300, dps: 70,  range: 450, hp: 180, cooldown: 2.2 },  // 5: Submarine
];

/**
 * REALISM CONSTRAINTS
 *
 * These encode inter-unit relationships that must hold regardless of
 * balance tuning. Expressed proportionally/relatively where possible.
 *
 * Each constraint: { check(overrides) → bool, description }
 * If check returns false, the proposed overrides violate realism.
 */
const REALISM_CONSTRAINTS = [
    // --- Cost ordering (military realism) ---
    {
        desc: 'ASCM batteries cost more than mines',
        check: o => getV(o, SILKWORM, 'cost') > getV(o, MINE_LAYER, 'cost'),
    },
    {
        desc: 'Submarines cost more than any other unit',
        check: o => {
            const subCost = getV(o, SUB, 'cost');
            for (let i = 0; i < 5; i++) if (getV(o, i, 'cost') >= subCost) return false;
            return true;
        },
    },
    {
        desc: 'Drones are the cheapest unit',
        check: o => {
            const droneCost = getV(o, DRONE, 'cost');
            for (let i = 0; i < 6; i++) if (i !== DRONE && getV(o, i, 'cost') <= droneCost) return false;
            return true;
        },
    },
    {
        desc: 'SAM costs more than FAB (larger fixed installation)',
        check: o => getV(o, SAM, 'cost') > getV(o, FAB, 'cost'),
    },

    // --- Speed/mobility (physical realism) ---
    // FAB patrol speed > Sub patrol speed (surface vs submerged) — encoded in patrolSpeed, not DPS
    // Not directly tunable here, but constraining proxy: FAB cooldown < Sub cooldown
    {
        desc: 'FAB fires faster than submarine (small fast boat vs torpedo reload)',
        check: o => getV(o, FAB, 'cooldown') < getV(o, SUB, 'cooldown'),
    },

    // --- Range ordering (weapon physics) ---
    {
        desc: 'Drone range >= ASCM range (loitering munition flies farther than coastal missile)',
        check: o => getV(o, DRONE, 'range') >= getV(o, SILKWORM, 'range'),
    },
    {
        desc: 'ASCM range > SAM range (anti-ship missile outranges SAM)',
        check: o => getV(o, SILKWORM, 'range') > getV(o, SAM, 'range'),
    },
    {
        desc: 'FAB has shortest range (small boat, close-quarters)',
        check: o => {
            const fabRange = getV(o, FAB, 'range');
            for (let i = 0; i < 6; i++) if (i !== FAB && getV(o, i, 'range') < fabRange) return false;
            return true;
        },
    },
    {
        // Destroyer range is 450px; player ranges should not ALL exceed it
        // At least FABs should need to get close
        desc: 'FAB range < destroyer range (300 vs 450 baseline — must close distance)',
        check: o => getV(o, FAB, 'range') < 450,
    },

    // --- Range not trivially infinite ---
    {
        desc: 'No unit range exceeds 60% of map width (2400px)',
        check: o => {
            for (let i = 0; i < 6; i++) if (getV(o, i, 'range') > 0.6 * 2400) return false;
            return true;
        },
    },

    // --- Splash/detonation proportionality ---
    // Mine splash > drone splash (naval mine vs small munition)
    // Encoded as constants MINE_SPLASH_RADIUS > DRONE_SPLASH_RADIUS
    // If we expose these, add constraint. For now, not tuned.

    // --- HP proportionality ---
    {
        desc: 'ASCM battery HP > SAM HP (hardened coastal installation)',
        check: o => getV(o, SILKWORM, 'hp') > getV(o, SAM, 'hp'),
    },
    {
        desc: 'Drones are fragile (lowest HP)',
        check: o => {
            const droneHp = getV(o, DRONE, 'hp');
            for (let i = 0; i < 6; i++) if (i !== DRONE && getV(o, i, 'hp') <= droneHp) return false;
            return true;
        },
    },
    {
        desc: 'Mine layer HP > FAB HP (larger vessel)',
        check: o => getV(o, MINE_LAYER, 'hp') > getV(o, FAB, 'hp'),
    },

    // --- DPS proportionality ---
    {
        desc: 'Mine layer has highest per-hit damage (naval mine detonation)',
        check: o => {
            const mlDps = getV(o, MINE_LAYER, 'dps');
            for (let i = 0; i < 6; i++) if (i !== MINE_LAYER && getV(o, i, 'dps') > mlDps) return false;
            return true;
        },
    },
    {
        desc: 'Drone DPS > ASCM DPS (loitering munition is a direct strike)',
        check: o => getV(o, DRONE, 'dps') > getV(o, SILKWORM, 'dps'),
    },
];

/** Helper: get unit stat value from overrides or defaults */
function getV(overrides, unitIndex, prop) {
    const key = UK[prop](unitIndex);
    return overrides[key] !== undefined ? overrides[key] : UNIT_DEFAULTS[unitIndex][prop];
}

function setV(overrides, unitIndex, prop, value) {
    const key = UK[prop](unitIndex);
    if (prop === 'cooldown') {
        overrides[key] = Math.round(value * 10) / 10;
    } else {
        overrides[key] = Math.round(value);
    }
}

/**
 * Check all realism constraints. Returns list of violated constraints.
 */
function checkConstraints(overrides) {
    return REALISM_CONSTRAINTS.filter(c => !c.check(overrides));
}

/**
 * Revert adjustments that violate realism constraints.
 * If a proposed override set violates constraints, roll back the offending
 * changes one at a time until all constraints pass.
 */
function enforceConstraints(proposed, previous) {
    let current = { ...proposed };
    let violations = checkConstraints(current);

    // Iteratively revert most-recent changes until constraints pass
    const changedKeys = Object.keys(proposed).filter(k =>
        proposed[k] !== previous[k]
    );

    let maxIter = changedKeys.length;
    while (violations.length > 0 && maxIter-- > 0) {
        // Revert the last changed key and re-check
        const revertKey = changedKeys.pop();
        if (revertKey && previous[revertKey] !== undefined) {
            current[revertKey] = previous[revertKey];
        } else if (revertKey) {
            delete current[revertKey];
        }
        violations = checkConstraints(current);
    }

    return current;
}

class Rebalancer {
    constructor() {}

    /**
     * Apply balance signals to produce adjusted constants.
     * Priority: HP/DPS/cooldown first, cost second, range last.
     * All results validated against realism constraints.
     */
    applySignals(signals, currentOverrides = {}) {
        const adj = { ...currentOverrides };

        for (const signal of signals) {
            switch (signal.type) {
                case 'UNDERPOWERED': {
                    const i = signal.unitIndex;
                    // Primary: buff DPS +10%, HP +8%, cooldown -10%
                    setV(adj, i, 'dps', getV(adj, i, 'dps') * 1.10);
                    setV(adj, i, 'hp', getV(adj, i, 'hp') * 1.08);
                    setV(adj, i, 'cooldown', getV(adj, i, 'cooldown') * 0.90);
                    // Secondary: reduce cost -5%
                    setV(adj, i, 'cost', getV(adj, i, 'cost') * 0.95);
                    break;
                }

                case 'ESSENTIAL_OR_OP': {
                    const i = signal.unitIndex;
                    // Primary: nerf DPS -8%, cooldown +10%
                    setV(adj, i, 'dps', getV(adj, i, 'dps') * 0.92);
                    setV(adj, i, 'cooldown', getV(adj, i, 'cooldown') * 1.10);
                    break;
                }

                case 'DOMINANT': {
                    const i = signal.unitIndex;
                    // Strong nerf: DPS -12%, HP -10%, cooldown +15%
                    setV(adj, i, 'dps', getV(adj, i, 'dps') * 0.88);
                    setV(adj, i, 'hp', getV(adj, i, 'hp') * 0.90);
                    setV(adj, i, 'cooldown', getV(adj, i, 'cooldown') * 1.15);
                    break;
                }

                case 'TOO_EASY':
                    adj['WAVE_HP_SCALING'] = (adj['WAVE_HP_SCALING'] || 0.08) + 0.01;
                    adj['WAVE_SPEED_SCALING'] = (adj['WAVE_SPEED_SCALING'] || 0.06) + 0.005;
                    adj['CRUISE_MISSILE_BASE_RATE'] = (adj['CRUISE_MISSILE_BASE_RATE'] || 0.05) + 0.005;
                    break;

                case 'TOO_HARD':
                    adj['WAVE_HP_SCALING'] = Math.max(0.02, (adj['WAVE_HP_SCALING'] || 0.08) - 0.01);
                    adj['WAVE_SPEED_SCALING'] = Math.max(0.02, (adj['WAVE_SPEED_SCALING'] || 0.06) - 0.005);
                    adj['WAVE_INCOME_BASE'] = (adj['WAVE_INCOME_BASE'] || 5) + 1;
                    // Buff all player units slightly: +5% HP
                    for (let i = 0; i < 6; i++) {
                        setV(adj, i, 'hp', getV(adj, i, 'hp') * 1.05);
                    }
                    // Lower per-tier fractions so upgrades stay affordable
                    const f1 = typeof adj['UPGRADE_COST_FRACTION_TIER1'] === 'number'
                        ? adj['UPGRADE_COST_FRACTION_TIER1'] : 0.32;
                    const f2 = typeof adj['UPGRADE_COST_FRACTION_TIER2'] === 'number'
                        ? adj['UPGRADE_COST_FRACTION_TIER2'] : 0.38;
                    adj['UPGRADE_COST_FRACTION_TIER1'] = Math.max(0.12, f1 - 0.03);
                    adj['UPGRADE_COST_FRACTION_TIER2'] = Math.max(0.15, f2 - 0.03);
                    break;

                case 'LOW_DIVERSITY': {
                    // Compress DPS spread: buff weak, nerf strong (by DPS)
                    const dpsValues = [];
                    for (let i = 0; i < 6; i++) dpsValues.push(getV(adj, i, 'dps'));
                    const sorted = [...dpsValues].sort((a, b) => a - b);
                    const median = sorted[3];
                    for (let i = 0; i < 6; i++) {
                        if (dpsValues[i] < median * 0.5) {
                            setV(adj, i, 'dps', getV(adj, i, 'dps') * 1.08);
                            setV(adj, i, 'cooldown', getV(adj, i, 'cooldown') * 0.95);
                        } else if (dpsValues[i] > median * 2.0) {
                            setV(adj, i, 'cooldown', getV(adj, i, 'cooldown') * 1.05);
                        }
                    }
                    break;
                }
            }
        }

        // Enforce realism constraints — revert any adjustments that break invariants
        const constrained = enforceConstraints(adj, currentOverrides);

        const violations = checkConstraints(constrained);
        if (violations.length > 0) {
            console.warn('WARNING: Realism constraint violations remain:');
            for (const v of violations) console.warn(`  - ${v.desc}`);
        }

        return constrained;
    }

    isBalanced(analysis) {
        return analysis.summary.balanced;
    }
}

module.exports = { Rebalancer, checkConstraints, REALISM_CONSTRAINTS, UNIT_DEFAULTS };
