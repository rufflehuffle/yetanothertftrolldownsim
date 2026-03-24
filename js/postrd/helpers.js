// ============================================================
// postrd/helpers.js — Pure utilities shared across post-RD modules
// ============================================================

import { pool, traits as traitTable } from '../tables.js';

// ── Grade scale ──────────────────────────────────────────────
export function scoreToGrade(score) {
    if (score >= 94) return 'S+';
    if (score >= 87) return 'S';
    if (score >= 80) return 'S-';
    if (score >= 73) return 'A+';
    if (score >= 66) return 'A';
    if (score >= 60) return 'A-';
    if (score >= 53) return 'B+';
    if (score >= 46) return 'B';
    if (score >= 40) return 'B-';
    if (score >= 33) return 'C+';
    if (score >= 26) return 'C';
    if (score >= 20) return 'C-';
    if (score >= 13) return 'D+';
    if (score >= 6)  return 'D';
    return 'D-';
}

// ── Constants ────────────────────────────────────────────────
export const METRIC_NAMES = ['Speed', 'Discipline', 'Accuracy', 'Positioning', 'Flexibility'];
export const BOARD_ROWS   = ['A', 'B', 'C', 'D'];

// ── Star / cost display ──────────────────────────────────────
export function starsText(s) { return '\u2605'.repeat(s); }

export function starColor(s) {
    if (s === 3) return '#f0c040';
    if (s === 2) return '#a0c4ff';
    return '#d1d5db';
}

export function costColor(cost) {
    switch (cost) {
        case 1: return '#162431'; case 2: return '#10572C';
        case 3: return '#1D5079'; case 4: return '#8F0A6B';
        case 5: return '#C48217'; default: return '#444';
    }
}

// ── Trait helpers ─────────────────────────────────────────────
export function traitTierColor(tier) {
    switch (tier) {
        case 'Bronze':    return '#876049';
        case 'Silver':    return '#819193';
        case 'Gold':      return '#BCA55B';
        case 'Prismatic': return '#BDF3ED';
        case 'Legendary': return '#E37B23';
    }
}

/** Highest breakpoint reached for a trait at the given count. */
export function activeBreakpoint(traitName, count) {
    const bp = traitTable[traitName]?.breakpoints ?? [];
    let active = 0;
    for (const b of bp) { if (count >= b) active = b; }
    return active;
}

// ── Champion lookups ─────────────────────────────────────────
export function champIcon(name) {
    if (pool[name]) return pool[name].icon;
    const slug = name.toLowerCase().replace(/['\s.]/g, '');
    return `https://cdn.metatft.com/file/metatft/champions/tft16_${slug}.png`;
}

export function champCost(name)      { return pool[name]?.cost ?? 0; }
export function champSynergies(name) { return pool[name]?.synergies ?? []; }
