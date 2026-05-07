/**
 * Tests for strategy genome encoding used by evolutionary self-play.
 *
 * Genomes must remain structurally valid for AutoPlayer: fixed array lengths,
 * normalized coordinates, and valid integer ranges so mutation/crossover cannot
 * produce states the player logic cannot interpret.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    randomGenome,
    seedGenome,
    mutate,
    crossover,
    deepClone,
    UNIT_PLACEMENT_TYPES,
} = require('../strategy-genome');
const { SeededRNG } = require('../prng');

function assertGenomeShape(g) {
    assert.equal(g.unitWeights.length, 6);
    assert.equal(g.earlyMod.length, 6);
    assert.equal(g.midMod.length, 6);
    assert.equal(g.lateMod.length, 6);
    assert.equal(g.placements.length, 6);
    for (let t = 0; t < 6; t++) {
        assert.ok(g.placements[t].length >= 1 && g.placements[t].length <= 5);
        for (const z of g.placements[t]) {
            assert.ok(z.x >= 0 && z.x <= 1);
            assert.ok(z.y >= 0 && z.y <= 1);
            assert.ok(z.spread >= 0.01 && z.spread <= 0.25);
        }
    }
    assert.equal(new Set(g.upgradeOrder).size, 6);
}

describe('strategy-genome', () => {
    test('UNIT_PLACEMENT_TYPES matches six unit defs', () => {
        assert.equal(UNIT_PLACEMENT_TYPES.length, 6);
    });

    test('randomGenome produces well-formed structure', () => {
        const rng = new SeededRNG(314159);
        const g = randomGenome(rng);
        assertGenomeShape(g);
        assert.ok(g.phaseShiftWave >= 4 && g.phaseShiftWave <= 11);
        assert.ok(g.lateGameWave >= 12 && g.lateGameWave <= 19);
    });

    test('seedGenome preserves archetype-specific weight bias', () => {
        const rng = new SeededRNG(1);
        const drone = seedGenome('drone-swarm', rng);
        assert.ok(drone.unitWeights[2] >= drone.unitWeights[0]);
        const fort = seedGenome('fortress', new SeededRNG(2));
        assert.ok(fort.unitWeights[0] >= 0.9);
    });

    test('mutate returns modified clone; original unchanged', () => {
        const rng = new SeededRNG(42);
        const base = randomGenome(rng);
        const snap = JSON.stringify(base);
        const m = mutate(base, new SeededRNG(43), 0.5, 0.2);
        assertGenomeShape(m);
        assert.equal(JSON.stringify(base), snap);
    });

    test('crossover produces child with valid shape', () => {
        const rng = new SeededRNG(100);
        const a = randomGenome(new SeededRNG(1));
        const b = randomGenome(new SeededRNG(2));
        const c = crossover(a, b, rng);
        assertGenomeShape(c);
    });

    test('deepClone is independent copy', () => {
        const g = randomGenome(new SeededRNG(5));
        const c = deepClone(g);
        c.unitWeights[0] = -999;
        assert.notEqual(g.unitWeights[0], -999);
    });
});
