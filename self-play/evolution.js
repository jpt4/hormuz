/**
 * Evolutionary Algorithm
 * Manages a population of strategy genomes, evaluates fitness
 * via headless game simulation, and evolves toward better strategies.
 */

'use strict';

const { createSimulation } = require('./headless-engine');
const { randomGenome, seedGenome, mutate, crossover, deepClone } = require('./strategy-genome');
const AutoPlayer = require('./auto-player');
const { computeFitness } = require('./fitness');
const { SeededRNG } = require('./prng');

const SEED_ARCHETYPES = [
    'balanced', 'drone-swarm', 'fortress', 'naval',
    'mine-field', 'sub-heavy', 'sam-wall', 'fast-attack',
];

class EvolutionaryOptimizer {
    constructor(config = {}) {
        this.populationSize = config.populationSize || 100;
        this.eliteCount = config.eliteCount || 10;
        this.mutationRate = config.mutationRate || 0.15;
        this.crossoverRate = config.crossoverRate || 0.7;
        this.gamesPerGenome = config.gamesPerGenome || 3;
        this.tournamentSize = config.tournamentSize || 5;
        this.difficulty = config.difficulty || 'standard';
        this.constantOverrides = config.constantOverrides || {};
        this.geometryPath = config.geometryPath;
        this.gamePath = config.gamePath;

        this.generation = 0;
        this.population = [];
        this.history = [];
        this.rng = new SeededRNG(config.seed || 1);
    }

    /** Initialize population with random + seeded genomes */
    initialize() {
        this.population = [];

        // Seed archetypes (one of each)
        for (const archetype of SEED_ARCHETYPES) {
            this.population.push(seedGenome(archetype, this.rng.fork()));
        }

        // Fill rest with random
        while (this.population.length < this.populationSize) {
            this.population.push(randomGenome(this.rng.fork()));
        }
    }

    /** Evaluate all genomes in the population */
    evaluatePopulation() {
        const results = [];

        for (let i = 0; i < this.population.length; i++) {
            const genome = this.population[i];
            let totalFitness = 0;
            const traces = [];

            for (let g = 0; g < this.gamesPerGenome; g++) {
                const gameSeed = this.generation * 100000 + i * 100 + g;
                const trace = this.evaluateGenome(genome, gameSeed);
                const fitness = computeFitness(trace);
                totalFitness += fitness;
                traces.push(trace);
            }

            results.push({
                genome,
                fitness: totalFitness / this.gamesPerGenome,
                traces,
                index: i,
            });
        }

        results.sort((a, b) => b.fitness - a.fitness);
        return results;
    }

    /** Run a single game with a genome and return the trace */
    evaluateGenome(genome, seed) {
        const sim = createSimulation({
            seed,
            difficulty: this.difficulty,
            constantOverrides: this.constantOverrides,
            ...(this.geometryPath && { geometryPath: this.geometryPath }),
            ...(this.gamePath && { gamePath: this.gamePath }),
        });

        const playerRng = new SeededRNG(seed + 99999);
        const player = new AutoPlayer(genome, playerRng);
        return sim.runGame(player);
    }

    /** Create next generation from evaluated results */
    nextGeneration(evaluated) {
        const nextPop = [];

        // Elitism: keep top performers unchanged
        for (let i = 0; i < this.eliteCount && i < evaluated.length; i++) {
            nextPop.push(deepClone(evaluated[i].genome));
        }

        // Fill rest via tournament selection + crossover + mutation
        while (nextPop.length < this.populationSize) {
            const parentA = this.tournamentSelect(evaluated);

            let child;
            if (this.rng.next() < this.crossoverRate) {
                const parentB = this.tournamentSelect(evaluated);
                child = crossover(parentA.genome, parentB.genome, this.rng.fork());
            } else {
                child = deepClone(parentA.genome);
            }

            child = mutate(child, this.rng.fork(), this.mutationRate);
            nextPop.push(child);
        }

        // Record generation stats
        const top10 = evaluated.slice(0, Math.min(10, evaluated.length));
        this.history.push({
            generation: this.generation,
            bestFitness: evaluated[0].fitness,
            avgFitness: evaluated.reduce((s, e) => s + e.fitness, 0) / evaluated.length,
            medianFitness: evaluated[Math.floor(evaluated.length / 2)].fitness,
            bestOutcome: evaluated[0].traces[0].outcome,
            bestWave: evaluated[0].traces[0].finalWave,
            bestOil: evaluated[0].traces[0].finalOil,
            diversityMean: top10.reduce((s, e) => s + e.traces[0].metrics.shannonDiversity, 0) / top10.length,
            unitTypesUsedMean: top10.reduce((s, e) => s + e.traces[0].metrics.unitTypesUsed, 0) / top10.length,
        });

        this.population = nextPop;
        this.generation++;
    }

    /** Tournament selection */
    tournamentSelect(evaluated) {
        let best = null;
        for (let i = 0; i < this.tournamentSize; i++) {
            const idx = this.rng.nextInt(evaluated.length);
            if (!best || evaluated[idx].fitness > best.fitness) {
                best = evaluated[idx];
            }
        }
        return best;
    }

    /** Print generation summary */
    printGenSummary() {
        const h = this.history[this.history.length - 1];
        if (!h) return;
        console.log(
            `Gen ${String(h.generation).padStart(3)}: ` +
            `best=${h.bestFitness.toFixed(1).padStart(6)} ` +
            `avg=${h.avgFitness.toFixed(1).padStart(6)} ` +
            `med=${h.medianFitness.toFixed(1).padStart(6)} | ` +
            `${h.bestOutcome.padEnd(9)} w${h.bestWave} ` +
            `oil=$${h.bestOil.toFixed(0).padStart(3)} | ` +
            `div=${h.diversityMean.toFixed(2)} types=${h.unitTypesUsedMean.toFixed(1)}`
        );
    }
}

module.exports = { EvolutionaryOptimizer };
