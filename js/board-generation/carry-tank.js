import { pool } from '../data/pool.js';
import { TANK_CLASS } from './constants.js';
import { buildTraitCounts, localActiveBreakpoint } from './helpers.js';

// Infer main carry and main tank from the planned comp.
// Carry scoring gets a +3 bonus per trait already at a breakpoint.
export function getMainCarryAndTank(targetNames) {
    const targetChamps = targetNames.map(n => pool[n]).filter(Boolean);
    const traitCounts  = buildTraitCounts(targetNames);

    function carryScore(champ) {
        let score = champ.synergies.reduce((s, t) => s + (traitCounts[t] ?? 0), 0);
        for (const t of champ.synergies) {
            if (localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0) score += 3;
        }
        return score;
    }

    function tankScore(champ) {
        return champ.synergies.reduce((s, t) => s + (traitCounts[t] ?? 0), 0);
    }

    function pickBest(candidates, scoreFn) {
        if (!candidates.length) return null;
        const max  = Math.max(...candidates.map(scoreFn));
        const tied = candidates.filter(c => scoreFn(c) === max);
        return tied[Math.floor(Math.random() * tied.length)];
    }

    const fourCostCarries = targetChamps.filter(c => c.cost === 4 && !TANK_CLASS.has(c.role));
    const fourCostTanks   = targetChamps.filter(c => c.cost === 4 &&  TANK_CLASS.has(c.role));
    const allCarries      = targetChamps.filter(c => !TANK_CLASS.has(c.role));
    const allTanks        = targetChamps.filter(c =>  TANK_CLASS.has(c.role));

    return {
        mainCarry:   pickBest(fourCostCarries.length ? fourCostCarries : allCarries, carryScore),
        mainTank:    pickBest(fourCostTanks.length   ? fourCostTanks   : allTanks,   tankScore),
        traitCounts,
    };
}
