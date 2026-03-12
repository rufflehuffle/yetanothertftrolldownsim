import { pool } from './tables.js';

// ============================================================
// State
// ============================================================

export let state = {
    gold: 9999,
    level: 8,
    xp: 0,
    shop: [],
    bench: Array(9).fill(null),   // each slot: null | { name, stars }
    board: {                       // each slot: null | { name, stars }
        A1: null, A2: null, A3: null, A4: null, A5: null, A6: null, A7: null,
        B1: null, B2: null, B3: null, B4: null, B5: null, B6: null, B7: null,
        C1: null, C2: null, C3: null, C4: null, C5: null, C6: null, C7: null,
        D1: null, D2: null, D3: null, D4: null, D5: null, D6: null, D7: null,
    },
    teamPlan: new Set(),
    teamPlanSlots: Array(10).fill(null), // positional slots for the planner grid
    targetTeam: null,
    rolldownHistory: [],  // numeric scores for past rolldowns
};

export function setPlannedAsGenerateTarget() {
    state.targetTeam = new Set(state.teamPlan);
}

/** Rebuild teamPlanSlots from an ordered names array (compact, left-to-right). */
export function syncTeamPlanSlots(names) {
    state.teamPlanSlots.fill(null);
    for (let i = 0; i < names.length && i < 10; i++) {
        state.teamPlanSlots[i] = names[i] ?? null;
    }
}

export function saveTeamPlan() {
    try {
        localStorage.setItem('tft-team-plan', JSON.stringify([...state.teamPlan]));
    } catch {}
    document.dispatchEvent(new CustomEvent('teamplanchange'));
}

export function applyPersistedUnlocks() {
    try {
        const saved = localStorage.getItem('tft-unlocked-overrides');
        if (!saved) return;
        const names = JSON.parse(saved);
        for (const name of names) {
            if (pool[name]) pool[name].unlocked = true;
        }
    } catch {}
}

export function saveUnlockedOverrides() {
    try {
        const overrides = Object.values(pool)
            .filter(c => isOriginallyLocked(c.name) && c.unlocked)
            .map(c => c.name);
        localStorage.setItem('tft-unlocked-overrides', JSON.stringify(overrides));
    } catch {}
}

// We track which names were originally locked so we can reset them
export const _originallyLocked = new Set(
    Object.values(pool).filter(c => !c.unlocked).map(c => c.name)
);
export function isOriginallyLocked(name) { return _originallyLocked.has(name); }
applyPersistedUnlocks();
