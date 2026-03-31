import { pool } from '../data/pool.js';
import { TANK_CLASS } from './constants.js';
import { buildTraitCounts, localActiveBreakpoint } from './helpers.js';

// ============================================================
// Shared heuristic: N-cost reroll detection.
//   1. Comp contains ≥ 3 units of the given cost tier.
//   2. Among those, ≥ 2 have full trait saturation — every
//      one of their synergies hits an active breakpoint.
// ============================================================
function isNcostReroll(targetNames, cost) {
    const nCosts = targetNames.filter(n => pool[n]?.cost === cost);
    if (nCosts.length < 3) return false;

    const traitCounts = buildTraitCounts(targetNames);

    let fullySaturated = 0;
    for (const name of nCosts) {
        const synergies = pool[name]?.synergies ?? [];
        if (synergies.length === 0) continue;
        if (synergies.every(t => localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0)) fullySaturated++;
    }

    return fullySaturated >= 2;
}

export function is1CostReroll(targetNames) { return isNcostReroll(targetNames, 1); }

// ============================================================
// Detect whether a planner comp is a 2-cost reroll comp.
// ============================================================
export function is2CostReroll(targetNames) { return isNcostReroll(targetNames, 2); }

export function is3CostReroll(targetNames) { return isNcostReroll(targetNames, 3); }

// ============================================================
// Detect Fast 9: comp has ≥ 2 five-cost units, indicating
// that Lv.8 shop odds are needed to find the key carries.
// ============================================================
export function isFast9(targetNames) {
    return targetNames.filter(n => pool[n]?.cost === 5).length >= 2;
}

// ============================================================
// Shared carry / tank selection for reroll archetypes.
// Candidates are restricted to units of the given cost tier.
// Sorted by active trait count (descending, ties random).
// ============================================================
function getNcostCarryAndTank(targetNames, cost) {
    const traitCounts = buildTraitCounts(targetNames);
    const nCosts      = targetNames.filter(n => pool[n]?.cost === cost).map(n => pool[n]).filter(Boolean);

    function activeCount(champ) {
        return champ.synergies.filter(
            t => localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0
        ).length;
    }

    const carries = nCosts.filter(c => !TANK_CLASS.has(c.role));
    const tanks   = nCosts.filter(c =>  TANK_CLASS.has(c.role));

    const rng = () => Math.random() - 0.5;
    carries.sort((a, b) => activeCount(b) - activeCount(a) || rng());
    tanks.sort((a, b)   => activeCount(b) - activeCount(a) || rng());

    return {
        mainCarry: carries[0] ?? null,
        mainTank:  tanks[0]   ?? null,
        traitCounts,
    };
}

export function get1CostCarryAndTank(targetNames) { return getNcostCarryAndTank(targetNames, 1); }

// ============================================================
// Identify carry / tank from the 2-cost units in a reroll comp.
//
// Main carry:  2-cost non-tank with the most active traits
// Duo carry:   2-cost non-tank with the second-most active traits
// Main tank:   2-cost Tank-role with the most active traits
// Duo tank:    set only when tied with main tank
// ============================================================
export function get2CostCarryAndTank(targetNames) {
    const traitCounts = buildTraitCounts(targetNames);
    const twoCosts    = targetNames.filter(n => pool[n]?.cost === 2).map(n => pool[n]);

    function activeCount(champ) {
        return champ.synergies.filter(
            t => localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0
        ).length;
    }

    const carries = twoCosts.filter(c => !TANK_CLASS.has(c.role));
    const tanks   = twoCosts.filter(c =>  TANK_CLASS.has(c.role));

    // Sort descending by active trait count; ties broken randomly
    const rng = () => Math.random() - 0.5;
    carries.sort((a, b) => activeCount(b) - activeCount(a) || rng());
    tanks.sort((a, b)   => activeCount(b) - activeCount(a) || rng());

    return {
        mainCarry: carries[0] ?? null,
        duoCarry:  carries[1] ?? null,
        mainTank:  tanks[0]   ?? null,
        duoTank:   (tanks.length > 1 && activeCount(tanks[0]) === activeCount(tanks[1]))
                       ? tanks[1] : null,
        traitCounts,
    };
}

export function get3CostCarryAndTank(targetNames) { return getNcostCarryAndTank(targetNames, 3); }

// ============================================================
// Archetype metadata — used by UI labels and the generator router.
// ============================================================

// Canonical archetype identifiers.
export const ARCHETYPES = ['lv5', 'lv6', 'lv7', 'fast8', 'fast9'];

// Display label for each archetype.
export const ARCHETYPE_LABEL = {
    lv5:   'Lv. 5',
    lv6:   'Lv. 6',
    lv7:   'Lv. 7',
    fast8: 'Fast 8',
    fast9: 'Fast 9',
};

// Icon path for each archetype.
export const ARCHETYPE_ICON = {
    lv5:   'img/reroll.png',
    lv6:   'img/reroll.png',
    lv7:   'img/reroll.png',
    fast8: 'img/xp.png',
    fast9: 'img/xp.png',
};

// ============================================================
// Unified archetype detector.
// Returns one of the ARCHETYPES strings, or null for empty comps.
// Precedence: 1-cost → 2-cost → 3-cost → Fast9 → Fast8 (default).
// ============================================================
export function detectArchetype(targetNames) {
    if (!targetNames?.length) return null;
    if (is1CostReroll(targetNames)) return 'lv5';
    if (is2CostReroll(targetNames)) return 'lv6';
    if (is3CostReroll(targetNames)) return 'lv7';
    if (isFast9(targetNames))       return 'fast9';
    return 'fast8';
}
