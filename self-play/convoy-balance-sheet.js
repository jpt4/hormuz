#!/usr/bin/env node
/**
 * Coarse convoy / economy balance sheet (deterministic, NOT self-play).
 *
 * Fast closed-form estimates for tuning iteration. Pulls live constants from
 * hormuz-game.html via headless-engine.
 *
 *   node self-play/convoy-balance-sheet.js
 *   node self-play/convoy-balance-sheet.js WAVE_HP_SCALING=0.10 STARTING_FUNDS=600
 *
 * Override names match in-game constant identifiers or TUNING keys.
 */

'use strict';

const vm = require('vm');
const { createSimulation } = require('./headless-engine');

// =============================================================================
// COARSE TUNING KNOBS — edit here for quick what-if iteration
// =============================================================================
const TUNING = {
    /** Hard cap on fielded units (deployment grid / practical ceiling). */
    MAX_FLEET_SIZE: 36,
    /** Fraction of theoretical fleet DPS that becomes convoy damage (range, retargeting). */
    FLEET_EFFICIENCY: 0.55,
    /** Cruise missiles: expected player units removed per salvo missile (splash + focus fire). */
    CM_KILLS_PER_SALVO: 0.35,
    /** Cruise missiles: expected units removed per drip missile during setup+defend. */
    CM_KILLS_PER_DRIP: 0.08,
    /** Destroyer/F-35 pressure: share of fleet HP lost to naval/air fire per wave. */
    DDG_HP_LOSS_FRAC: 0.12,
    F35_HP_LOSS_FRAC: 0.06,
    /** Minimum fraction of fleet surviving attrition each wave (floor for coarse model). */
    SURVIVAL_FLOOR: 0.45,
    /** Fixed kill-rate scenarios for oil sweeps (independent of fleet model). */
    OIL_SCENARIOS: [
        { name: '100% kills', kill: 1.0, escape: 0.0 },
        { name: '80% / 20%', kill: 0.8, escape: 0.2 },
        { name: '70% / 30%', kill: 0.7, escape: 0.3 },
        { name: '60% / 40%', kill: 0.6, escape: 0.4 },
        { name: 'all escape', kill: 0.0, escape: 1.0 },
    ],
    WAVES: 20,
};

// --- Pull constants from live game module ---
const sim0 = createSimulation({ seed: 0 });
const G = sim0.game;
const ctx = sim0.sandbox;

function C(name) { return vm.runInContext(name, ctx); }

const CONST = {
    STARTING_FUNDS: C('STARTING_FUNDS'),
    STARTING_OIL: C('STARTING_OIL_PRICE'),
    OIL_WIN: C('OIL_WIN_THRESHOLD'),
    OIL_LOSE: C('OIL_LOSE_THRESHOLD'),
    OIL_REF: C('OIL_REFERENCE'),
    TANKERS_MULT: C('TANKERS_PER_WAVE_MULT'),
    ESCORTS_DIV: C('ESCORTS_PER_WAVE_DIV'),
    F35_START: C('F35_START_WAVE'),
    F35_DIV: C('F35_PER_WAVE_DIV'),
    INTERDICTION_EVERY: C('INTERDICTION_EVERY_N_WAVES'),
    INTERDICTION_TANKER_MULT: C('INTERDICTION_TANKER_MULT'),
    INTERDICTION_SALVO: C('INTERDICTION_SALVO_MULT'),
    HP_SCALE: C('WAVE_HP_SCALING'),
    SPD_SCALE: C('WAVE_SPEED_SCALING'),
    SPAWN_INT: C('SPAWN_INTERVAL_SEC'),
    SETUP_SEC: C('SETUP_PHASE_DURATION'),
    WAVE_INCOME_BASE: C('WAVE_INCOME_BASE'),
    INCOME_ROUND: C('INCOME_ROUND_TO'),
    INCOME_MULT: C('DIFFICULTY_INCOME_MULT').standard,
    T_SMALL: C('TANKER_SMALL_HP'), T_MED: C('TANKER_MED_HP'), T_LARGE: C('TANKER_LARGE_HP'),
    T_SMALL_S: C('TANKER_SMALL_SPEED'), T_MED_S: C('TANKER_MED_SPEED'), T_LARGE_S: C('TANKER_LARGE_SPEED'),
    DDG_HP: C('DESTROYER_HP'), DDG_DPS: C('DESTROYER_DPS'), DDG_CD: C('DESTROYER_COOLDOWN'),
    F35_HP: C('F35_HP'), F35_DPS: C('F35_DPS'), F35_CD: C('F35_COOLDOWN'),
    CM_BASE: C('CRUISE_MISSILE_BASE_RATE'),
    CM_DRIP: C('CRUISE_MISSILE_DRIP_MULT'),
    CM_SETUP: C('CRUISE_MISSILE_SETUP_MULT'),
    SALVO_MIN: C('CRUISE_SALVO_MIN'),
    SALVO_MAX: C('CRUISE_SALVO_MAX'),
    ESCORT_BONUS: C('ESCORT_KILL_BONUS'),
    F35_BONUS: C('F35_KILL_BONUS'),
    OIL_SD: C('OIL_SMALL_DESTROY'), OIL_SE: C('OIL_SMALL_ESCAPE'),
    OIL_MD: C('OIL_MED_DESTROY'), OIL_ME: C('OIL_MED_ESCAPE'),
    OIL_LD: C('OIL_LARGE_DESTROY'), OIL_LE: C('OIL_LARGE_ESCAPE'),
};

