import { pool, traits } from './tables.js';

// ─── Normalised EHP by cost: [_, 1★, 2★, 3★]  (baseline: avg 1-cost 1★ = 1.0) ─
export const AVG_EHP = {
    1: [0,  1.0,  1.67,  2.9],
    2: [0,  1.49, 2.39,  4.12],
    3: [0,  1.88, 3.05,  5.09],
    4: [0,  2.74, 4.64, 14.51],
    5: [0,  1.44, 2.41,  5.25],
};

// ─── Normalised DPS by cost: [_, 1★, 2★, 3★]  (baseline: avg 1-cost 1★ = 1.0) ─
export const AVG_DPS = {
    1: [0,  1.0,  1.52,  2.28],
    2: [0,  1.24, 1.93,  3.28],
    3: [0,  1.59, 2.38,  4.0],
    4: [0,  2.14, 3.21, 10.31],
    5: [0,  1.86, 2.79, 10.14],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTank(name) {
    return pool[name]?.role === 'Tank';
}

function getBaseEHP(name, stars) {
    const cost = pool[name]?.cost;
    return AVG_EHP[cost]?.[stars] ?? 0;
}

function getBaseDPS(name, stars) {
    const cost = pool[name]?.cost;
    return AVG_DPS[cost]?.[stars] ?? 0;
}

/**
 * Returns a map of trait → breakpoint multiplier for the active breakpoints
 * reached by the given unit list.
 */
function computeTraitMultipliers(unitList) {
    const counts = {};
    for (const { name } of unitList) {
        for (const trait of (pool[name]?.synergies ?? [])) {
            counts[trait] = (counts[trait] ?? 0) + 1;
        }
    }

    const mults = {};
    for (const [trait, count] of Object.entries(counts)) {
        const bps = traits[trait]?.breakpoints ?? [];
        let bpLevel = 0;
        for (const bp of bps) {
            if (count >= bp) bpLevel++;
        }
        if (bpLevel > 0) mults[trait] = 1 + 0.25 * bpLevel;
    }
    return mults;
}

/** Product of all active-trait multipliers for a single unit. */
function unitTraitMult(name, traitMults) {
    let mult = 1;
    for (const trait of (pool[name]?.synergies ?? [])) {
        if (traitMults[trait]) mult *= traitMults[trait];
    }
    return mult;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate board strength for an array of units.
 *
 * @param {Array<{name: string, stars: number}>} units
 * @returns {number} Board strength score (higher = stronger)
 */
export function calcBoardStrength(units) {
    if (!units.length) return 0;

    const traitMults = computeTraitMultipliers(units);

    const ehpEntries = [];
    const dpsEntries = [];

    for (const { name, stars } of units) {
        const tMult = unitTraitMult(name, traitMults);
        if (isTank(name)) {
            ehpEntries.push({ name, val: getBaseEHP(name, stars) * tMult });
        } else {
            dpsEntries.push({ name, val: getBaseDPS(name, stars) * tMult });
        }
    }

    // Item multiplier: strongest tank and strongest carry each get 5×
    if (ehpEntries.length) {
        ehpEntries.sort((a, b) => b.val - a.val);
        ehpEntries[0].val *= 5;
    }
    if (dpsEntries.length) {
        dpsEntries.sort((a, b) => b.val - a.val);
        dpsEntries[0].val *= 5;
    }

    const totalEHP = ehpEntries.reduce((s, e) => s + e.val, 0);
    const totalDPS = dpsEntries.reduce((s, e) => s + e.val, 0);

    // Edge cases: if there are no tanks or no carries, one side is 0 and
    // the product collapses. Return whichever sum is non-zero as a fallback
    // so boards with only tanks or only carries still rank against each other.
    if (totalEHP === 0) return totalDPS;
    if (totalDPS === 0) return totalEHP;
    return totalEHP * totalDPS;
}

/**
 * Greedily select the strongest board of `level` units from the available pool.
 * At each step the unit whose addition most increases board strength is chosen.
 *
 * @param {Array<{name: string, stars: number}>} units  Available units to pick from
 * @param {number} level  Number of units on the board (= player level)
 * @returns {Array<{name: string, stars: number}>} Best board found
 */
export function getBestBoard(units, level) {
    const remaining = [...units];
    const board = [];

    while (board.length < level && remaining.length) {
        let bestIdx = -1;
        let bestStrength = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
            board.push(remaining[i]);
            const strength = calcBoardStrength(board);
            if (strength > bestStrength) {
                bestStrength = strength;
                bestIdx = i;
            }
            board.pop();
        }

        if (bestIdx === -1) break;
        board.push(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
    }

    return board;
}
