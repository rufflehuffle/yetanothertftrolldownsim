// ============================================================
// accuracy.js — Accuracy Scoring
// ============================================================

import { pool } from '../tables.js';
import { avgShopsForCopies, plannerCarryName, plannerTankName } from './helper.js';

// ── Missed Units ──────────────────────────────────────────────

/**
 * Identifies units in each shop that the player had an existing copy of,
 * could afford at roll time, but did not buy before the next roll.
 *
 * Non-planner units (on board/bench but not in teamPlan) only count as missed
 * if they satisfy at least one of:
 *   1. They appear on the final board (round:end snapshot).
 *   2. Their cost equals the main carry's cost or the main tank's cost.
 *
 * Relies on roll events including bench/board snapshots (captured at roll time
 * in RollCommand) and goldAfter to avoid replaying the event log.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {Array<{ rollNumber: number, champName: string, cost: number, goldAvailable: number, weight: number }>}
 */
export function findMissedUnits(events) {
    const missed = [];
    const rollEvents = events.filter(e => e.type === 'roll');

    // Final board for non-planner condition (1)
    const endEvent = events.find(e => e.type === 'round:end');
    const finalBoardNames = new Set(
        Object.values(endEvent?.board ?? {}).filter(Boolean).map(u => u.name)
    );

    for (let i = 0; i < rollEvents.length; i++) {
        const roll = rollEvents[i];
        const goldAvailable = roll.goldAfter;
        const nextRoll = rollEvents[i + 1];

        const bought = new Set(
            events
                .slice(events.indexOf(roll) + 1, nextRoll ? events.indexOf(nextRoll) : undefined)
                .filter(e => e.type === 'buy')
                .map(e => e.champName)
        );

        // Key unit costs for non-planner condition (2)
        const mainCarryCost = pool[plannerCarryName(roll.teamPlan, roll.board)]?.cost ?? 0;
        const mainTankCost  = pool[plannerTankName(roll.teamPlan, roll.board)]?.cost ?? 0;

        const seen = new Set();
        for (const champName of roll.shopAfter) {
            if (!champName || seen.has(champName)) continue;
            seen.add(champName);
            if (bought.has(champName)) continue;
            const cost = pool[champName]?.cost;
            if (cost == null || goldAvailable < cost) continue;

            const isPlanner      = roll.teamPlan.includes(champName);
            const onBoardOrBench = Object.values(roll.board).some(u => u?.name === champName) ||
                                   roll.bench.some(u => u?.name === champName);

            if (!isPlanner && !onBoardOrBench) continue;

            // Non-planner units require an additional qualifying condition
            if (!isPlanner) {
                const onFinalBoard  = finalBoardNames.has(champName);
                const sameAsKeyUnit = cost === mainCarryCost || cost === mainTankCost;
                if (!onFinalBoard && !sameAsKeyUnit) continue;
            }

            const alreadyTwoStar = Object.values(roll.board).some(u => u?.name === champName && u.stars >= 2) ||
                                   roll.bench.some(u => u?.name === champName && u.stars >= 2);
            if (alreadyTwoStar) continue;
            const expectedRolls = avgShopsForCopies(champName, 1, roll.board, roll.bench, roll.level);
            const weight = isFinite(expectedRolls) ? expectedRolls * 2 / 5 : 0;
            missed.push({ rollNumber: i + 1, champName, cost, goldAvailable, weight });
        }
    }

    return missed;
}

// ── Accuracy ──────────────────────────────────────────────────

/**
 * Scores how accurately the player bought units they were rolling for.
 * Penalty per missed unit = expected rolls to find another copy × 2 gold/roll.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {number} Accuracy score (0–100)
 */
export function calcAccuracy(events) {
    const missed = findMissedUnits(events);
    const penalty = missed.reduce((sum, m) => sum + m.weight, 0);
    return Math.max(0, 100 - penalty);
}

// ── Temporary debug hook ──────────────────────────────────────

import { getEvents } from '../round.js';

document.addEventListener('roundcomplete', () => {
    const events = getEvents();
    const missedUnits = findMissedUnits(events);
    console.log(`[grading/accuracy] Accuracy: ${calcAccuracy(events)} | Missed units:`, missedUnits);
});
