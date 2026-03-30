// ============================================================
// postrd/renderers.js — Stateless DOM writers for snapshot display
// ============================================================

import { traits as traitTable } from '../data/traits.js';
import { BOARD_ROWS, activeBreakpoint } from './helpers.js';
import { hexWrapHTML, benchWrapHTML, shopSlotHTML, computeTraits, traitRowHTML } from './html-builders.js';
import { calcApm, calcRolldownSpeed } from '../grading/speed.js';

// ── Board / bench / shop ─────────────────────────────────────

export function renderBoard(board, highlightHexes = null) {
    document.getElementById('rd-board').innerHTML = BOARD_ROWS.map((row, ri) => {
        const offsetCls = ri % 2 === 1 ? ' rd-board-row--offset' : '';
        const cells = Array.from({ length: 7 }, (_, ci) => {
            const key = `${row}${ci + 1}`;
            const hlType = board[key] ? (highlightHexes?.get(key) ?? null) : null;
            return hexWrapHTML(board[key], hlType);
        }).join('');
        return `<div class="rd-board-row${offsetCls}">${cells}</div>`;
    }).join('');
}

export function renderBench(bench) {
    document.getElementById('rd-bench').innerHTML =
        (bench || []).map(u => benchWrapHTML(u)).join('');
}

export function renderShop(shop, shopBought, highlightSlots = null) {
    document.getElementById('rd-shop').innerHTML =
        (shop || []).map((name, i) => shopSlotHTML(name, shopBought?.[i] ?? false, highlightSlots?.has(i))).join('');
}

export function renderTraits(board) {
    const counts = computeTraits(board);
    const TIER_ORDER = { Prismatic: 5, Gold: 4, Legendary: 3, Silver: 2, Bronze: 1 };
    const sorted = Object.entries(counts).sort((a, b) => {
        const [aN, aC] = a, [bN, bC] = b;
        const aBP = activeBreakpoint(aN, aC), bBP = activeBreakpoint(bN, bC);
        if ((aBP > 0) !== (bBP > 0)) return (bBP > 0) - (aBP > 0);
        if (aBP > 0 && bBP > 0) {
            const aT = TIER_ORDER[traitTable[aN]?.breakpoint_tiers[traitTable[aN].breakpoints.indexOf(aBP)]] ?? 0;
            const bT = TIER_ORDER[traitTable[bN]?.breakpoint_tiers[traitTable[bN].breakpoints.indexOf(bBP)]] ?? 0;
            if (aT !== bT) return bT - aT;
        }
        return bC - aC;
    });
    const active = sorted.filter(([name, count]) => activeBreakpoint(name, count) > 0);
    document.getElementById('rd-traits').innerHTML = active.length
        ? active.map(([name, count]) => traitRowHTML(name, count)).join('')
        : `<div class="rd-trait"><span class="rd-trait__name" style="color:#3d5560">\u2014</span></div>`;
}

// ── Speed / action stats panel ───────────────────────────────

export function renderSpeedStats(events) {
    const container = document.getElementById('rd-speed-stats');
    if (!container) return;
    container.innerHTML = '';

    const { apm, buys, sells, rolls } = calcApm(events);
    const { rollsPerSecond }          = calcRolldownSpeed(events);
    const startEvent = events.find(e => e.type === 'round:start');
    const endEvent   = events.find(e => e.type === 'round:end');
    const goldSpent  = startEvent && endEvent ? Math.max(0, startEvent.gold - endEvent.gold) : 0;

    const stats = [
        { label: 'APM',    value: apm },
        { label: 'Rolls/s', value: rollsPerSecond },
        { label: 'Rolls',  value: rolls },
        { label: 'Gold',   value: `${goldSpent}g` },
        { label: 'Bought', value: buys },
        { label: 'Sold',   value: sells },
    ];

    for (const { label, value } of stats) {
        const row = document.createElement('div');
        row.className = 'rd-speed-stat-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'rd-speed-stat-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.className = 'rd-speed-stat-value';
        valueEl.textContent = value;
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        container.appendChild(row);
    }
}
