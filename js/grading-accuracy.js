// ============================================================
// grading-accuracy.js — Accuracy Scoring
// ============================================================

import { pool } from './tables.js';

// ── Missed Units ──────────────────────────────────────────────

/**
 * Identifies units in each shop that the player had an existing copy of,
 * could afford at roll time, but did not buy before the next roll.
 *
 * Relies on roll events including bench/board snapshots (captured at roll time
 * in RollCommand) and goldAfter to avoid replaying the event log.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {Array<{ rollNumber: number, champName: string, cost: number, goldAvailable: number }>}
 */
export function findMissedUnits(events) {
    const missed = [];
    const rollEvents = events.filter(e => e.type === 'roll');

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

        const seen = new Set();
        for (const champName of roll.shopAfter) {
            if (!champName || seen.has(champName)) continue;
            seen.add(champName);
            if (bought.has(champName)) continue;
            const cost = pool[champName]?.cost;
            if (cost == null || goldAvailable < cost) continue;
            const owned = Object.values(roll.board).some(u => u?.name === champName) ||
                          roll.bench.some(u => u?.name === champName) ||
                          roll.teamPlan.includes(champName);
            if (owned) missed.push({ rollNumber: i + 1, champName, cost, goldAvailable });
        }
    }

    return missed;
}

// ── Accuracy ──────────────────────────────────────────────────

/**
 * Scores how accurately the player bought units they were rolling for.
 *
 * TODO: improve beyond simple missed-unit penalty — consider factors such as
 *   main tanks & carries being weighed more, gold-constrained
 *   misses, and whether the unit was actually needed for a star-up.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {number} Accuracy score (0–100)
 */
export function calcAccuracy(events) {
    const missed = findMissedUnits(events);
    return Math.max(0, 100 - 5 * missed.length);
}

// ── Temporary debug hook ──────────────────────────────────────

import { getEvents } from './round.js';

document.addEventListener('roundcomplete', () => {
    const events = getEvents();
    const missedUnits = findMissedUnits(events);
    console.log('[grading-accuracy] Missed units:', missedUnits);
    console.log(`[grading-accuracy] Accuracy: ${calcAccuracy(events)}`);
});