function applyCliOverrides(argv) {
    for (const arg of argv) {
        const m = arg.match(/^([A-Z0-9_]+)=([0-9.]+)$/);
        if (!m) continue;
        const key = m[1];
        const val = Number(m[2]);
        if (key in CONST) CONST[key] = val;
        else if (key in TUNING) TUNING[key] = val;
        else vm.runInContext(`${key} = ${val}`, ctx);
    }
}

const PATH_LEN = G.pathCache['lane-tr7'].totalLength;
const UNIT_DEFS = G.UNIT_DEFS;

function applyOilDelta(oil, baseDelta) {
    const factor = baseDelta > 0 ? CONST.OIL_REF / oil : oil / CONST.OIL_REF;
    return Math.max(0, oil + baseDelta * factor);
}

function waveIncome(oil) {
    const raw = CONST.WAVE_INCOME_BASE * Math.log(oil / CONST.OIL_REF + 1) * CONST.OIL_REF;
    return Math.round((raw * CONST.INCOME_MULT) / CONST.INCOME_ROUND) * CONST.INCOME_ROUND;
}

function waveCounts(w) {
    let tankers = w * CONST.TANKERS_MULT;
    if (w % CONST.INTERDICTION_EVERY === 0) {
        tankers = Math.max(1, Math.round(tankers * CONST.INTERDICTION_TANKER_MULT));
    }
    const escorts = Math.floor(w / CONST.ESCORTS_DIV);
    const f35 = w >= CONST.F35_START ? Math.floor((w - CONST.F35_START + 1) / CONST.F35_DIV) : 0;
    return { tankers, escorts, f35, queueSize: tankers + escorts + f35 };
}

function hpScale(w) { return Math.pow(1 + CONST.HP_SCALE, w - 1); }
function spdScale(w) { return Math.pow(1 + CONST.SPD_SCALE, w - 1); }

const EXP_TANKER_HP = 0.55 * CONST.T_SMALL + 0.30 * CONST.T_MED + 0.15 * CONST.T_LARGE;
const EXP_TANKER_SPD = 0.55 * CONST.T_SMALL_S + 0.30 * CONST.T_MED_S + 0.15 * CONST.T_LARGE_S;
const EXP_OIL_KILL = 0.55 * CONST.OIL_SD + 0.30 * CONST.OIL_MD + 0.15 * CONST.OIL_LD;
const EXP_OIL_ESC = 0.55 * CONST.OIL_SE + 0.30 * CONST.OIL_ME + 0.15 * CONST.OIL_LE;

function sustainedDps(def, defId) {
    if (defId === 3) {
        const maxMines = def.maxMines || 4;
        return (def.dps * maxMines) / (maxMines * def.cooldown);
    }
    return def.dps / def.cooldown;
}

function convoyDamageRequired(w) {
    const { tankers, escorts, f35 } = waveCounts(w);
    const hs = hpScale(w);
    const tankerHp = tankers * EXP_TANKER_HP * hs;
    const escortHp = escorts * CONST.DDG_HP * hs;
    const f35Hp = f35 * CONST.F35_HP * hs;
    return { tankerHp, escortHp, f35Hp, totalHp: tankerHp + escortHp + f35Hp };
}

