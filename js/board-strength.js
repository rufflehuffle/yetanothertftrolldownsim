import { pool, traits } from './tables.js';

// ─── Load trait strength data ─────────────────────────────────────────────────
let TRAIT_STRENGTH = {};
try {
    TRAIT_STRENGTH = await fetch(
        new URL('../models/traits/trait_strength.json', import.meta.url)
    ).then(r => r.json());
} catch (e) {
    console.warn('board-strength: failed to load trait_strength.json', e);
}

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
 * Returns all active trait effects for the given unit list.
 * Each effect: { metric, value, scope, trait }
 * - metric: 'tank_ehp_pct' | 'dps_pct'
 * - value:  fractional multiplier (applied as 1 + value)
 * - scope:  'splash' | 'selfish' | 'strongest_tank' | 'strongest_carry' | 'second_strongest_carry'
 * - trait:  trait name (used for selfish scoping)
 */
function getActiveEffects(unitList) {
    const counts = {};
    for (const { name } of unitList) {
        for (const trait of (pool[name]?.synergies ?? [])) {
            counts[trait] = (counts[trait] ?? 0) + 1;
        }
    }

    const effects = [];
    for (const [trait, count] of Object.entries(counts)) {
        const bps = traits[trait]?.breakpoints ?? [];
        let bpLevel = 0, activeBp = null;
        for (const bp of bps) {
            if (count >= bp) { bpLevel++; activeBp = bp; }
        }
        if (bpLevel === 0) continue;

        const td = TRAIT_STRENGTH[trait];
        if (!td) continue;

        // "unique" key → single-breakpoint traits; numbered keys → use highest active breakpoint
        const traitEffects = 'unique' in td ? td.unique : (td[String(activeBp)] ?? []);
        for (const eff of traitEffects) {
            if (eff.metric && eff.value != null) {
                effects.push({ metric: eff.metric, value: eff.value, scope: eff.scope, trait });
            }
        }
    }
    return effects;
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

    const activeEffects = getActiveEffects(units);

    // Build per-unit state with multiplicative EHP/DPS multipliers
    const unitData = units.map(({ name, stars }) => ({
        name,
        synergies: pool[name]?.synergies ?? [],
        isT: isTank(name),
        baseEHP: getBaseEHP(name, stars),
        baseDPS: getBaseDPS(name, stars),
        ehpMult: 1,
        dpsMult: 1,
    }));

    // Apply splash (all units) and selfish (trait members only) effects
    for (const eff of activeEffects) {
        if (eff.scope === 'splash') {
            for (const u of unitData) {
                if (eff.metric === 'tank_ehp_pct') u.ehpMult *= (1 + eff.value);
                else if (eff.metric === 'dps_pct')  u.dpsMult *= (1 + eff.value);
            }
        } else if (eff.scope === 'selfish') {
            for (const u of unitData) {
                if (!u.synergies.includes(eff.trait)) continue;
                if (eff.metric === 'tank_ehp_pct') u.ehpMult *= (1 + eff.value);
                else if (eff.metric === 'dps_pct')  u.dpsMult *= (1 + eff.value);
            }
        }
    }

    // Split into EHP (tanks) and DPS (carries) lists with effective values
    const ehpEntries = [];
    const dpsEntries = [];
    for (const u of unitData) {
        if (u.isT) ehpEntries.push({ val: u.baseEHP * u.ehpMult });
        else        dpsEntries.push({ val: u.baseDPS * u.dpsMult });
    }

    ehpEntries.sort((a, b) => b.val - a.val);
    dpsEntries.sort((a, b) => b.val - a.val);

    // Apply targeted effects after initial sort
    for (const eff of activeEffects) {
        if (eff.scope === 'strongest_tank' && ehpEntries.length > 0) {
            if (eff.metric === 'tank_ehp_pct') ehpEntries[0].val *= (1 + eff.value);
        } else if (eff.scope === 'strongest_carry' && dpsEntries.length > 0) {
            if (eff.metric === 'dps_pct') dpsEntries[0].val *= (1 + eff.value);
        } else if (eff.scope === 'second_strongest_carry' && dpsEntries.length > 1) {
            if (eff.metric === 'dps_pct') dpsEntries[1].val *= (1 + eff.value);
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

    // Edge cases: pure-tank or pure-carry boards still rank against each other
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
