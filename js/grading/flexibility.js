// ============================================================
// flexibility.js — Flexibility Scoring
// ============================================================

import { pool } from '../data/pool.js';
import { traits } from '../data/traits.js';

const TANK_ROLE           = 'Tank';
const TANK_SYNERGY_TRAITS = new Set(['Defender', 'Bruiser', 'Juggernaut', 'Warden']);

// ── Helpers ───────────────────────────────────────────────────

/**
 * Strength score for a unit at a given star level.
 * Mirrors the heuristic in positioning.js / board-generation/generator.js.
 */
function _unitStrength(name, stars) {
    const cost = pool[name]?.cost ?? 1;
    if      (stars === 2 && cost >= 7)                            return 12;
    else if (stars === 1 && cost >= 7)                            return 11;
    else if (stars === 2 && cost === 5)                           return 10;
    else if (stars === 2 && cost === 4)                           return  9;
    else if (stars === 1 && cost === 5)                           return  8;
    else if (stars === 2 && cost === 3)                           return  6;
    else if (stars === 1 && cost === 4)                           return  5;
    else if (stars === 2 && cost === 2)                           return  4;
    else if ((stars === 2 && cost === 1) || (stars === 1 && cost === 3)) return 3;
    else if (stars === 1 && cost === 2)                           return  2;
    else                                                          return  1;
}

/**
 * Identifies the main tank from the team planner and its reference strength.
 *
 * - The planner tank is the strongest Tank-role unit in teamPlan (compared at 1★).
 * - If it is currently on the board, the reference strength uses its actual star level.
 * - If it is not on the board, the reference strength uses 1★ (not yet acquired).
 * - Falls back to the strongest Tank on the board if teamPlan has no Tank.
 *
 * @param {string[]}                     teamPlan - Array of champion names from the planner snapshot
 * @param {Object.<string,{name,stars}>} board
 * @returns {{ name: string, refStrength: number } | null}
 */
function _plannerTank(teamPlan, board) {
    // Find the strongest Tank in the planner (evaluated at 1★ since planner has no star info)
    let plannerName = null;
    let plannerStr  = -1;
    for (const name of teamPlan) {
        if (pool[name]?.role !== TANK_ROLE) continue;
        const s = _unitStrength(name, 1);
        if (s > plannerStr) { plannerStr = s; plannerName = name; }
    }

    const plannerCost = plannerName ? (pool[plannerName]?.cost ?? 1) : 0;

    // A 2★ tank already on the board at equal-or-higher cost takes precedence as the
    // reference — an alternate must beat what you are actively fielding, not just what
    // you planned.
    let bestBoard2Star = null;
    for (const unit of Object.values(board)) {
        if (!unit || unit.stars !== 2 || pool[unit.name]?.role !== TANK_ROLE) continue;
        if ((pool[unit.name]?.cost ?? 1) < plannerCost) continue;
        if (!bestBoard2Star ||
            _unitStrength(unit.name, 2) > _unitStrength(bestBoard2Star.name, 2)) {
            bestBoard2Star = unit;
        }
    }
    if (bestBoard2Star) {
        return { name: bestBoard2Star.name, refStrength: _unitStrength(bestBoard2Star.name, 2) };
    }

    if (plannerName) {
        // Check if planner tank is on the board — if so, use its actual stars
        for (const unit of Object.values(board)) {
            if (unit?.name === plannerName) {
                return { name: plannerName, refStrength: _unitStrength(plannerName, unit.stars) };
            }
        }
        return { name: plannerName, refStrength: _unitStrength(plannerName, 1) };
    }

    // Fallback: no planner tank and no 2★ board tank — use strongest tank on board
    let best = null;
    for (const unit of Object.values(board)) {
        if (!unit || pool[unit.name]?.role !== TANK_ROLE) continue;
        if (!best || _unitStrength(unit.name, unit.stars) > _unitStrength(best.name, best.stars)) {
            best = unit;
        }
    }
    return best ? { name: best.name, refStrength: _unitStrength(best.name, best.stars) } : null;
}

/**
 * Counts units on board and bench that share a given trait.
 *
 * @param {string}                       traitName
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {number}
 */
function _traitCount(traitName, board, bench) {
    let count = 0;
    for (const unit of Object.values(board)) {
        if (unit && pool[unit.name]?.synergies.includes(traitName)) count++;
    }
    for (const unit of bench) {
        if (unit && pool[unit.name]?.synergies.includes(traitName)) count++;
    }
    return count;
}

// ── Alternate Tank Detection ──────────────────────────────────