function convoyTimeBudget(w) {
    const { queueSize } = waveCounts(w);
    const spawnWindow = (queueSize - 1) * CONST.SPAWN_INT;
    const transit = PATH_LEN / (EXP_TANKER_SPD * spdScale(w));
    return spawnWindow + transit + CONST.SETUP_SEC;
}

function expectedSalvoCount(w) {
    const mid = (CONST.SALVO_MIN + CONST.SALVO_MAX) / 2;
    let count = Math.max(CONST.SALVO_MIN, Math.round(mid * Math.max(1, w / 4)));
    if (w % CONST.INTERDICTION_EVERY === 0) count = Math.round(count * CONST.INTERDICTION_SALVO);
    return count;
}

function coarseAttrition(w, fleetCount, escorts, f35) {
    const defendSec = convoyTimeBudget(w) - CONST.SETUP_SEC;
    const salvo = expectedSalvoCount(w);
    const drip = CONST.CM_BASE * w * (CONST.CM_SETUP * CONST.SETUP_SEC + CONST.CM_DRIP * defendSec);
    const cmLoss = (salvo * TUNING.CM_KILLS_PER_SALVO) + (drip * TUNING.CM_KILLS_PER_DRIP);
    const ballisticLoss = fleetCount * (
        escorts * TUNING.DDG_HP_LOSS_FRAC +
        f35 * TUNING.F35_HP_LOSS_FRAC
    ) / Math.max(1, fleetCount);
    const unitsLost = Math.min(fleetCount, cmLoss + ballisticLoss * 0.15);
    const survival = Math.max(TUNING.SURVIVAL_FLOOR, 1 - unitsLost / Math.max(1, fleetCount));
    return { survival, cmLoss, unitsLost };
}

const UNIT_OPTIONS = UNIT_DEFS.map((d, i) => ({
    id: i,
    name: d.shortName,
    cost: d.cost,
    dps: sustainedDps(d, i),
    hp: d.hp,
})).sort((a, b) => (b.dps / b.cost) - (a.dps / a.cost));

function fleetStats(comp) {
    let totalDps = 0;
    let totalHp = 0;
    let count = 0;
    for (const o of UNIT_OPTIONS) {
        const n = comp[o.name] || 0;
        totalDps += n * o.dps;
        totalHp += n * o.hp;
        count += n;
    }
    return { totalDps, totalHp, count };
}

function buyGreedy(funds, comp, cap = TUNING.MAX_FLEET_SIZE) {
    let rem = funds;
    let spent = 0;
    let count = fleetStats(comp).count;
    while (count < cap) {
        let bought = false;
        for (const o of UNIT_OPTIONS) {
            if (rem >= o.cost) {
                comp[o.name] = (comp[o.name] || 0) + 1;
                rem -= o.cost;
                spent += o.cost;
                count++;
                bought = true;
                break;
            }
        }
        if (!bought) break;
    }
    return { spent, remaining: rem };
}

function simulateOilPath(killFrac, escapeFrac, waves) {
    let oil = CONST.STARTING_OIL;
    let funds = CONST.STARTING_FUNDS;
    const rows = [];
    for (let w = 1; w <= waves; w++) {
        const { tankers, escorts, f35 } = waveCounts(w);
        const kills = Math.round(tankers * killFrac);
        const escapes = Math.round(tankers * escapeFrac);
        for (let i = 0; i < kills; i++) oil = applyOilDelta(oil, EXP_OIL_KILL);
        for (let i = 0; i < escapes; i++) oil = applyOilDelta(oil, EXP_OIL_ESC);
        funds += escorts * CONST.ESCORT_BONUS * killFrac;
        funds += f35 * CONST.F35_BONUS * killFrac;
        rows.push({ wave: w, oil, funds, killFrac });
        if (w < waves) funds += waveIncome(oil);
    }
    return rows;
}

