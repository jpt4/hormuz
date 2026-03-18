#!/usr/bin/env node
/**
 * CLI Entry Point for Self-Play System
 *
 * Usage:
 *   node run.js play [--seed=N]              Run a single game with random strategy
 *   node run.js evolve [--gen=N] [--pop=N]   Run N generations of evolution
 *   node run.js balance [--cycles=N]          Run full autonomous balance loop
 *                       [--no-commit]          Skip git commit/push
 *                       [--no-push]            Commit but don't push
 *   node run.js test                          Quick smoke test of headless engine
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { createSimulation } = require('./headless-engine');
const { EvolutionaryOptimizer } = require('./evolution');
const { BalanceAnalyzer } = require('./analyzer');
const { Rebalancer } = require('./rebalancer');
const { randomGenome } = require('./strategy-genome');
const AutoPlayer = require('./auto-player');
const { computeFitness } = require('./fitness');
const { SeededRNG } = require('./prng');
const { writeConfig, commitConfig, pushConfig } = require('./config-writer');

// Parse simple args
function parseArgs() {
    const args = {};
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            args[key] = value !== undefined ? value : true;
        } else {
            args._command = arg;
        }
    }
    return args;
}

// --- Commands ---

function commandTest() {
    console.log('=== HEADLESS ENGINE SMOKE TEST ===\n');

    // Test 1: Create simulation
    console.log('Creating simulation...');
    const sim = createSimulation({ seed: 42 });
    console.log('  OK: Simulation created');

    // Test 2: Start game
    sim.startGame();
    const obs = sim.getObservation();
    console.log(`  Phase: ${obs.phase}, Wave: ${obs.wave}, Oil: ${obs.oil}, Funds: ${obs.funds}`);

    // Test 3: Step forward
    const stepsToRun = 100;
    for (let i = 0; i < stepsToRun; i++) {
        sim.step();
    }
    const obs2 = sim.getObservation();
    console.log(`  After ${stepsToRun} steps: Phase=${obs2.phase}, Timer=${obs2.setupTimeRemaining.toFixed(1)}s`);

    // Test 4: Place a unit
    const defs = sim.getUnitDefs();
    const unit = sim.placeUnit(2, 600, 200); // Drone on Iranian land
    if (unit) {
        console.log(`  Placed ${defs[2].shortName} at (600, 200). Funds: ${sim.game.GameState.funds}`);
    } else {
        console.log('  WARNING: Could not place drone at (600, 200)');
    }

    // Test 5: Run to first wave
    let ticks = 0;
    while (sim.getPhase() === 'setup' && ticks < 10000) {
        sim.step();
        ticks++;
    }
    const obs3 = sim.getObservation();
    console.log(`  After setup: Phase=${obs3.phase}, Ticks=${ticks}, Enemies=${obs3.enemies.length}`);

    // Test 6: Run with auto-player
    console.log('\nRunning full game with random strategy...');
    const sim2 = createSimulation({ seed: 123 });
    const rng = new SeededRNG(456);
    const genome = randomGenome(rng);
    const player = new AutoPlayer(genome, rng);
    const trace = sim2.runGame(player);

    console.log(`  Outcome: ${trace.outcome}`);
    console.log(`  Final wave: ${trace.finalWave}`);
    console.log(`  Final oil: $${trace.finalOil.toFixed(2)}`);
    console.log(`  Total ticks: ${trace.totalTicks}`);
    console.log(`  Units placed: ${trace.metrics.totalPlacements}`);
    console.log(`  Unit types used: ${trace.metrics.unitTypesUsed}`);
    console.log(`  Shannon diversity: ${trace.metrics.shannonDiversity.toFixed(3)}`);
    console.log(`  Upgrades: ${trace.metrics.totalUpgrades}`);
    console.log(`  F-14 uses: ${trace.metrics.f14Uses}`);
    console.log(`  Fitness: ${computeFitness(trace).toFixed(1)}`);

    console.log('\n=== SMOKE TEST PASSED ===');
}

function commandPlay(args) {
    const seed = parseInt(args.seed) || 42;
    console.log(`Running single game with seed ${seed}...\n`);

    const sim = createSimulation({ seed });
    const rng = new SeededRNG(seed + 1);
    const genome = randomGenome(rng);
    const player = new AutoPlayer(genome, rng);
    const trace = sim.runGame(player);

    console.log(`Outcome: ${trace.outcome}`);
    console.log(`Final wave: ${trace.finalWave}`);
    console.log(`Final oil: $${trace.finalOil.toFixed(2)}`);
    console.log(`Total ticks: ${trace.totalTicks}`);
    console.log('\nMetrics:');
    console.log(`  Placements: ${trace.metrics.totalPlacements} (${trace.metrics.unitTypesUsed} types)`);
    console.log(`  Placement counts: [${trace.metrics.placementCounts.join(', ')}]`);
    console.log(`  Shannon diversity: ${trace.metrics.shannonDiversity.toFixed(3)} / ${Math.log2(6).toFixed(3)}`);
    console.log(`  Upgrades: ${trace.metrics.totalUpgrades}`);
    console.log(`  F-14 uses: ${trace.metrics.f14Uses}`);
    console.log(`  Fitness: ${computeFitness(trace).toFixed(1)}`);

    console.log('\nWave summaries:');
    for (const ws of trace.waveSummaries) {
        console.log(`  W${String(ws.wave).padStart(2)}: oil=$${ws.oil.toFixed(0).padStart(3)} funds=$${ws.funds.toFixed(0).padStart(4)} units=${ws.unitCount} [${ws.unitCounts.join(',')}]`);
    }
}

function commandEvolve(args) {
    const generations = parseInt(args.gen) || 20;
    const populationSize = parseInt(args.pop) || 50;
    const seed = parseInt(args.seed) || 1;

    console.log(`Evolving: ${generations} generations, population ${populationSize}, seed ${seed}\n`);

    const evo = new EvolutionaryOptimizer({
        populationSize,
        seed,
        gamesPerGenome: 2,
        eliteCount: Math.max(2, Math.floor(populationSize * 0.1)),
    });

    evo.initialize();

    for (let gen = 0; gen < generations; gen++) {
        const t0 = Date.now();
        const evaluated = evo.evaluatePopulation();
        evo.nextGeneration(evaluated);
        evo.printGenSummary();

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        if (gen === 0 || (gen + 1) % 5 === 0) {
            console.log(`  (${elapsed}s, ${evaluated.length * evo.gamesPerGenome} games)`);
        }
    }

    // Final analysis
    console.log('\n=== FINAL ANALYSIS ===\n');
    const finalEval = evo.evaluatePopulation();
    const analyzer = new BalanceAnalyzer();
    const analysis = analyzer.analyze(finalEval);

    console.log('Unit Usage (top 20):');
    for (const u of analysis.unitAnalysis) {
        const bar = '#'.repeat(Math.round(u.usageInTop * 20));
        console.log(`  ${u.name.padEnd(12)} ${(u.usageInTop * 100).toFixed(0).padStart(3)}% ${bar} (avg ${u.avgCountInTop.toFixed(1)} placed)`);
    }

    console.log(`\nWin rate: ${(analysis.winRate * 100).toFixed(1)}%`);
    console.log(`Outcomes: ${JSON.stringify(analysis.outcomeDistribution)}`);
    console.log(`Diversity: ${analysis.diversityStats.meanDiversity.toFixed(2)} / ${analysis.diversityStats.maxDiversity.toFixed(2)} (${(analysis.diversityStats.diversityRatio * 100).toFixed(0)}%)`);
    console.log(`Mean types used: ${analysis.diversityStats.meanTypesUsed.toFixed(1)}`);
    console.log(`Strategy archetypes: ${analysis.archetypeCount}`);

    if (analysis.balanceSignals.length > 0) {
        console.log('\nBalance signals:');
        for (const s of analysis.balanceSignals) {
            console.log(`  ${s.type}: ${s.unit || s.metric} = ${typeof s.value === 'number' ? s.value.toFixed(3) : s.value}`);
        }
    }

    console.log(`\nBalanced: ${analysis.summary.balanced ? 'YES' : 'NO'}`);
}

function commandBalance(args) {
    const maxCycles = parseInt(args.cycles) || 5;
    const genPerCycle = parseInt(args.gen) || 30;
    const populationSize = parseInt(args.pop) || 50;
    const noCommit = args['no-commit'] === true;
    const noPush = args['no-push'] === true;

    console.log(`Autonomous balance loop: ${maxCycles} cycles, ${genPerCycle} gen/cycle, pop ${populationSize}`);
    if (noCommit) console.log('  (--no-commit: skipping git operations)');
    if (noPush) console.log('  (--no-push: skipping git push)');
    console.log();

    let constantOverrides = {};
    const rebalancer = new Rebalancer();

    for (let cycle = 0; cycle < maxCycles; cycle++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`BALANCE CYCLE ${cycle + 1} / ${maxCycles}`);
        console.log(`${'='.repeat(60)}\n`);

        if (Object.keys(constantOverrides).length > 0) {
            console.log('Active overrides:', JSON.stringify(constantOverrides, null, 2));
        }

        const evo = new EvolutionaryOptimizer({
            populationSize,
            seed: cycle * 10000 + 1,
            gamesPerGenome: 2,
            constantOverrides,
        });

        evo.initialize();

        for (let gen = 0; gen < genPerCycle; gen++) {
            const evaluated = evo.evaluatePopulation();
            evo.nextGeneration(evaluated);
            if (gen % 5 === 0 || gen === genPerCycle - 1) {
                evo.printGenSummary();
            }
        }

        // Analyze
        const finalEval = evo.evaluatePopulation();
        const analyzer = new BalanceAnalyzer();
        const analysis = analyzer.analyze(finalEval);

        const winRatePct = (analysis.winRate * 100).toFixed(1);
        const diversityPct = (analysis.diversityStats.diversityRatio * 100).toFixed(0);

        console.log(`\nCycle ${cycle + 1} summary:`);
        console.log(`  Win rate: ${winRatePct}%`);
        console.log(`  Diversity: ${diversityPct}%`);
        console.log(`  Types used: ${analysis.diversityStats.meanTypesUsed.toFixed(1)}`);
        console.log(`  Archetypes: ${analysis.archetypeCount}`);
        console.log(`  Signals: ${analysis.balanceSignals.length}`);

        const balanced = rebalancer.isBalanced(analysis);

        if (balanced) {
            console.log('\n*** BALANCED — edge of chaos achieved ***');
            console.log('Final overrides:', JSON.stringify(constantOverrides, null, 2));
        } else {
            // Apply rebalancing
            const signals = analysis.balanceSignals;
            for (const s of signals) {
                console.log(`  Signal: ${s.type} ${s.unit || s.metric} = ${typeof s.value === 'number' ? s.value.toFixed(3) : s.value}`);
            }
            constantOverrides = rebalancer.applySignals(signals, constantOverrides);
            console.log('  Adjusted overrides:', JSON.stringify(constantOverrides, null, 2));
        }

        // --- Write config file (every cycle, not just final) ---
        const metadata = {
            cycle: cycle + 1,
            winRate: winRatePct,
            diversity: diversityPct,
            typesUsed: analysis.diversityStats.meanTypesUsed.toFixed(1),
            archetypes: analysis.archetypeCount,
            balanced,
        };

        const { configPath, filename } = writeConfig(constantOverrides, metadata);
        console.log(`  Config written: ${filename}`);

        // Save balance-result.json
        const outPath = path.join(__dirname, 'balance-result.json');
        fs.writeFileSync(outPath, JSON.stringify({
            constantOverrides,
            timestamp: new Date().toISOString(),
            cycle: cycle + 1,
            balanced,
        }, null, 2));

        // --- Git commit + push ---
        if (!noCommit) {
            const hash = commitConfig(metadata);
            if (hash) {
                console.log(`  Committed: ${hash}`);
                if (!noPush) {
                    const pushed = pushConfig();
                    if (pushed) {
                        console.log('  Pushed to origin/self-play');
                    }
                }
            }
        }

        if (balanced) break;
    }

    console.log('\nBalance loop complete.');
}

// --- Main ---

const args = parseArgs();
const command = args._command || 'test';

switch (command) {
    case 'test':
        commandTest();
        break;
    case 'play':
        commandPlay(args);
        break;
    case 'evolve':
        commandEvolve(args);
        break;
    case 'balance':
        commandBalance(args);
        break;
    default:
        console.log(`Unknown command: ${command}`);
        console.log('Usage: node run.js [test|play|evolve|balance] [options]');
        process.exit(1);
}
