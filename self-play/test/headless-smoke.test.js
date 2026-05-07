/**
 * Bounded headless-engine smoke tests.
 *
 * Loads the full game script from hormuz-game.html inside a VM (same path as
 * evolution). This is heavier than pure unit tests; keep cases small so `npm test`
 * stays a fast gate. Full tick-level regression lives in `npm run test:extended`.
 */

'use strict';

const path = require('path');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createSimulation } = require('../headless-engine');

const GAME_HTML = path.join(__dirname, '..', '..', 'hormuz-game.html');

describe('headless-engine', () => {
    test('createSimulation initializes exported game module', () => {
        const sim = createSimulation({ seed: 1, gamePath: GAME_HTML });
        assert.ok(sim.game);
        assert.ok(sim.game.GameState);
        assert.ok(sim.game.Entities);
    });

    test('startGame reaches observable setup state', () => {
        const sim = createSimulation({ seed: 2, gamePath: GAME_HTML });
        sim.startGame();
        const obs = sim.getObservation();
        assert.equal(obs.phase, 'setup');
        assert.equal(obs.wave, 1);
        assert.ok(obs.funds > 0);
    });

    test('step advances time without throwing', () => {
        const sim = createSimulation({ seed: 3, gamePath: GAME_HTML });
        sim.startGame();
        for (let i = 0; i < 50; i++) {
            sim.step();
        }
        const obs = sim.getObservation();
        assert.ok(typeof obs.setupTimeRemaining === 'number');
    });
});
