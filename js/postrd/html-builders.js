// ============================================================
// postrd/html-builders.js — HTML string builders for snapshot display
// ============================================================

import { traits as traitTable } from '../data/traits.js';
import {
    starsText, starColor, costColor, traitTierColor,
    activeBreakpoint, champIcon, champCost, champSynergies,
} from './helpers.js';

// ── Board hex ────────────────────────────────────────────────

export function hexWrapHTML(unit, highlightType = null) {
    const bgImg = unit ? `background-image:url(${champIcon(unit.name)})` : '';
    const stars = unit ? starsText(unit.stars) : '';
    const color = unit ? starColor(unit.stars) : '';
    let overlay = '';
    if (highlightType && unit) {
        if (highlightType === 'discipline') {
            overlay =
                `<div class="rd-hex-discipline-overlay"></div>` +
                `<div class="rd-discipline-badge-wrap rd-discipline-badge-wrap--hex">` +
                `<div class="rd-discipline-badge">!</div></div>`;
        } else {
            overlay =
                `<div class="rd-hex-mistake-overlay"></div>` +
                `<div class="rd-mistake-badge rd-mistake-badge--hex">\u00d7</div>`;
        }
    }
    return `<div class="rd-hex-wrap">` +
        `<div class="rd-hex" style="${bgImg}"></div>` +
        overlay +
        `<span class="rd-star-indicator" style="color:${color}">${stars}</span>` +
        `</div>`;
}

// ── Bench slot ───────────────────────────────────────────────

export function benchWrapHTML(unit) {
    const bgImg = unit ? `background-image:url(${champIcon(unit.name)})` : '';
    const stars = unit ? starsText(unit.stars) : '';
    const color = unit ? starColor(unit.stars) : '';
    return `<div class="rd-bench-wrap">` +
        `<div class="rd-bench-slot" style="${bgImg}"></div>` +
        `<span class="rd-star-indicator" style="color:${color}">${stars}</span>` +
        `</div>`;
}

// ── Shop slot ────────────────────────────────────────────────

export function shopSlotHTML(name, bought = false, highlighted = false) {
    if (!name) return `<div class="rd-shop-slot rd-shop-slot--empty"></div>`;
    const cost  = champCost(name);
    const color = costColor(cost);
    const icon  = champIcon(name);
    const boughtOverlay = bought
        ? `<div class="rd-shop-bought-overlay"><span class="rd-shop-bought-label">\ud83e\ude99<br>BOUGHT</span></div>`
        : '';
    const mistakeOverlay = highlighted
        ? `<div class="rd-shop-mistake-overlay"></div>` +
          `<div class="rd-mistake-badge rd-mistake-badge--shop">\u00d7</div>`
        : '';
    return `<div class="rd-shop-slot" style="border-color:${color}" title="${name}">` +
        `<img class="rd-shop-img${bought ? ' rd-shop-img--bought' : ''}" src="${icon}" alt="${name}" onerror="this.style.opacity='.15'">` +
        boughtOverlay +
        mistakeOverlay +
        `</div>`;
}

// ── Trait sidebar ────────────────────────────────────────────

/** Count synergies across all board units. */
export function computeTraits(board) {
    const counts = {};
    for (const unit of Object.values(board || {})) {
        if (!unit) continue;
        for (const syn of champSynergies(unit.name)) {
            counts[syn] = (counts[syn] || 0) + 1;
        }
    }
    return counts;
}

export function traitRowHTML(traitName, count) {
    const traitData = traitTable[traitName];
    if (!traitData) return '';
    const activeBP = activeBreakpoint(traitName, count);
    const isActive = activeBP > 0;
    let tierColor = '';
    if (isActive) {
        const bpIdx = traitData.breakpoints.indexOf(activeBP);
        tierColor = traitTierColor(traitData.breakpoint_tiers[bpIdx]) || '';
    }
    const activeClass = isActive ? ' rd-trait--active' : '';
    const styleAttr   = isActive && tierColor ? ` style="--trait-color:${tierColor}"` : '';
    return `<div class="rd-trait${activeClass}"${styleAttr} title="${traitName}">` +
        `<div class="rd-trait-icon"><img src="${traitData.icon}" alt="${traitName}"></div>` +
        `<span class="rd-trait__count">${count}</span>` +
        `</div>`;
}
