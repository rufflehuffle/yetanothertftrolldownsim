// ============================================================
// speed.js — Speed Scoring
// ============================================================

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns the elapsed duration of the round in milliseconds.
 * Uses the round:end event if present; falls back to the last event.
 */
function _roundDurationMs(events) {
    const endEvent = events.find(e => e.type === 'round:end');
    if (endEvent) return endEvent.t;
    const last = events[events.length - 1];
    return last ? last.t : 0;
}

/**
 * Calculates Actions Per Minute for a rolldown round.
 *
 * Counted actions: unit buys, unit sells, unit moves, shop rolls.
 * buyXp is intentionally excluded — it is a resource action,
 * not a micro decision in the context of a rolldown.
 *
 * Duration is measured to the last counted action, not round end,
 * so short rolldowns are not penalised for finishing early.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {{ apm: number, buys: number, sells: number, moves: number, rolls: number }}
 *   APM rounded to one decimal place (0 if no actions), plus per-type counts.
 */
function _calcApm(events) {
    const counts = { buys: 0, sells: 0, moves: 0, rolls: 0 };
    let lastActionTs = 0;

    for (const event of events) {
        if (event.type === 'buy')  { counts.buys++;  lastActionTs = event.t; continue; }
        if (event.type === 'sell') { counts.sells++; lastActionTs = event.t; continue; }
        if (event.type === 'roll') { counts.rolls++; lastActionTs = event.t; continue; }
        if (event.type === 'move') {
            if (event.from.type === 'bench' && event.to.type === 'bench') continue;
            counts.moves++;
            lastActionTs = event.t;
        }
    }

    const total = counts.buys + counts.sells + counts.moves + counts.rolls;
    const durationMs = lastActionTs > 0 ? lastActionTs : _roundDurationMs(events);
    const apm = durationMs > 0
        ? Math.round((total / (durationMs / 60_000)) * 10) / 10
        : 0;

    return { apm, ...counts };
}

// ── Rolldown Speed ────────────────────────────────────────────

/**
 * Measures rolldown speed: rolls per second during the roll sequence.
 *
 * Numerator:   number of roll actions in the rolldown.
 * Denominator: elapsed time from the first roll to the last roll (seconds).
 *
 * Returns 0 if there are fewer than 2 roll events (duration would be zero).
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {{ rollsPerSecond: number, rolls: number, durationMs: number }}
 *   rollsPerSecond rounded to two decimal places.
 */
export function calcRolldownSpeed(events) {
    const rollEvents = events.filter(e => e.type === 'roll');
    const rolls = rollEvents.length;

    if (rolls < 2) return { rollsPerSecond: 0, rolls, durationMs: 0 };

    const durationMs = rollEvents[rolls - 1].t - rollEvents[0].t;
    const rollsPerSecond = durationMs > 0
        ? Math.round((rolls / (durationMs / 1_000)) * 100) / 100
        : 0;

    return { rollsPerSecond, rolls, durationMs };
}

// ── Speed ─────────────────────────────────────────────────────

const TARGET_ROLLS_PER_SECOND = 1 / 1.5;
const ROLL_WEIGHT = 70;
const TARGET_APM = 80;
const APM_WEIGHT = 30;

/**
 * Scores player speed from rolldown speed, APM, and a roll-volume bonus.
 *
 * Formula: (rollsPerSecond / targetRollsPerSecond × rollWeight) + (APM / targetAPM × APMWeight) + rollBonus
 *
 * Roll bonus: +5 for ≥10 rolls, +10 for ≥15, +20 for ≥20.
 * These thresholds are exclusive — only the highest matching
 * tier applies. Final score is capped at 100.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {number} Speed score (0–100)
 */
export function calcSpeed(events) {
    const { apm, rolls } = _calcApm(events);
    const { rollsPerSecond } = calcRolldownSpeed(events);

    let rollBonus = 0;
    if      (rolls >= 20) rollBonus = 20;
    else if (rolls >= 15) rollBonus = 10;
    else if (rolls >= 10) rollBonus =  5;

    return Math.min(100,
        (rollsPerSecond / TARGET_ROLLS_PER_SECOND * ROLL_WEIGHT) +
        (apm / TARGET_APM * APM_WEIGHT) +
        rollBonus
    );
}

// ── Temporary debug hook ──────────────────────────────────────

import { getEvents } from '../round.js';

document.addEventListener('roundcomplete', () => {
    const events = getEvents();
    const { apm, buys, sells, moves, rolls } = _calcApm(events);
    const speed = calcSpeed(events);
    const { rollsPerSecond, durationMs } = calcRolldownSpeed(events);
    console.log(`[grading/speed] APM: ${apm} (buys: ${buys}, sells: ${sells}, moves: ${moves}, rolls: ${rolls}) | Speed: ${speed} | Rolldown: ${rollsPerSecond} r/s over ${durationMs}ms`);
});
