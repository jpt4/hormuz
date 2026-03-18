/**
 * Auto-Player
 * Translates a strategy genome into concrete game actions.
 * Called once per setup phase to decide what to buy/upgrade,
 * and queried during defend phase for F-14 decisions.
 */

'use strict';

const { UNIT_PLACEMENT_TYPES } = require('./strategy-genome');

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1680;

class AutoPlayer {
    constructor(genome, rng) {
        this.genome = genome;
        this.rng = rng;
    }

    /**
     * Decide what actions to take at the start of a setup phase.
     * Returns an array of action objects: { type: 'place'|'upgrade', ... }
     */
    decide(observation, sim) {
        const actions = [];
        const g = this.genome;

        // Determine game phase modifiers
        const waveMod = this.getWaveModifiers(observation.wave);

        // Compute effective weights
        const weights = g.unitWeights.map((w, i) => Math.max(0, w * waveMod[i]));

        // Budget: funds minus savings reserve
        const reserve = g.savingsThreshold * 500;
        let availableFunds = observation.funds - reserve;

        // Upgrade existing units first (if propensity says so)
        if (this.rng.next() < g.upgradePropensity && observation.playerUnits.length > 0) {
            const upgradeActions = this.planUpgrades(observation, availableFunds, sim);
            for (const action of upgradeActions) {
                actions.push(action);
                availableFunds -= action.cost;
            }
        }

        // Buy new units with remaining budget
        const unitDefs = sim.getUnitDefs();
        let attempts = 0;
        const maxAttempts = 50; // prevent infinite loops

        while (availableFunds > 0 && attempts < maxAttempts) {
            attempts++;

            // Pick unit type by weighted random
            const unitType = this.pickUnitType(weights, availableFunds, unitDefs);
            if (unitType === -1) break; // nothing affordable

            // Find valid position
            const position = this.pickPosition(unitType, unitDefs[unitType], sim);
            if (!position) {
                // Can't find placement for this type, reduce its weight temporarily
                weights[unitType] *= 0.1;
                continue;
            }

            actions.push({ type: 'place', unitType, x: position.x, y: position.y });
            availableFunds -= unitDefs[unitType].cost;
        }

        return actions;
    }

    /**
     * Check if F-14 should be activated during defend phase.
     */
    shouldF14(observation) {
        const g = this.genome;

        if (observation.f14Charges <= 0) return false;
        if (observation.f14Cooldown > 0) return false;
        if (observation.wave < g.f14TriggerWave) return false;
        if (observation.enemies.length < g.f14MinEnemies) return false;

        // If saving charges, only use when at max
        if (g.f14SaveCharges && observation.f14Charges < 3) return false;

        return true;
    }

    /**
     * Get wave-phase modifiers for unit weights
     */
    getWaveModifiers(wave) {
        const g = this.genome;
        if (wave < g.phaseShiftWave) return g.earlyMod;
        if (wave < g.lateGameWave) return g.midMod;
        return g.lateMod;
    }

    /**
     * Pick a unit type using weighted random selection, constrained by budget
     */
    pickUnitType(weights, budget, unitDefs) {
        // Filter to affordable units
        const affordable = [];
        let totalWeight = 0;
        for (let i = 0; i < 6; i++) {
            if (unitDefs[i].cost <= budget && weights[i] > 0) {
                affordable.push({ idx: i, weight: weights[i] });
                totalWeight += weights[i];
            }
        }

        if (affordable.length === 0 || totalWeight === 0) return -1;

        // Weighted random selection
        let roll = this.rng.next() * totalWeight;
        for (const { idx, weight } of affordable) {
            roll -= weight;
            if (roll <= 0) return idx;
        }
        return affordable[affordable.length - 1].idx;
    }

    /**
     * Find a valid placement position for a given unit type
     */
    pickPosition(unitType, unitDef, sim) {
        const zones = this.genome.placements[unitType];

        // Try each preferred zone in order
        for (const zone of zones) {
            for (let attempt = 0; attempt < 15; attempt++) {
                const x = (zone.x + (this.rng.next() - 0.5) * zone.spread * 2) * MAP_WIDTH;
                const y = (zone.y + (this.rng.next() - 0.5) * zone.spread * 2) * MAP_HEIGHT;

                const check = sim.validatePlacement(unitDef, x, y);
                if (check.valid) return { x, y };
            }
        }

        // Fallback: random valid position
        for (let attempt = 0; attempt < 100; attempt++) {
            const x = this.rng.next() * MAP_WIDTH;
            const y = this.rng.next() * MAP_HEIGHT;
            const check = sim.validatePlacement(unitDef, x, y);
            if (check.valid) return { x, y };
        }

        return null;
    }

    /**
     * Plan upgrades for existing units
     */
    planUpgrades(observation, budget, sim) {
        const actions = [];
        const g = this.genome;
        const unitDefs = sim.getUnitDefs();

        // Sort existing units by upgrade priority
        const candidates = observation.playerUnits
            .map((u, idx) => ({
                ...u,
                ref: sim.game.Entities.playerUnits[idx],
                priorityRank: g.upgradeOrder.indexOf(u.defId),
            }))
            .filter(u => {
                // Can this unit be upgraded?
                const def = unitDefs[u.defId];
                return u.tier < def.upgrades.length;
            })
            .sort((a, b) => a.priorityRank - b.priorityRank);

        let remaining = budget;
        for (const candidate of candidates) {
            const def = unitDefs[candidate.defId];
            const cost = Math.round(def.cost * Math.pow(1.4, candidate.tier + 1));

            if (cost <= remaining) {
                actions.push({
                    type: 'upgrade',
                    unit: candidate.ref,
                    cost,
                });
                remaining -= cost;
            }
        }

        return actions;
    }
}

module.exports = AutoPlayer;
