#!/usr/bin/env node
/**
 * Full convoy balance analysis (master @ standard difficulty).
 *
 * Combines:
 *   - Deterministic balance sheet (self-play/convoy-balance-sheet.js)
 *   - Monte Carlo headless self-play (random auto-player genomes)
 *
 *   node self-play/convoy-balance-analysis.js
 *   node self-play/convoy-balance-analysis.js --sheet-only
 *   node self-play/convoy-balance-analysis.js --mc-only --mc=40
 *   node self-play/convoy-balance-analysis.js WAVE_HP_SCALING=0.10
 */

'use strict';

const { createSimulation } = require('./headless-engine');
const AutoPlayer = require('./auto-player');
const { randomGenome } = require('./strategy-genome');
const { SeededRNG } = require('./prng');
const {
    runBalanceSheet,
    printBalanceSheet,
    CONST,
    TUNING,
} = require('./convoy-balance-sheet');

function parseArgs(argv) {
    const opts = { sheetOnly: false, mcOnly: false, mcRuns: 40, overrides: [] };
    for (const arg of argv) {
        if (arg === '--sheet-only') opts.sheetOnly = true;
        else if (arg === '--mc-only') opts.mcOnly = true;
        else if (arg.startsWith('--mc=')) opts.mcRuns = Math.max(1, Number(arg.slice(5)) || 40);
        else opts.overrides.push(arg);
    }
    return opts;
}

function runMonteCarlo(n = 40) {
    const outcomes = { victory: 0, defeat: 0, stalemate: 0, other: 0 };
    const finalOils = [];
    const finalWaves = [];

    for (let s = 0; s < n; s++) {
        const sim = createSimulation({ seed: 1000 + s });
        const rng = new SeededRNG(2000 + s);
        const player = new AutoPlayer(randomGenome(rng), rng);
        const trace = sim.runGame(player);
        const outcome = trace.outcome || 'other';
        outcomes[outcome] = (outcomes[outcome] || 0) + 1;
        finalOils.push(trace.finalOil);
        finalWaves.push(trace.finalWave);
    }

    return { outcomes, finalOils, finalWaves, n };
}

function printMonteCarlo(mc) {
    console.log('\n=== MONTE CARLO SELF-PLAY (random auto-player genomes) ===\n');
    console.log(`Runs: ${mc.n} | standard difficulty`);
    console.log('Outcomes:', mc.outcomes);

    const avgOil = mc.finalOils.reduce((a, b) => a + b, 0) / mc.finalOils.length;
    const avgWave = mc.finalWaves.reduce((a, b) => a + b, 0) / mc.finalWaves.length;
    console.log(`Avg final oil: $${avgOil.toFixed(2)}  avg final wave: ${avgWave.toFixed(1)}`);
    console.log(`Oil range: $${Math.min(...mc.finalOils).toFixed(2)} – $${Math.max(...mc.finalOils).toFixed(2)}`);

    const victoryRate = ((mc.outcomes.victory || 0) / mc.n) * 100;
    console.log(`Victory rate: ${victoryRate.toFixed(0)}% (random play — not optimal)`);
    return { avgOil, avgWave, victoryRate };
}

function printCombinedVerdict(sheetReport, mcSummary) {
    console.log('\n=== COMBINED REGIME ASSESSMENT ===\n');

    const waves = sheetReport.waveRows.length;
    const w20Need = sheetReport.waveRows[waves - 1].needDps;
    const bestOil = sheetReport.oilScenarios.find(s => s.kill === 1)?.endOil;
    const midOil = sheetReport.oilScenarios.find(s => s.kill === 0.7)?.endOil;
    const worstOil = sheetReport.oilScenarios.find(s => s.kill === 0)?.endOil;
    const campEnd = sheetReport.campaign[sheetReport.campaign.length - 1];

    console.log(`Wave ${waves} convoy demand: ~${w20Need.toFixed(0)} effective DPS for full clearance`);
    if (bestOil != null) {
        console.log(`Deterministic oil @${waves} (100% kills): $${bestOil.toFixed(0)} (${bestOil >= CONST.OIL_WIN ? '≥ win' : '< win'})`);
    }
    if (midOil != null) console.log(`Deterministic oil @${waves} (70/30):       $${midOil.toFixed(0)}`);
    if (worstOil != null) {
        console.log(`Deterministic oil @${waves} (all escape):   $${worstOil.toFixed(0)} (${worstOil <= CONST.OIL_LOSE ? '≤ lose' : '> lose'})`);
    }
    if (campEnd) {
        console.log(`Integrated sheet model @${waves}: oil $${campEnd.oil.toFixed(0)}`);
    }
    if (mcSummary) {
        console.log(`MC random play: avg oil $${mcSummary.avgOil.toFixed(2)} @ wave ${mcSummary.avgWave.toFixed(1)}, victory ${mcSummary.victoryRate.toFixed(0)}%`);
    }

    console.log(`\nSheet verdict: ${sheetReport.verdict}`);

    if (mcSummary) {
        const optimalWin = bestOil != null && bestOil >= CONST.OIL_WIN;
        const mcMostlyLose = mcSummary.victoryRate < 10;
        if (optimalWin && mcMostlyLose) {
            console.log('MC note: theoretical win path exists but random strategies rarely reach it — skill/composition gap is large.');
        } else if (mcSummary.victoryRate >= 50) {
            console.log('MC note: victory is common even under random play — may be overtuned toward player.');
        }
    }
}

function main() {
    const opts = parseArgs(process.argv.slice(2));

    let sheetReport = null;
    if (!opts.mcOnly) {
        sheetReport = runBalanceSheet({ argv: opts.overrides, waves: TUNING.WAVES });
        printBalanceSheet(sheetReport);
    }

    let mcSummary = null;
    if (!opts.sheetOnly) {
        const mc = runMonteCarlo(opts.mcRuns);
        mcSummary = printMonteCarlo(mc);
    }

    if (sheetReport && mcSummary) {
        printCombinedVerdict(sheetReport, mcSummary);
    } else if (sheetReport && !mcSummary) {
        console.log('\n(Sheet only — run without --sheet-only for Monte Carlo self-play.)');
    } else if (!sheetReport && mcSummary) {
        console.log('\n(MC only — run without --mc-only for deterministic balance sheet.)');
    }
}

main();
