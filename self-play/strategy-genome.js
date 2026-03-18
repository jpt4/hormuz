/**
 * Strategy Genome
 * Encodes a complete tower defense strategy as an evolvable data structure.
 * ~150 genes covering unit preferences, placement zones, upgrade policy,
 * wave-phase adaptation, and F-14 usage.
 */

'use strict';

const { SeededRNG } = require('./prng');

// Known good placement zones (normalized 0-1 coords) for bootstrapping
const KNOWN_LAND_ZONES = [
    { x: 0.25, y: 0.15 },  // Iranian coast west
    { x: 0.35, y: 0.22 },  // Near Bandar Abbas
    { x: 0.52, y: 0.22 },  // East of Bandar Abbas
    { x: 0.45, y: 0.28 },  // Mid-coast
    { x: 0.70, y: 0.20 },  // Eastern Iran coast
];

const KNOWN_WATER_ZONES = [
    { x: 0.50, y: 0.40 },  // Central strait
    { x: 0.40, y: 0.50 },  // Persian Gulf approach
    { x: 0.60, y: 0.50 },  // Gulf of Oman side
    { x: 0.55, y: 0.35 },  // Near Qeshm
];

const KNOWN_COAST_ZONES = [
    { x: 0.40, y: 0.32 },  // Iran southern coast edge
    { x: 0.52, y: 0.26 },  // Near strait narrows
    { x: 0.32, y: 0.35 },  // West coast
];

// Unit placement types
const UNIT_PLACEMENT_TYPES = ['land', 'land', 'land', 'coast', 'water', 'water'];

/**
 * Create a random genome
 */
function randomGenome(rng) {
    const genome = {
        // Unit preference weights (6 floats, 0-1)
        unitWeights: Array.from({ length: 6 }, () => rng.next()),

        // Wave-phase modifiers
        earlyMod: Array.from({ length: 6 }, () => 0.5 + rng.next()),
        midMod: Array.from({ length: 6 }, () => 0.5 + rng.next()),
        lateMod: Array.from({ length: 6 }, () => 0.5 + rng.next()),

        // Phase transition wave numbers
        phaseShiftWave: 4 + rng.nextInt(8),   // 4-11
        lateGameWave: 12 + rng.nextInt(8),     // 12-19

        // Economy
        upgradePropensity: rng.next(),         // 0-1
        savingsThreshold: rng.next() * 0.5,    // 0-0.5

        // Placement zones per unit type
        placements: [],

        // Upgrade priority ordering
        upgradeOrder: shuffleArray([0, 1, 2, 3, 4, 5], rng),

        // F-14 policy
        f14TriggerWave: 3 + rng.nextInt(8),    // 3-10
        f14MinEnemies: 2 + rng.nextInt(8),     // 2-9
        f14SaveCharges: rng.next() > 0.7,
    };

    // Generate placement zones per unit type
    for (let t = 0; t < 6; t++) {
        const placementType = UNIT_PLACEMENT_TYPES[t];
        const knownZones = placementType === 'land' ? KNOWN_LAND_ZONES
            : placementType === 'water' ? KNOWN_WATER_ZONES
            : KNOWN_COAST_ZONES;

        const numZones = 1 + rng.nextInt(3); // 1-3 zones per type
        const zones = [];
        for (let i = 0; i < numZones; i++) {
            // Start from a known zone and perturb
            const base = knownZones[rng.nextInt(knownZones.length)];
            zones.push({
                x: clamp(base.x + (rng.next() - 0.5) * 0.2, 0, 1),
                y: clamp(base.y + (rng.next() - 0.5) * 0.2, 0, 1),
                spread: 0.03 + rng.next() * 0.12,
            });
        }
        genome.placements.push(zones);
    }

    return genome;
}

/**
 * Create a hand-designed seed strategy
 */
function seedGenome(archetype, rng) {
    const g = randomGenome(rng);

    switch (archetype) {
        case 'balanced':
            g.unitWeights = [0.7, 0.6, 0.5, 0.4, 0.5, 0.6];
            g.upgradePropensity = 0.4;
            break;

        case 'drone-swarm':
            g.unitWeights = [0.2, 0.3, 1.0, 0.2, 0.3, 0.1];
            g.upgradePropensity = 0.2;
            g.savingsThreshold = 0.1;
            break;

        case 'fortress':
            g.unitWeights = [1.0, 0.8, 0.3, 0.4, 0.1, 0.1];
            g.upgradePropensity = 0.6;
            break;

        case 'naval':
            g.unitWeights = [0.2, 0.3, 0.2, 0.7, 0.8, 1.0];
            g.upgradePropensity = 0.5;
            break;

        case 'mine-field':
            g.unitWeights = [0.3, 0.4, 0.3, 1.0, 0.3, 0.3];
            g.upgradePropensity = 0.5;
            break;

        case 'sub-heavy':
            g.unitWeights = [0.2, 0.5, 0.2, 0.3, 0.2, 1.0];
            g.upgradePropensity = 0.3;
            g.savingsThreshold = 0.3;
            break;

        case 'sam-wall':
            g.unitWeights = [0.4, 1.0, 0.5, 0.3, 0.3, 0.3];
            g.upgradePropensity = 0.6;
            break;

        case 'fast-attack':
            g.unitWeights = [0.2, 0.3, 0.7, 0.3, 1.0, 0.3];
            g.upgradePropensity = 0.3;
            g.savingsThreshold = 0.1;
            break;
    }

    return g;
}

