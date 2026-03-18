// ============================================================
// helper.js — Shared Grading Helpers
// ============================================================

import { pool, shop_odds } from '../tables.js';

/**
 * Count how many physical copies of a unit the player owns across board and bench.
 * A 1★ unit = 1 copy; a 2★ unit = 3 copies.
 *
 * @param {string}                       unitName
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {number}
 */
export function _countOwnedCopies(unitName, board, bench) {
    let count = 0;
    for (const unit of Object.values(board)) {
        if (unit?.name === unitName) count += unit.stars === 2 ? 3 : 1;
    }
    for (const unit of bench) {
        if (unit?.name === unitName) count += unit.stars === 2 ? 3 : 1;
    }
    return count;
}

/**
 * Count total remaining copies in the pool for a given cost tier,
 * accounting for all units already owned on board and bench.
 *
 * @param {number}                       costTier
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {number}
 */
export function _totalRemainingByCost(costTier, board, bench) {
    let total = 0;
    for (const [name, data] of Object.entries(pool)) {
        if (data.cost !== costTier) continue;
        total += Math.max(0, data.copies_in_pool - _countOwnedCopies(name, board, bench));
    }
    return total;
}

/**
 * Average number of shops needed to see `copiesNeeded` more copies of `unitName`
 * in the shop, given that the current board and bench deplete the shared pool.
 *
 * Uses the standard TFT probability model:
 *   p(slot = unit) = shop_odds[level][cost] × (remaining_unit / remaining_cost_tier)
 *   expected shops = copiesNeeded / (5 × p)
 *
 * @param {string}                       unitName
 * @param {number}                       copiesNeeded  - Additional copies to see in shop
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level         - Current player level (2–10)
 * @returns {number} Expected shops (Infinity if the copies cannot appear in pool)
 */
/** Strength score for a unit at a given star level. */
function _unitStrength(name, stars) {
    const cost = pool[name]?.cost ?? 1;
    if      (stars === 2 && cost >= 7)                                return 12;
    else if (stars === 1 && cost >= 7)                                return 11;
    else if (stars === 2 && cost === 5)                               return 10;
    else if (stars === 2 && cost === 4)                               return  9;
    else if (stars === 1 && cost === 5)                               return  8;
    else if (stars === 2 && cost === 3)                               return  6;
    else if (stars === 1 && cost === 4)                               return  5;
    else if (stars === 2 && cost === 2)                               return  4;
    else if ((stars === 2 && cost === 1) || (stars === 1 && cost === 3)) return 3;
    else if (stars === 1 && cost === 2)                               return  2;
    else                                                              return  1;
}

/**
 * Name of the strongest non-Tank unit in the team planner.
 * Falls back to the strongest non-Tank on the board if the planner has no carries.
 *
 * @param {string[]}                     teamPlan
 * @param {Object.<string,{name,stars}>} board
 * @returns {string|null}
 */
export function plannerCarryName(teamPlan, board) {
    let best = null, bestStr = -1;
    for (const name of teamPlan) {
        if (pool[name]?.role === 'Tank') continue;
        const s = _unitStrength(name, 1);
        if (s > bestStr) { bestStr = s; best = name; }
    }
    if (best) return best;

    let boardBest = null;
    for (const unit of Object.values(board)) {
        if (!unit || pool[unit.name]?.role === 'Tank') continue;
        if (!boardBest ||
            _unitStrength(unit.name, unit.stars) > _unitStrength(boardBest.name, boardBest.stars))
            boardBest = unit;
    }
    return boardBest ? boardBest.name : null;
}

/**
 * Name of the strongest Tank-role unit in the team planner.
 * Falls back to the strongest Tank on the board if the planner has no Tanks.
 *
 * @param {string[]}                     teamPlan
 * @param {Object.<string,{name,stars}>} board
 * @returns {string|null}
 */
export function plannerTankName(teamPlan, board) {
    let best = null, bestStr = -1;
    for (const name of teamPlan) {
        if (pool[name]?.role !== 'Tank') continue;
        const s = _unitStrength(name, 1);
        if (s > bestStr) { bestStr = s; best = name; }
    }
    if (best) return best;

    let boardBest = null;
    for (const unit of Object.values(board)) {
        if (!unit || pool[unit.name]?.role !== 'Tank') continue;
        if (!boardBest ||
            _unitStrength(unit.name, unit.stars) > _unitStrength(boardBest.name, boardBest.stars))
            boardBest = unit;
    }
    return boardBest ? boardBest.name : null;
}

export function avgShopsForCopies(unitName, copiesNeeded, board, bench, level) {
    if (copiesNeeded <= 0) return 0;

    const data = pool[unitName];
    if (!data) return Infinity;

    const owned           = _countOwnedCopies(unitName, board, bench);
    const remainingUnit   = Math.max(0, data.copies_in_pool - owned);
    if (remainingUnit < copiesNeeded) return Infinity;

    const odds      = shop_odds[Math.min(Math.max(level, 2), 10)];
    const tierOdds  = odds[data.cost] ?? 0;
    if (tierOdds === 0) return Infinity;

    const totalRemaining = _totalRemainingByCost(data.cost, board, bench);
    if (totalRemaining === 0) return Infinity;

    // P(a single shop slot shows this unit)
    const p = tierOdds * (remainingUnit / totalRemaining);
    if (p === 0) return Infinity;

    // Each shop has 5 independent slots; expected copies per shop = 5p
    return copiesNeeded / (5 * p);
}
