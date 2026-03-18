/**
 * Fitness Function
 * Evaluates a game trace and produces a scalar fitness score.
 * Weights diversity and strategic sophistication alongside winning.
 */

'use strict';

const STARTING_FUNDS = 500;
const MAX_SHANNON = Math.log2(6); // ≈ 2.585

/**
 * Compute fitness from a game trace result.
 * Max theoretical: ~200 points
 *
 * Components:
 *   Outcome (0-100): rewards winning, penalizes early defeat
 *   Diversity (0-50): Shannon entropy + types used + upgrade spread
 *   Strategy (0-30): upgrades, F-14 usage, economy efficiency
 *   Engagement (0-20): spread of activity across unit types
 */
function computeFitness(traceResult) {
    const m = traceResult.metrics;
    let fitness = 0;

    // --- Outcome component (0-100) ---
    switch (traceResult.outcome) {
        case 'victory':
            // Earlier victory = better. Max 100 at wave 1, min 60 at wave 20.
            fitness += 100 - Math.max(0, (traceResult.finalWave - 1)) * 2;
            break;
        case 'stalemate':
            fitness += 40;
            break;
        case 'defeat':
            // Later defeat = better. Max 30 at wave 20, min 5 at wave 1.
            fitness += 5 + Math.min(25, (traceResult.finalWave - 1) * 1.3);
            break;
        default:
            fitness += 0;
    }

    // --- Diversity bonus (0-50) ---
    // Shannon diversity of unit placement (max ≈ 2.585)
    const diversityNorm = MAX_SHANNON > 0 ? m.shannonDiversity / MAX_SHANNON : 0;
    fitness += diversityNorm * 30;

    // Bonus for using many unit types
    fitness += Math.min(m.unitTypesUsed, 6) * 3; // max 18

    // Bonus for upgrades being spread across types
    const upgradeTypesUsed = m.upgradeCounts.filter(c => c > 0).length;
    fitness += Math.min(upgradeTypesUsed, 4) * 0.5; // max 2

    // --- Strategy component (0-30) ---
    // Upgrades performed (diminishing returns)
    fitness += Math.min(m.totalUpgrades, 10) * 1.5; // max 15

    // F-14 usage
    fitness += Math.min(m.f14Uses, 5) * 2; // max 10

    // Economy efficiency: penalize hoarding (high average unspent funds)
    const maxExpectedFunds = STARTING_FUNDS + 3000; // rough upper bound
    const spendEfficiency = 1 - Math.min(1, m.avgFunds / maxExpectedFunds);
    fitness += spendEfficiency * 5; // max 5

    // --- Engagement (0-20) ---
    // Reward having many placement counts > 0 contributing meaningfully
    // (this overlaps with diversity but weights active contribution)
    const activeCounts = m.placementCounts.filter(c => c >= 2).length;
    fitness += activeCounts * 3; // max 18

    // Small bonus for total unit count (shows spending)
    fitness += Math.min(m.totalPlacements, 20) * 0.1; // max 2

    return fitness;
}

module.exports = { computeFitness, MAX_SHANNON };