/**
 * Mutate a genome
 */
function mutate(genome, rng, rate = 0.15, magnitude = 0.15) {
    const g = deepClone(genome);

    // Float genes: Gaussian perturbation
    const floatArrayKeys = ['unitWeights', 'earlyMod', 'midMod', 'lateMod'];
    for (const key of floatArrayKeys) {
        for (let i = 0; i < g[key].length; i++) {
            if (rng.next() < rate) {
                g[key][i] = clamp(g[key][i] + rng.nextGaussian() * magnitude, 0, 2);
            }
        }
    }

    // Scalar float genes
    if (rng.next() < rate) g.upgradePropensity = clamp(g.upgradePropensity + rng.nextGaussian() * magnitude, 0, 1);
    if (rng.next() < rate) g.savingsThreshold = clamp(g.savingsThreshold + rng.nextGaussian() * magnitude * 0.5, 0, 0.8);

    // Integer genes
    if (rng.next() < rate) g.phaseShiftWave = clamp(g.phaseShiftWave + (rng.next() > 0.5 ? 1 : -1), 2, 15);
    if (rng.next() < rate) g.lateGameWave = clamp(g.lateGameWave + (rng.next() > 0.5 ? 1 : -1), 8, 20);

    // F-14 genes
    if (rng.next() < rate) g.f14TriggerWave = clamp(g.f14TriggerWave + (rng.next() > 0.5 ? 1 : -1), 1, 15);
    if (rng.next() < rate) g.f14MinEnemies = clamp(g.f14MinEnemies + (rng.next() > 0.5 ? 1 : -1), 1, 15);
    if (rng.next() < rate * 0.5) g.f14SaveCharges = !g.f14SaveCharges;

    // Placement zones: perturb, add, or remove
    for (let t = 0; t < 6; t++) {
        // Perturb existing zones
        for (const zone of g.placements[t]) {
            if (rng.next() < rate) zone.x = clamp(zone.x + rng.nextGaussian() * magnitude * 0.3, 0, 1);
            if (rng.next() < rate) zone.y = clamp(zone.y + rng.nextGaussian() * magnitude * 0.3, 0, 1);
            if (rng.next() < rate) zone.spread = clamp(zone.spread + rng.nextGaussian() * 0.02, 0.01, 0.25);
        }
        // Add a zone
        if (rng.next() < rate * 0.3 && g.placements[t].length < 5) {
            g.placements[t].push({
                x: rng.next(),
                y: rng.next(),
                spread: 0.03 + rng.next() * 0.12,
            });
        }
        // Remove a zone
        if (rng.next() < rate * 0.2 && g.placements[t].length > 1) {
            g.placements[t].splice(rng.nextInt(g.placements[t].length), 1);
        }
    }

    // Upgrade order: swap adjacent elements
    if (rng.next() < rate) {
        const i = rng.nextInt(5);
        [g.upgradeOrder[i], g.upgradeOrder[i + 1]] = [g.upgradeOrder[i + 1], g.upgradeOrder[i]];
    }

    return g;
}

/**
 * Crossover two genomes
 */
function crossover(parentA, parentB, rng) {
    const child = deepClone(parentA);

    // Per-element uniform crossover for arrays
    const arrayKeys = ['unitWeights', 'earlyMod', 'midMod', 'lateMod'];
    for (const key of arrayKeys) {
        for (let i = 0; i < child[key].length; i++) {
            if (rng.next() < 0.5) child[key][i] = parentB[key][i];
        }
    }

    // Scalar crossover
    if (rng.next() < 0.5) child.upgradePropensity = parentB.upgradePropensity;
    if (rng.next() < 0.5) child.savingsThreshold = parentB.savingsThreshold;
    if (rng.next() < 0.5) child.phaseShiftWave = parentB.phaseShiftWave;
    if (rng.next() < 0.5) child.lateGameWave = parentB.lateGameWave;
    if (rng.next() < 0.5) child.f14TriggerWave = parentB.f14TriggerWave;
    if (rng.next() < 0.5) child.f14MinEnemies = parentB.f14MinEnemies;
    if (rng.next() < 0.5) child.f14SaveCharges = parentB.f14SaveCharges;

    // Placement: per-type from one parent
    for (let t = 0; t < 6; t++) {
        if (rng.next() < 0.5) child.placements[t] = deepClone(parentB.placements[t]);
    }

    // Upgrade order from one parent
    if (rng.next() < 0.5) child.upgradeOrder = [...parentB.upgradeOrder];

    return child;
}

// --- Utilities ---

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function shuffleArray(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

module.exports = {
    randomGenome,
    seedGenome,
    mutate,
    crossover,
    deepClone,
    UNIT_PLACEMENT_TYPES,
};
