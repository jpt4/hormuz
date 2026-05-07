/**
 * Contract tests for SeededRNG (xoshiro128** implementation).
 *
 * The self-play pipeline depends on bitwise-correct, deterministic behavior across
 * Node versions and replays. These checks guard against accidental refactors that
 * break repeatability of evolution runs and balance experiments.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { SeededRNG } = require('../prng');

describe('SeededRNG', () => {
    test('same seed yields identical first 10 draws', () => {
        const a = new SeededRNG(424242);
        const b = new SeededRNG(424242);
        for (let i = 0; i < 10; i++) {
            assert.equal(a.next(), b.next(), `draw ${i}`);
        }
    });

    test('next() returns values in [0, 1)', () => {
        const rng = new SeededRNG(1);
        for (let i = 0; i < 500; i++) {
            const x = rng.next();
            assert.ok(x >= 0 && x < 1, `out of range at i=${i}: ${x}`);
        }
    });

    test('nextInt(max) stays within [0, max)', () => {
        const rng = new SeededRNG(99);
        for (let i = 0; i < 200; i++) {
            const max = 1 + rng.nextInt(50);
            const v = rng.nextInt(max);
            assert.ok(v >= 0 && v < max, `nextInt(${max}) -> ${v}`);
        }
    });

    test('state round-trip preserves stream', () => {
        const rng = new SeededRNG(777);
        const pre = [rng.next(), rng.next(), rng.next()];
        const saved = rng.state();
        const restored = SeededRNG.fromState(saved);
        const post = [restored.next(), restored.next(), restored.next()];
        const fresh = new SeededRNG(777);
        fresh.next();
        fresh.next();
        fresh.next();
        assert.deepEqual(post, [fresh.next(), fresh.next(), fresh.next()]);
        // Original rng continued from saved point
        rng.next();
        assert.equal(rng.next(), post[1]);
    });

    test('fork() produces divergent streams', () => {
        const parent = new SeededRNG(1000);
        parent.next();
        const child = parent.fork();
        const a = parent.next();
        const b = child.next();
        assert.notEqual(a, b);
    });
});
