/**
 * Seedable PRNG — xoshiro128** algorithm.
 * Fast, well-distributed, 128-bit state, seedable from integer seed.
 * Used to replace Math.random() for deterministic game simulation.
 */

'use strict';

class SeededRNG {
    constructor(seed) {
        // Initialize state via splitmix32 from seed
        this.s = new Uint32Array(4);
        let s = seed >>> 0;
        for (let i = 0; i < 4; i++) {
            s = (s + 0x9e3779b9) >>> 0;
            let z = s;
            z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
            z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
            z = (z ^ (z >>> 16)) >>> 0;
            this.s[i] = z;
        }
        // Ensure non-zero state
        if (this.s[0] === 0 && this.s[1] === 0 && this.s[2] === 0 && this.s[3] === 0) {
            this.s[0] = 1;
        }
    }

    /** Returns float in [0, 1) */
    next() {
        const s = this.s;
        const result = Math.imul(s[1] * 5, 1 << 7 | 1) >>> 0;
        const rotl = ((result << 7) | (result >>> 25)) >>> 0;

        const t = (s[1] << 9) >>> 0;

        s[2] = (s[2] ^ s[0]) >>> 0;
        s[3] = (s[3] ^ s[1]) >>> 0;
        s[1] = (s[1] ^ s[2]) >>> 0;
        s[0] = (s[0] ^ s[3]) >>> 0;

        s[2] = (s[2] ^ t) >>> 0;

        // Rotate s[3]
        s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;

        return (rotl >>> 0) / 4294967296;
    }

    /** Returns integer in [0, max) */
    nextInt(max) {
        return Math.floor(this.next() * max);
    }

    /** Gaussian random using Box-Muller */
    nextGaussian() {
        const u1 = this.next();
        const u2 = this.next();
        return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
    }

    /** Create a child RNG with deterministic state derived from current */
    fork() {
        const child = new SeededRNG(0);
        child.s[0] = this.s[0] ^ 0xdeadbeef;
        child.s[1] = this.s[1] ^ 0xcafebabe;
        child.s[2] = this.s[2] ^ 0x12345678;
        child.s[3] = this.s[3] ^ 0x87654321;
        // Advance parent to prevent correlation
        this.next();
        this.next();
        return child;
    }

    /** Serialize state for replay */
    state() {
        return Array.from(this.s);
    }

    /** Restore from serialized state */
    static fromState(arr) {
        const rng = new SeededRNG(0);
        rng.s[0] = arr[0] >>> 0;
        rng.s[1] = arr[1] >>> 0;
        rng.s[2] = arr[2] >>> 0;
        rng.s[3] = arr[3] >>> 0;
        return rng;
    }
}

module.exports = { SeededRNG };
