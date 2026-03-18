/**
 * Balance Analyzer
 * Examines evolution results to produce balance diagnostics and signals.
 */

'use strict';

const { MAX_SHANNON } = require('./fitness');

class BalanceAnalyzer {
    /**
     * Analyze a set of evaluated genomes from the final generation.
     * @param {Array} results - Evaluated population sorted by fitness
     * @param {number} topN - Number of top strategies to analyze (default 20)
     */
    analyze(results, topN = 20) {
        const top = results.slice(0, Math.min(topN, results.length));
        const all = results;

        return {
            unitAnalysis: this.analyzeUnitUsage(top, all),
            winRate: this.computeWinRate(all),
            outcomeDistribution: this.computeOutcomes(all),
            diversityStats: this.computeDiversityStats(top),
            archetypeCount: this.estimateArchetypes(top),
            balanceSignals: this.computeBalanceSignals(top, all),
            summary: this.summarize(top, all),
        };
    }

    analyzeUnitUsage(top, all) {
        const unitNames = ['Silkworm', 'SAM', 'Drone', 'MineLayer', 'FAB', 'Submarine'];
        const analysis = [];

        for (let i = 0; i < 6; i++) {
            const usageInTop = top.filter(r =>
                r.traces[0].metrics.placementCounts[i] > 0
            ).length / top.length;

            const usageInAll = all.filter(r =>
                r.traces[0].metrics.placementCounts[i] > 0
            ).length / all.length;

            const avgCountTop = top.reduce((s, r) =>
                s + r.traces[0].metrics.placementCounts[i], 0
            ) / top.length;

            analysis.push({
                name: unitNames[i],
                index: i,
                usageInTop: usageInTop,
                usageInAll: usageInAll,
                avgCountInTop: avgCountTop,
            });
        }

        return analysis;
    }

    computeWinRate(all) {
        return all.filter(r => r.traces[0].outcome === 'victory').length / all.length;
    }

    computeOutcomes(all) {
        const counts = { victory: 0, defeat: 0, stalemate: 0 };
        for (const r of all) {
            const outcome = r.traces[0].outcome;
            if (counts[outcome] !== undefined) counts[outcome]++;
        }
        return counts;
    }

    computeDiversityStats(top) {
        const diversities = top.map(r => r.traces[0].metrics.shannonDiversity);
        const mean = diversities.reduce((a, b) => a + b, 0) / diversities.length;
        const typesUsed = top.map(r => r.traces[0].metrics.unitTypesUsed);
        const meanTypes = typesUsed.reduce((a, b) => a + b, 0) / typesUsed.length;

        return {
            meanDiversity: mean,
            maxDiversity: MAX_SHANNON,
            diversityRatio: mean / MAX_SHANNON,
            meanTypesUsed: meanTypes,
        };
    }

    estimateArchetypes(top) {
        // Simple archetype estimation: cluster by dominant unit type
        const archetypes = new Set();
        for (const r of top) {
            const counts = r.traces[0].metrics.placementCounts;
            // Find dominant type (highest count)
            let maxCount = 0, dominant = -1;
            for (let i = 0; i < 6; i++) {
                if (counts[i] > maxCount) { maxCount = counts[i]; dominant = i; }
            }
            // Archetype = "dominant type" + secondary indicator
            const total = counts.reduce((a, b) => a + b, 0);
            const dominance = total > 0 ? maxCount / total : 0;

            if (dominance > 0.6) {
                archetypes.add(`mono-${dominant}`);
            } else {
                // Find secondary type
                let sec = -1, secCount = 0;
                for (let i = 0; i < 6; i++) {
                    if (i !== dominant && counts[i] > secCount) { secCount = counts[i]; sec = i; }
                }
                archetypes.add(`combo-${dominant}-${sec}`);
            }
        }
        return archetypes.size;
    }

    computeBalanceSignals(top, all) {
        const signals = [];
        const unitNames = ['Silkworm', 'SAM', 'Drone', 'MineLayer', 'FAB', 'Submarine'];

        // Per-unit signals
        for (let i = 0; i < 6; i++) {
            const usageInTop = top.filter(r =>
                r.traces[0].metrics.placementCounts[i] > 0
            ).length / top.length;

            if (usageInTop < 0.15) {
                signals.push({
                    type: 'UNDERPOWERED',
                    unit: unitNames[i],
                    unitIndex: i,
                    metric: 'usageInTop',
                    value: usageInTop,
                });
            }

            if (usageInTop > 0.95) {
                signals.push({
                    type: 'ESSENTIAL_OR_OP',
                    unit: unitNames[i],
                    unitIndex: i,
                    metric: 'usageInTop',
                    value: usageInTop,
                });
            }

            // Check for dominance: one unit type has >50% of all placements in top
            const avgFraction = top.reduce((s, r) => {
                const total = r.traces[0].metrics.totalPlacements;
                return s + (total > 0 ? r.traces[0].metrics.placementCounts[i] / total : 0);
            }, 0) / top.length;

            if (avgFraction > 0.50) {
                signals.push({
                    type: 'DOMINANT',
                    unit: unitNames[i],
                    unitIndex: i,
                    metric: 'avgPlacementFraction',
                    value: avgFraction,
                });
            }
        }

        // Win rate signals
        const winRate = this.computeWinRate(all);
        if (winRate > 0.80) {
            signals.push({ type: 'TOO_EASY', metric: 'winRate', value: winRate });
        }
        if (winRate < 0.10) {
            signals.push({ type: 'TOO_HARD', metric: 'winRate', value: winRate });
        }

        // Diversity signal
        const diversityStats = this.computeDiversityStats(top);
        if (diversityStats.diversityRatio < 0.50) {
            signals.push({
                type: 'LOW_DIVERSITY',
                metric: 'diversityRatio',
                value: diversityStats.diversityRatio,
            });
        }

        return signals;
    }

    summarize(top, all) {
        const winRate = this.computeWinRate(all);
        const diversity = this.computeDiversityStats(top);
        const archetypes = this.estimateArchetypes(top);
        const signals = this.computeBalanceSignals(top, all);

        const balanced =
            winRate >= 0.20 && winRate <= 0.60 &&
            diversity.meanTypesUsed >= 4 &&
            archetypes >= 3 &&
            diversity.diversityRatio >= 0.58 && // ≈ 1.5/2.585
            !signals.some(s => s.type === 'DOMINANT');

        return {
            balanced,
            winRate,
            diversityRatio: diversity.diversityRatio,
            meanTypesUsed: diversity.meanTypesUsed,
            archetypes,
            signalCount: signals.length,
        };
    }
}

module.exports = { BalanceAnalyzer };