function simulateCampaign(waves) {
    let funds = CONST.STARTING_FUNDS;
    let oil = CONST.STARTING_OIL;
    const comp = {};
    for (const o of UNIT_OPTIONS) comp[o.name] = 0;
    const rows = [];

    for (let w = 1; w <= waves; w++) {
        if (w > 1) funds += waveIncome(oil);
        const purchase = buyGreedy(funds, comp);
        funds = purchase.remaining;

        const fleet = fleetStats(comp);
        const need = convoyDamageRequired(w);
        const budget = convoyTimeBudget(w);
        const delivered = fleet.totalDps * budget * TUNING.FLEET_EFFICIENCY;
        const clearance = need.totalHp > 0 ? delivered / need.totalHp : 0;
        const killFrac = Math.min(1, clearance);
        const escapeFrac = Math.max(0, 1 - killFrac);

        const { tankers, escorts, f35 } = waveCounts(w);
        for (let i = 0; i < Math.round(tankers * killFrac); i++) oil = applyOilDelta(oil, EXP_OIL_KILL);
        for (let i = 0; i < Math.round(tankers * escapeFrac); i++) oil = applyOilDelta(oil, EXP_OIL_ESC);
        const milClear = Math.min(1, killFrac * 0.85 + 0.05);
        funds += escorts * CONST.ESCORT_BONUS * milClear + f35 * CONST.F35_BONUS * milClear;

        const attr = coarseAttrition(w, fleet.count, escorts, f35);
        for (const o of UNIT_OPTIONS) {
            comp[o.name] = Math.max(0, Math.round((comp[o.name] || 0) * attr.survival));
        }

        rows.push({ w, oil, funds, fleet, clearance, killFrac, attr, comp: { ...comp } });
    }
    return rows;
}

function compSummary(comp) {
    return UNIT_OPTIONS
        .filter(o => (comp[o.name] || 0) > 0)
        .map(o => `${comp[o.name]}×${o.name}`)
        .join(', ') || '(empty)';
}

function assessRegime(waves) {
    const bestOil = simulateOilPath(1, 0, waves).pop().oil;
    const midOil = simulateOilPath(0.7, 0.3, waves).pop().oil;
    const worstOil = simulateOilPath(0, 1, waves).pop().oil;
    if (bestOil >= CONST.OIL_WIN && midOil < CONST.OIL_WIN && worstOil <= CONST.OIL_LOSE) {
        return 'INTERMEDIARY — victory reachable at high kill rates; moderate play stalls; total failure collapses oil.';
    }
    if (bestOil >= CONST.OIL_WIN && midOil >= CONST.OIL_WIN) {
        return 'NEAR-OVERKILL — even ~70% kill rates reach win threshold by wave 20.';
    }
    if (bestOil < CONST.OIL_WIN) {
        return 'UNDERTUNED — even perfect kills may not reach win threshold in 20 waves.';
    }
    return 'HARD / ASYMMETRIC — oil swings are sharp; small kill-rate drops punish heavily.';
}

/** Run full deterministic report; returns structured summary for callers. */
function runBalanceSheet(options = {}) {
    const waves = options.waves ?? TUNING.WAVES;
    if (options.argv) applyCliOverrides(options.argv);

    const waveRows = [];
    for (let w = 1; w <= waves; w++) {
        const c = waveCounts(w);
        const dmg = convoyDamageRequired(w);
        const budget = convoyTimeBudget(w);
        waveRows.push({ w, c, dmg, budget, needDps: dmg.totalHp / budget });
    }

    const campaign = simulateCampaign(waves);
    const oilScenarios = TUNING.OIL_SCENARIOS.map(sc => {
        const traj = simulateOilPath(sc.kill, sc.escape, waves);
        const end = traj[traj.length - 1];
        return {
            ...sc,
            endOil: end.oil,
            hitWin: traj.some(r => r.oil >= CONST.OIL_WIN),
            hitLose: traj.some(r => r.oil <= CONST.OIL_LOSE),
        };
    });

    return {
        const: CONST,
        tuning: TUNING,
        pathLen: PATH_LEN,
        waveRows,
        unitDefs: UNIT_DEFS,
        oilScenarios,
        campaign,
        verdict: assessRegime(waves),
    };
}

