/**
 * Trace Recorder
 * Captures sparse game events and per-wave summaries.
 * Computes aggregate metrics including Shannon diversity.
 */

'use strict';

class TraceRecorder {
    constructor() {
        this.events = [];
        this.waveSummaries = [];
        this.tick = 0;
    }

    recordEvent(type, data) {
        this.events.push({ tick: this.tick, type, ...data });
    }

    recordWaveSummary(observation) {
        // Count units by type
        const unitCounts = new Array(6).fill(0);
        for (const u of observation.playerUnits) {
            if (u.defId >= 0 && u.defId < 6) unitCounts[u.defId]++;
        }

        this.waveSummaries.push({
            wave: observation.wave,
            oil: observation.oil,
            funds: observation.funds,
            unitCount: observation.playerUnits.length,
            unitCounts: [...unitCounts],
            enemyCount: observation.enemies.length,
            f14Charges: observation.f14Charges,
        });
    }

    finalize(unitDefs) {
        const endEvent = this.events.find(e => e.type === 'gameEnd');
        const outcome = endEvent ? endEvent.outcome : 'unknown';
        const finalWave = endEvent ? endEvent.wave : 0;
        const finalOil = endEvent ? endEvent.oil : 0;
        const totalTicks = endEvent ? endEvent.totalTicks : 0;

        const metrics = this.computeMetrics(unitDefs);

        return {
            outcome,
            finalWave,
            finalOil,
            totalTicks,
            waveSummaries: this.waveSummaries,
            events: this.events,
            metrics,
        };
    }

    computeMetrics(unitDefs) {
        const placements = this.events.filter(e => e.type === 'place');
        const upgrades = this.events.filter(e => e.type === 'upgrade');
        const f14Uses = this.events.filter(e => e.type === 'f14');

        // Unit placement counts
        const placementCounts = new Array(6).fill(0);
        for (const p of placements) {
            if (p.unitType >= 0 && p.unitType < 6) placementCounts[p.unitType]++;
        }

        // Unit types used
        const unitTypesUsed = placementCounts.filter(c => c > 0).length;

        // Shannon diversity of placements
        const shannonDiversity = this.computeShannonDiversity(placementCounts);

        // Upgrade counts by type
        const upgradeCounts = new Array(6).fill(0);
        for (const u of upgrades) {
            if (u.unitType >= 0 && u.unitType < 6) upgradeCounts[u.unitType]++;
        }

        // Peak oil from wave summaries
        const peakOil = this.waveSummaries.length > 0
            ? Math.max(...this.waveSummaries.map(s => s.oil))
            : 0;

        // Average funds (measure of spending efficiency)
        const avgFunds = this.waveSummaries.length > 0
            ? this.waveSummaries.reduce((s, w) => s + w.funds, 0) / this.waveSummaries.length
            : 0;

        return {
            unitTypesUsed,
            shannonDiversity,
            placementCounts,
            totalPlacements: placements.length,
            upgradeCounts,
            totalUpgrades: upgrades.length,
            f14Uses: f14Uses.length,
            peakOil,
            avgFunds,
        };
    }

    computeShannonDiversity(counts) {
        const total = counts.reduce((a, b) => a + b, 0);
        if (total === 0) return 0;
        let H = 0;
        for (const c of counts) {
            if (c === 0) continue;
            const p = c / total;
            H -= p * Math.log2(p);
        }
        return H; // max = log2(6) ≈ 2.585 for 6 unit types
    }
}

module.exports = TraceRecorder;
