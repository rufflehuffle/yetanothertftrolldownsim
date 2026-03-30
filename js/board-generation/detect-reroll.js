import { pool } from '../data/pool.js';
import { TANK_CLASS } from './constants.js';
import { buildTraitCounts, localActiveBreakpoint } from './helpers.js';

// ============================================================
// Detect whether a planner comp is a 2-cost reroll comp.
//
// Heuristic — trait saturation:
//   1. The comp contains ≥ 3 two-cost units
//   2. Among those, ≥ 2 have full trait saturation: every one
//      of their synergies hits an active breakpoint in the
//      full comp's trait counts.
// ============================================================
export function is2CostReroll(targetNames) {
    const twoCosts = targetNames.filter(n => pool[n]?.cost === 2);
    if (twoCosts.length < 3) return false;

    const traitCounts = buildTraitCounts(targetNames);

    let fullySaturated = 0;
    for (const name of twoCosts) {
        const synergies = pool[name]?.synergies ?? [];
        if (synergies.length === 0) continue;
        const allActive = synergies.every(
            t => localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0
        );
        if (allActive) fullySaturated++;
    }

    return fullySaturated >= 2;
}

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
