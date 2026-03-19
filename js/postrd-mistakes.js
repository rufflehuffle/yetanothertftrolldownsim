// ============================================================
// postrd-mistakes.js — Shared mistake builders for post-RD tabs
// ============================================================

import { calcApm, calcRolldownSpeed } from './grading/speed.js';
import { avgGoldPerStrengthPoint } from './grading/discipline.js';
import { plannerCarryName, plannerTankName } from './grading/helper.js';
import { findMissedUnits } from './grading/accuracy.js';
import {
    mainCarryInCorner,
    strongestMeleeCarryNextToStrongestTank,
    mainTankInFrontOfCornerCarry,
    meleeInBackRow,
    rangedNotInBackRow,
    meleeCarriesNotNextToTank,
} from './grading/positioning.js';
import { findMissedAlternateTanks } from './grading/flexibility.js';

const TARGET_APM              = 80;
const TARGET_ROLLS_PER_SECOND = 1 / 1.5;

// Each builder returns { text, snapshotLabel } objects.
// snapshotLabel is null for non-navigable items, or a snapshot label like "Roll 3" / "End".

export function speedMistakes(events) {
    const { apm, rolls }     = calcApm(events);
    const { rollsPerSecond } = calcRolldownSpeed(events);
    const items = [];

    if (apm < TARGET_APM)
        items.push({ text: `[Speed] Only ${apm} APM — target is ${TARGET_APM}`, snapshotLabel: null, highlightType: 'speed' });
    if (rollsPerSecond < TARGET_ROLLS_PER_SECOND)
        items.push({ text: `[Speed] Rolling at ${rollsPerSecond} rolls/s — target is ${TARGET_ROLLS_PER_SECOND.toFixed(2)} rolls/s`, snapshotLabel: null, highlightType: 'speed' });

    let rollBonus = 0;
    if      (rolls >= 20) rollBonus = 20;
    else if (rolls >= 15) rollBonus = 10;
    else if (rolls >= 10) rollBonus =  5;
    if (rollBonus > 0)
        items.push({ text: `[Speed] Roll count bonus: +${rollBonus} (${rolls} rolls)`, snapshotLabel: null, highlightType: 'speed', isBonus: true });

    return items;
}

function _has2Star(unitName, board, bench) {
    for (const unit of Object.values(board))
        if (unit?.name === unitName && unit.stars === 2) return true;
    for (const unit of bench)
        if (unit?.name === unitName && unit.stars === 2) return true;
    return false;
}

export function disciplineMistakes(events) {
    const seen = new Set();
    return events
        .filter(e => e.type === 'roll')
        .map((roll, i) => {
            const { board, bench, level, teamPlan } = roll;
            const gpsp = avgGoldPerStrengthPoint(board, bench, level, teamPlan);
            if (!isFinite(gpsp) || gpsp <= 1) return null;

            const carryName = plannerCarryName(teamPlan, board);
            const tankName  = plannerTankName(teamPlan, board);
            const has2StarCarry = carryName ? _has2Star(carryName, board, bench) : false;
            const has2StarTank  = tankName  ? _has2Star(tankName,  board, bench) : false;
            if (!has2StarCarry && !has2StarTank) return null;

            const parts = [];
            if (has2StarCarry && carryName) parts.push(`2★ ${carryName}`);
            if (has2StarTank  && tankName)  parts.push(`2★ ${tankName}`);
            const desc = parts.length
                ? `Kept rolling with ${parts.join(' and ')} on board`
                : 'Kept rolling after reaching strength target';
            const text = `[Discipline] ${desc}`;
            if (seen.has(text)) return null;
            seen.add(text);
            const unitNames = [];
            if (has2StarCarry && carryName) unitNames.push(carryName);
            if (has2StarTank  && tankName)  unitNames.push(tankName);
            return { text, snapshotLabel: `Roll ${i + 1}`, highlightType: 'discipline', unitNames };
        })
        .filter(Boolean);
}

export function accuracyMistakes(events) {
    return findMissedUnits(events).map(m => ({
        text: `[Accuracy] Skipped ${m.champName} (${m.cost}g) in shop`,
        snapshotLabel: `Roll ${m.rollNumber}`,
        highlightType: 'accuracy',
        champName: m.champName,
    }));
}

export function positioningMistakes(board) {
    const texts = [];

    if (!mainCarryInCorner(board))
        texts.push('[Positioning] Main carry not in corner');
    if (!strongestMeleeCarryNextToStrongestTank(board))
        texts.push('[Positioning] Strongest melee carry not next to tank');
    if (!mainTankInFrontOfCornerCarry(board))
        texts.push('[Positioning] Main tank not in front of carry');

    for (const u of meleeInBackRow(board))
        texts.push(`[Positioning] ${u.name} (melee) placed in back row`);
    for (const u of rangedNotInBackRow(board))
        texts.push(`[Positioning] ${u.name} (ranged) not in back row`);
    for (const u of meleeCarriesNotNextToTank(board))
        texts.push(`[Positioning] ${u.name} not next to any tank`);

    return texts.map(text => ({ text, snapshotLabel: 'End', highlightType: 'positioning' }));
}

export function flexibilityMistakes(events) {
    return findMissedAlternateTanks(events).map(m => ({
        text: `[Flexibility] Skipped ${m.name}, a ${m.qualifyingTrait} tank upgrade in shop`,
        snapshotLabel: `Roll ${m.rollNumber}`,
        highlightType: 'flexibility',
        champName: m.name,
    }));
}

/**
 * Returns all mistakes across all categories as a flat array.
 * @param {object[]} events - Array from round.getEvents()
 * @param {object}   board  - Final board state
 */
export function buildAllMistakes(events, board) {
    return [
        ...speedMistakes(events),
        ...disciplineMistakes(events),
        ...accuracyMistakes(events),
        ...positioningMistakes(board),
        ...flexibilityMistakes(events),
    ];
}