/**
 * Identifies alternate tanks present in a shop snapshot.
 *
 * An alternate tank is a Tank-role shop unit satisfying all three conditions:
 *
 *  1. **Synergy-fieldable** — it has at least one tank synergy trait (Defender,
 *     Bruiser, Juggernaut, or Warden) whose first breakpoint can be reached by
 *     combining this unit with the player's existing board + bench.
 *     e.g. Garen on board (1 Defender) + shop Jarvan → 2 Defender ≥ breakpoint[0].
 *
 *  2. **Stronger at 2★** — its unit strength score at 2★ strictly exceeds the
 *     planner tank's reference strength: actual board stars if it's fielded,
 *     otherwise 1★ (not yet acquired).
 *
 *  3. **Equal or higher cost** — its cost is ≥ the planner tank's cost.
 *
 * Duplicate names in the shop are collapsed; each champion appears at most once.
 *
 * @param {string[]}                     shop     - Champion names in the current shop (may contain nulls)
 * @param {Object.<string,{name,stars}>} board    - Board state snapshot
 * @param {({name,stars}|null)[]}        bench    - Bench state snapshot
 * @param {string[]}                     teamPlan - Planner champion names snapshot
 * @returns {Array<{
 *   name: string,
 *   cost: number,
 *   qualifyingTrait: string,
 *   traitCount: number
 * }>} Units qualifying as alternate tanks, with the first qualifying trait noted.
 */
export function findAlternateTanks(shop, board, bench, teamPlan) {
    const mainTank = _plannerTank(teamPlan, board);
    if (!mainTank) return [];

    const mainTankCost     = pool[mainTank.name]?.cost ?? 1;
    const mainTankStrength = mainTank.refStrength;

    const seen    = new Set();
    const results = [];

    for (const champName of shop) {
        if (!champName || seen.has(champName)) continue;
        seen.add(champName);

        const data = pool[champName];
        if (!data || data.role !== TANK_ROLE) continue;

        // Condition 3: equal or higher cost than main tank
        if (data.cost < mainTankCost) continue;

        // Condition 2: must be strictly stronger than the main tank's current level at 2★
        if (_unitStrength(champName, 2) <= mainTankStrength) continue;

        // Condition 1: at least one tank synergy whose breakpoint is reachable
        let qualifyingTrait = null;
        let qualifyingCount = 0;
        for (const trait of data.synergies) {
            if (!TANK_SYNERGY_TRAITS.has(trait)) continue;
            const traitData = traits[trait];
            if (!traitData) continue;
            const existing = _traitCount(trait, board, bench);
            // existing counts units already on board/bench; +1 accounts for this shop unit
            if (existing + 1 >= traitData.breakpoints[0]) {
                qualifyingTrait = trait;
                qualifyingCount = existing + 1;
                break;
            }
        }
        if (!qualifyingTrait) continue;

        results.push({ name: champName, cost: data.cost, qualifyingTrait, traitCount: qualifyingCount });
    }

    return results;
}

// ── Missed Opportunities ──────────────────────────────────────

/**
 * Identifies alternate tank opportunities the player passed on across all rolls.
 *
 * A missed opportunity is an alternate tank that appeared in the shop but was
 * not purchased before the next roll.
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {Array<{
 *   rollNumber: number,
 *   name: string,
 *   cost: number,
 *   qualifyingTrait: string,
 *   traitCount: number
 * }>}
 */
export function findMissedAlternateTanks(events) {
    const missed     = [];
    const rollEvents = events.filter(e => e.type === 'roll');

    for (let i = 0; i < rollEvents.length; i++) {
        const roll     = rollEvents[i];
        const nextRoll = rollEvents[i + 1];

        const bought = new Set(
            events
                .slice(events.indexOf(roll) + 1, nextRoll ? events.indexOf(nextRoll) : undefined)
                .filter(e => e.type === 'buy')
                .map(e => e.champName)
        );

        const alts = findAlternateTanks(roll.shopAfter, roll.board, roll.bench, roll.teamPlan);
        for (const alt of alts) {
            if (!bought.has(alt.name)) {
                missed.push({ rollNumber: i + 1, ...alt });
            }
        }
    }

    return missed;
}

// ── Flexibility Score ─────────────────────────────────────────

/**
 * Scores how often the player capitalised on alternate tank opportunities
 * that appeared in the shop.
 *
 * Penalty schedule: −15 per missed alternate tank (floor 0).
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {number} Flexibility score (0–100)
 */
export function calcFlexibility(events) {
    const missed = findMissedAlternateTanks(events);
    return Math.max(0, 100 - 15 * missed.length);
}

// ── Temporary debug hook ──────────────────────────────────────

import { state } from '../state.js';
import { getEvents } from '../round.js';

document.addEventListener('roundcomplete', () => {
    const events = getEvents();
    console.log(`[grading/flexibility] Flexibility: ${calcFlexibility(events)} | Missed alt tanks:`, findMissedAlternateTanks(events));
});