function printBalanceSheet(report) {
    const { const: C0, tuning, pathLen, waveRows, unitDefs, oilScenarios, campaign, verdict } = report;
    const waves = waveRows.length;

    console.log('=== CONVOY BALANCE SHEET (coarse analytical model) ===\n');
    console.log(`Constants from live game | TR-7 path: ${pathLen.toFixed(0)} px`);
    console.log(`Start: $${C0.STARTING_FUNDS}M, oil $${C0.STARTING_OIL} | Win $${C0.OIL_WIN} / Lose $${C0.OIL_LOSE}`);
    console.log(`Tuning: max fleet=${tuning.MAX_FLEET_SIZE}, efficiency=${tuning.FLEET_EFFICIENCY}, CM/salvo=${tuning.CM_KILLS_PER_SALVO}, survival floor=${tuning.SURVIVAL_FLOOR}\n`);

    console.log('--- 1. Convoy damage pool per wave (HP to destroy all contacts) ---');
    console.log('Wave | Tkr | Esc | F35 | HP×   | Tanker HP | Escort HP | TOTAL HP | Budget(s) | Need DPS');
    console.log('-----|-----|-----|-----|-------|-----------|-----------|----------|-----------|--------');
    for (const row of waveRows) {
        const { w, c, dmg, budget, needDps } = row;
        console.log(
            `${String(w).padStart(4)} | ${String(c.tankers).padStart(3)} | ${String(c.escorts).padStart(3)} | ${String(c.f35).padStart(3)} | ` +
            `${hpScale(w).toFixed(2).padStart(5)} | ${Math.round(dmg.tankerHp).toLocaleString().padStart(9)} | ${Math.round(dmg.escortHp).toLocaleString().padStart(9)} | ` +
            `${Math.round(dmg.totalHp).toLocaleString().padStart(8)} | ${budget.toFixed(0).padStart(9)} | ${needDps.toFixed(0).padStart(6)}`
        );
    }

    console.log('\n--- 2. Unit sustained DPS (damage/cooldown, no upgrades) ---');
    unitDefs.forEach((d, i) => {
        const sd = sustainedDps(d, i);
        console.log(`  ${d.shortName.padEnd(12)} $${String(d.cost).padStart(3)}M  ${sd.toFixed(1)} DPS  (${(sd / d.cost).toFixed(3)} DPS/$M)`);
    });

    console.log('\n--- 3. Oil trajectories at fixed kill rates (ignores fleet model) ---');
    for (const sc of oilScenarios) {
        const traj = simulateOilPath(sc.kill, sc.escape, waves);
        const samples = [1, 5, 10, 15, waves].filter(n => n <= waves).map(n => `$${traj[n - 1].oil.toFixed(0)}`).join(' → ');
        console.log(`  ${sc.name.padEnd(14)} w${waves} $${sc.endOil.toFixed(0)}  [${samples}]  win:${sc.hitWin} lose:${sc.hitLose}`);
    }

    console.log('\n--- 4. Integrated campaign (greedy buy + clearance → oil + attrition) ---');
    for (const r of campaign) {
        console.log(
            `W${String(r.w).padStart(2)}: ${compSummary(r.comp).slice(0, 40).padEnd(40)} | ` +
            `${r.fleet.totalDps.toFixed(0)} eff-DPS | clear ×${r.clearance.toFixed(2)} kill ${(100 * r.killFrac).toFixed(0)}% | ` +
            `surv ${(100 * r.attr.survival).toFixed(0)}% | oil $${r.oil.toFixed(0)} funds $${Math.round(r.funds)}M`
        );
    }

    console.log('\n--- 5. Regime assessment ---');
    const w20Need = waveRows[waves - 1].needDps;
    const bestOil = oilScenarios.find(s => s.kill === 1).endOil;
    const midOil = oilScenarios.find(s => s.kill === 0.7)?.endOil ?? simulateOilPath(0.7, 0.3, waves).pop().oil;
    const worstOil = oilScenarios.find(s => s.kill === 0).endOil;
    const campEnd = campaign[campaign.length - 1];
    console.log(`Wave ${waves} convoy demand: ~${w20Need.toFixed(0)} effective DPS for full clearance`);
    console.log(`Oil @${waves} if 100% kills: $${bestOil.toFixed(0)} (${bestOil >= C0.OIL_WIN ? '≥ win' : '< win'})`);
    console.log(`Oil @${waves} if 70/30 split:  $${midOil.toFixed(0)}`);
    console.log(`Oil @${waves} if all escape:   $${worstOil.toFixed(0)} (${worstOil <= C0.OIL_LOSE ? '≤ lose' : '> lose'})`);
    console.log(`Integrated model @${waves}: oil $${campEnd.oil.toFixed(0)}, avg kill ${(100 * campaign.reduce((s, r) => s + r.killFrac, 0) / campaign.length).toFixed(0)}%`);
    console.log(`\nVERDICT: ${verdict}`);
}

module.exports = {
    TUNING,
    CONST,
    runBalanceSheet,
    printBalanceSheet,
    simulateOilPath,
    simulateCampaign,
    convoyDamageRequired,
    convoyTimeBudget,
    waveCounts,
};

if (require.main === module) {
    applyCliOverrides(process.argv.slice(2));
    printBalanceSheet(runBalanceSheet());
}
