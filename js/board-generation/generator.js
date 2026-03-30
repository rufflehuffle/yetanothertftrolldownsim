import { pool } from '../data/pool.js';
import { isOriginallyLocked } from '../state.js';
import { getBestBoard, getStrongestTankAndCarry, calcBoardStrength } from '../board-strength.js';
import { SHOP_SEQUENCE, SECONDARY_GOLD_FLOOR, FRONTLINE_ROLES } from './constants.js';
import { localActiveBreakpoint, localSellValue, buildTraitCounts } from './helpers.js';
import { simulateShop } from './shop-sim.js';
import { getMainCarryAndTank } from './carry-tank.js';
import { placeBoardUnits } from './positioning.js';
import { is2CostReroll } from './detect-reroll.js';
import { generate32Board } from './reroll-generator.js';

export { buildTraitCounts } from './helpers.js';

// ============================================================
// Router — picks the right generator based on comp detection.
// ============================================================
export function generateBoard(teamPlan) {
    const targetNames = [...teamPlan].filter(n => pool[n]);
    if (!targetNames.length) return null;

    if (is2CostReroll(targetNames)) return generate32Board(teamPlan);
    return generate41Board(teamPlan);
}

// ============================================================
// Main export
//
// Assumptions:
//   • Lv.7, 140g available at 4-1 (total spending budget before buying XP)
//   • Standard leveling curve (see SHOP_SEQUENCE in constants.js)
//   • One natural shop per round — no rolling
//   • After unit buys, gold is spent on XP (4g / 4 XP) until gold would
//     drop below 50 or XP reaches 58 (just shy of levelling to 8)
//   • Board effects (Tibbers / Ice Tower / Sand Soldiers) fire on
//     first unit interaction after load (applyBoardEffects lives
//     in main.js which cannot be imported here without a cycle).
// ============================================================
export function generate41Board(teamPlan) {
    const targetNames = [...teamPlan].filter(n => pool[n]);
    if (!targetNames.length) return null;

    const targetSet = new Set(targetNames);
    const { mainCarry, mainTank } = getMainCarryAndTank(targetNames);

    // Buy targets:
    //   Priority  — comp units                                    → always buy if affordable
    //   Secondary — any frontline unit or trait-sharing unit      → only buy if gold ≥ floor
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

        // ── Simulate shops & buy ───────────────────────────────
        let gold        = 140;
        const rawCopies = {};
        const taken     = {};

        for (const level of SHOP_SEQUENCE) {
            const shop = simulateShop(level, taken);
            for (const champName of shop) {
                if (!champName || !buyTargets.has(champName)) continue;
                const cost        = pool[champName].cost;
                const isSecondary = !priorityTargets.has(champName);
                if (gold < cost) continue;
                if (isSecondary && gold < SECONDARY_GOLD_FLOOR) continue;

                rawCopies[champName] = (rawCopies[champName] ?? 0) + 1;
                taken[champName]     = (taken[champName] ?? 0) + 1;
                gold -= cost;
            }
        }

        // ── Guaranteed copy for originally-locked comp units ──
        for (const name of targetNames) {
            if (!isOriginallyLocked(name)) continue;
            const cost = pool[name].cost;
            if (cost === 5 || cost === 7) continue;
            if (gold < cost) continue;
            rawCopies[name] = (rawCopies[name] ?? 0) + 1;
            taken[name]     = (taken[name] ?? 0) + 1;
            gold -= cost;
        }

        // ── Guaranteed 1-cost copies for planner units ────────
        const oneCosters = targetNames.filter(n => pool[n].cost === 1);
        if (oneCosters.length > 0) {
            for (const name of oneCosters) {
                if (gold < 1) break;
                rawCopies[name] = (rawCopies[name] ?? 0) + 1;
                taken[name]     = (taken[name] ?? 0) + 1;
                gold -= 1;
            }
            for (let i = 0; i < 2; i++) {
                const name = oneCosters[Math.floor(Math.random() * oneCosters.length)];
                if (gold < 1) break;
                rawCopies[name] = (rawCopies[name] ?? 0) + 1;
                taken[name]     = (taken[name] ?? 0) + 1;
                gold -= 1;
            }
        }

        // ── Cap copies at 3; sell excess ──────────────────────
        for (const [name, count] of Object.entries(rawCopies)) {
            if (count > 3) {
                gold += (count - 3) * pool[name].cost;
                rawCopies[name] = 3;
            }
        }

        // ── Star-ups: 3 copies → 1 unit at 2★ ────────────────
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

        // ── Dedup — no duplicate names ────────────────────────
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

        // ── Board selection ────────────────────────────────────
        // Build the best 7-unit board first using synergy-aware EHP×DPS scoring,
        // then identify the strongest tank and carry from the result.
        const boardUnits = getBestBoard(dedupHolding, 7);
        const { bestCarry } = getStrongestTankAndCarry(boardUnits);

        // ── Score candidate board ─────────────────────────────
        // Per planner unit on board:  +(6 - cost)  [lower cost = more points]
        // Per planner unit on bench:  -(6 - cost)  [symmetric penalty]
        // Main carry on board:        +3 bonus
        // Main tank on board:         +3 bonus
        const boardNames = new Set(boardUnits.map(u => u.name));
        let plannerScore = 0;
        for (const name of targetNames) {
            const weight = 6 - pool[name].cost;
            if (boardNames.has(name))                         plannerScore += weight;
            else if (dedupHolding.some(u => u.name === name)) plannerScore -= weight;
        }
        if (mainCarry && boardNames.has(mainCarry.name)) plannerScore += 3;
        if (mainTank  && boardNames.has(mainTank.name))  plannerScore += 3;

        // ── Trait scoring ──────────────────────────────────────
        const boardTraitCounts = buildTraitCounts(boardUnits.map(u => u.name));

        // +2 per active trait contributed by the main carry / main tank on board.
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

        // +1 per distinct trait on the board that is at an active breakpoint.
        let activeTraitCount = 0;
        for (const [traitName, count] of Object.entries(boardTraitCounts)) {
            if (localActiveBreakpoint(traitName, count) > 0) activeTraitCount++;
        }

        // ── Build full result for every attempt ───────────────
        // (needed so any attempt can be returned as a fallback)
        const boardSet = new Set(boardUnits);

        // Bench: leftover dedup units + dedup extras
        const benchUnits = [
            ...dedupHolding.filter(u => !boardSet.has(u)),
            ...extraBench,
        ];

        // Sell non-planner units not on board
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

        // Buy XP: spend gold on XP until < 50g remaining or 58 XP
        let xp = 0;
        while (gold - 4 >= 50 && xp + 4 <= 58) {
            gold -= 4;
            xp   += 4;
        }

        // Placement
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
            level: 7,
        };

        // ── Fallback: track strongest board by raw EHP×DPS ────
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
