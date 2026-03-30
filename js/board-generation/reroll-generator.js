import { pool } from '../data/pool.js';
import { getBestBoard, getStrongestTankAndCarry, calcBoardStrength } from '../board-strength.js';
import { FRONTLINE_ROLES, SECONDARY_GOLD_FLOOR } from './constants.js';
import { localActiveBreakpoint, localSellValue, buildTraitCounts } from './helpers.js';
import { simulateShop } from './shop-sim.js';
import { get2CostCarryAndTank } from './detect-reroll.js';
import { placeBoardUnits } from './positioning.js';

// Shop levels visited during a standard 1-1 → 3-2 curve (2-cost reroll).
// 1-1: Lv2, 1-2: Lv3, 1-3: Lv3,
// 2-1: Lv3, 2-2: Lv4, 2-3: Lv4, 2-5: Lv4, 2-6: Lv5, 2-7: Lv5,
// 3-1: Lv5, 3-2: Lv5
const REROLL_SHOP_SEQUENCE = [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5];

// XP cap: 2 short of levelling from 5 → 6.
// xp_to_level[5] = 20 in the code table.
const XP_CAP = 18;

// ============================================================
// Main export
//
// Assumptions:
//   • Lv.5, 100g available at 3-2
//   • Preseeded: 2 copies of main carry + 1 copy of each other
//     2-cost comp unit (free — simulates natural accumulation)
//   • Standard reroll curve (see REROLL_SHOP_SEQUENCE)
//   • After unit buys, gold is spent on XP until gold would drop
//     below 50 or XP reaches the cap (2 short of levelling)
//   • Board size: 5 units (level 5)
// ============================================================
export function generate32Board(teamPlan) {
    const targetNames = [...teamPlan].filter(n => pool[n]);
    if (!targetNames.length) return null;

    const targetSet = new Set(targetNames);
    const { mainCarry, mainTank } = get2CostCarryAndTank(targetNames);

    // Buy targets (same logic as 4-1 generator, but skip 4-cost+ units)
    const priorityTargets = new Set(targetNames);
    const compTraits = new Set(targetNames.flatMap(n => pool[n]?.synergies ?? []));
    const secondaryTargets = new Set(
        Object.values(pool)
            .filter(c => {
                if (targetSet.has(c.name)) return false;
                if (FRONTLINE_ROLES.has(c.role)) return true;
                if (c.synergies.some(t => compTraits.has(t))) return true;
                return false;
            })
            .map(c => c.name)
    );
    const buyTargets = new Set([...priorityTargets, ...secondaryTargets]);

    const NUM_CANDIDATES = 5;
    const MAX_ATTEMPTS   = 1000;
    let bestResult       = null;
    let bestScore        = -1;
    let validCount       = 0;
    let fallbackResult   = null;
    let fallbackScore    = -1;

    const startTime = performance.now();

    for (let attempt = 0; attempt < MAX_ATTEMPTS && validCount < NUM_CANDIDATES; attempt++) {
        if (performance.now() - startTime > 100) break;

        let gold        = 100;
        const rawCopies = {};
        const taken     = {};

        // ── Preseed: 1 free copy each of main carry and main tank ─
        for (const champ of [mainCarry, mainTank]) {
            if (!champ) continue;
            rawCopies[champ.name] = (rawCopies[champ.name] ?? 0) + 1;
            taken[champ.name]     = (taken[champ.name] ?? 0) + 1;
        }

        // ── Simulate shops & buy ─────────────────────────────────
        for (const level of REROLL_SHOP_SEQUENCE) {
            const shop = simulateShop(level, taken);
            for (const champName of shop) {
                if (!champName || !buyTargets.has(champName)) continue;
                const cost        = pool[champName].cost;
                if (cost >= 4) continue; // skip 4-cost+ at 3-2
                const isSecondary = !priorityTargets.has(champName);
                if (gold < cost) continue;
                if (isSecondary && gold < SECONDARY_GOLD_FLOOR) continue;

                rawCopies[champName] = (rawCopies[champName] ?? 0) + 1;
                taken[champName]     = (taken[champName] ?? 0) + 1;
                gold -= cost;
            }
        }

        // ── Cap copies at 3; sell excess ─────────────────────────
        for (const [name, count] of Object.entries(rawCopies)) {
            if (count > 3) {
                gold += (count - 3) * pool[name].cost;
                rawCopies[name] = 3;
            }
        }

        // ── Star-ups: 3 copies → 1 unit at 2★ ──────────────────
        const holding = [];
        for (const [name, count] of Object.entries(rawCopies)) {
            if (count === 3) {
                holding.push({ name, stars: 2 });
            } else {
                for (let i = 0; i < count; i++) holding.push({ name, stars: 1 });
            }
        }

        const sortFn = (a, b) => (pool[b.name].cost - pool[a.name].cost) || (b.stars - a.stars);
        holding.sort(sortFn);

        // ── Dedup — no duplicate names ───────────────────────────
        const seenNames    = new Set();
        const dedupHolding = [];
        const extraBench   = [];

        for (const unit of holding) {
            if (seenNames.has(unit.name)) {
                extraBench.push(unit);
            } else {
                seenNames.add(unit.name);
                dedupHolding.push(unit);
            }
        }

        // ── Board selection (5 units at level 5) ─────────────────
        const boardUnits = getBestBoard(dedupHolding, 5);
        const { bestCarry } = getStrongestTankAndCarry(boardUnits);

        // ── Score candidate board ────────────────────────────────
        const boardNames = new Set(boardUnits.map(u => u.name));
        let plannerScore = 0;
        for (const name of targetNames) {
            const weight = 6 - pool[name].cost;
            if (boardNames.has(name))                         plannerScore += weight;
            else if (dedupHolding.some(u => u.name === name)) plannerScore -= weight;
        }
        if (mainCarry && boardNames.has(mainCarry.name)) plannerScore += 3;
        if (mainTank  && boardNames.has(mainTank.name))  plannerScore += 3;

        const boardTraitCounts = buildTraitCounts(boardUnits.map(u => u.name));

        let carryTraitScore = 0;
        if (mainCarry && boardNames.has(mainCarry.name)) {
            for (const t of pool[mainCarry.name].synergies) {
                if (localActiveBreakpoint(t, boardTraitCounts[t] ?? 0) > 0) carryTraitScore += 2;
            }
        }
        let tankTraitScore = 0;
        if (mainTank && boardNames.has(mainTank.name)) {
            for (const t of pool[mainTank.name].synergies) {
                if (localActiveBreakpoint(t, boardTraitCounts[t] ?? 0) > 0) tankTraitScore += 2;
            }
        }

        let activeTraitCount = 0;
        for (const [traitName, count] of Object.entries(boardTraitCounts)) {
            if (localActiveBreakpoint(traitName, count) > 0) activeTraitCount++;
        }

        // ── Build full result ────────────────────────────────────
        const boardSet = new Set(boardUnits);

        const benchUnits = [
            ...dedupHolding.filter(u => !boardSet.has(u)),
            ...extraBench,
        ];

        const finalBench = [];
        for (const unit of benchUnits) {
            if (!targetSet.has(unit.name) && !boardNames.has(unit.name)) {
                gold += localSellValue(unit);
            } else {
                finalBench.push(unit);
            }
        }

        // Sell excess — 2-cost first → 3-cost → 1-cost
        const SELL_PRIO = { 2: 1, 3: 2, 1: 3, 4: 4, 5: 5 };
        while (boardUnits.length + finalBench.length > 15) {
            finalBench.sort((a, b) =>
                (SELL_PRIO[pool[a.name].cost] ?? 99) - (SELL_PRIO[pool[b.name].cost] ?? 99)
            );
            gold += localSellValue(finalBench.shift());
        }

        // ── Buy XP ──────────────────────────────────────────────
        let xp = 0;
        while (gold - 4 >= 50 && xp + 4 <= XP_CAP) {
            gold -= 4;
            xp   += 4;
        }

        // ── Placement ────────────────────────────────────────────
        const boardState = placeBoardUnits(boardUnits, bestCarry);

        const plannerOnBench = finalBench.filter(u =>  targetSet.has(u.name));
        const otherOnBench   = finalBench.filter(u => !targetSet.has(u.name));

        const benchState = Array(9).fill(null);
        otherOnBench.slice(0, 9).forEach((u, i) => { benchState[i] = u; });
        plannerOnBench.slice(0, 9).forEach((u, i) => { benchState[8 - i] = u; });

        const candidateResult = {
            board: boardState,
            bench: benchState,
            gold:  Math.max(0, gold),
            xp,
            level: 5,
        };

        // ── Fallback: track strongest board by raw EHP×DPS ──────
        const rawScore = calcBoardStrength(boardUnits);
        if (rawScore > fallbackScore) {
            fallbackScore  = rawScore;
            fallbackResult = candidateResult;
        }

        // ── Reject boards where any non-planned unit has no active traits ──
        const hasTraitless = boardUnits.some(unit =>
            !targetSet.has(unit.name) &&
            !pool[unit.name].synergies.some(
                t => localActiveBreakpoint(t, boardTraitCounts[t] ?? 0) > 0
            )
        );
        if (hasTraitless) continue;

        const totalScore = plannerScore + carryTraitScore + tankTraitScore + activeTraitCount;
        if (totalScore <= bestScore) continue;
        validCount++;

        bestScore  = totalScore;
        bestResult = candidateResult;
    }

    return bestResult ?? fallbackResult;
}
