/**
 * Fitness function regression tests.
 *
 * computeFitness drives selection pressure in evolution.js. These synthetic traces
 * ensure outcome breakpoints and monotonicity assumptions stay intact when the
 * formula is tuned.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeFitness, MAX_SHANNON } = require('../fitness');

function minimalMetrics(overrides = {}) {
    return {
        shannonDiversity: 0,
        unitTypesUsed: 1,
        placementCounts: [0, 0, 0, 0, 0, 0],
        totalPlacements: 0,
        totalUpgrades: 0,
        upgradeCounts: [0, 0, 0, 0, 0, 0],
        f14Uses: 0,
        avgFunds: 0,
        ...overrides,
    };
}

describe('computeFitness', () => {
    test('victory scores higher than defeat at same wave', () => {
        const base = { finalWave: 5, finalOil: 100, metrics: minimalMetrics() };
        const win = computeFitness({ ...base, outcome: 'victory' });
        const lose = computeFitness({ ...base, outcome: 'defeat' });
        assert.ok(win > lose);
    });

    test('later defeat yields higher fitness than early defeat', () => {
        const m = minimalMetrics();
        const early = computeFitness({ outcome: 'defeat', finalWave: 2, metrics: m });
        const late = computeFitness({ outcome: 'defeat', finalWave: 15, metrics: m });
        assert.ok(late > early);
    });

    test('full Shannon diversity adds more than zero diversity', () => {
        const low = minimalMetrics({ shannonDiversity: 0 });
        const high = minimalMetrics({ shannonDiversity: MAX_SHANNON });
        const fLow = computeFitness({ outcome: 'stalemate', finalWave: 10, metrics: low });
        const fHigh = computeFitness({ outcome: 'stalemate', finalWave: 10, metrics: high });
        assert.ok(fHigh > fLow);
    });
});
