import { pool, traits as traitTable } from './tables.js';

// ── Helpers ──────────────────────────────────────────────────
function starsText(s) { return '★'.repeat(s); }

function starColor(s) {
    if (s === 3) return '#f0c040';
    if (s === 2) return '#a0c4ff';
    return '#d1d5db';
}

function costColor(cost) {
    switch (cost) {
        case 1: return '#162431'; case 2: return '#10572C';
        case 3: return '#1D5079'; case 4: return '#8F0A6B';
        case 5: return '#C48217'; default: return '#444';
    }
}

function traitTierColor(tier) {
    switch (tier) {
        case 'Bronze':    return '#876049';
        case 'Silver':    return '#819193';
        case 'Gold':      return '#BCA55B';
        case 'Prismatic': return '#BDF3ED';
        case 'Legendary': return '#E37B23';
    }
}

function activeBreakpoint(traitName, count) {
    const bp = traitTable[traitName]?.breakpoints ?? [];
    let active = 0;
    for (const b of bp) { if (count >= b) active = b; }
    return active;
}

function champIcon(name) {
    if (pool[name]) return pool[name].icon;
    const slug = name.toLowerCase().replace(/['\s.]/g, '');
    return `https://cdn.metatft.com/file/metatft/champions/tft16_${slug}.png`;
}

function champCost(name)      { return pool[name]?.cost ?? 0; }
function champSynergies(name) { return pool[name]?.synergies ?? []; }

// ── HTML builders ─────────────────────────────────────────────
const ROWS = ['A', 'B', 'C', 'D'];

function hexWrapHTML(unit) {
    const bgImg = unit ? `background-image:url(${champIcon(unit.name)})` : '';
    const stars = unit ? starsText(unit.stars) : '';
    const color = unit ? starColor(unit.stars) : '';
    return `<div class="rd-hex-wrap">` +
        `<div class="rd-hex" style="${bgImg}"></div>` +
        `<span class="rd-star-indicator" style="color:${color}">${stars}</span>` +
        `</div>`;
}

function benchWrapHTML(unit) {
    const bgImg = unit ? `background-image:url(${champIcon(unit.name)})` : '';
    const stars = unit ? starsText(unit.stars) : '';
    const color = unit ? starColor(unit.stars) : '';
    return `<div class="rd-bench-wrap">` +
        `<div class="rd-bench-slot" style="${bgImg}"></div>` +
        `<span class="rd-star-indicator" style="color:${color}">${stars}</span>` +
        `</div>`;
}

function shopSlotHTML(name, bought = false) {
    if (!name) return `<div class="rd-shop-slot rd-shop-slot--empty"></div>`;
    const cost  = champCost(name);
    const color = costColor(cost);
    const icon  = champIcon(name);
    const boughtOverlay = bought
        ? `<div class="rd-shop-bought-overlay"><span class="rd-shop-bought-label">🪙<br>BOUGHT</span></div>`
        : '';
    return `<div class="rd-shop-slot" style="border-color:${color}" title="${name}">` +
        `<img class="rd-shop-img${bought ? ' rd-shop-img--bought' : ''}" src="${icon}" alt="${name}" onerror="this.style.opacity='.15'">` +
        boughtOverlay +
        `</div>`;
}

function computeTraits(board) {
    const counts = {};
    for (const unit of Object.values(board || {})) {
        if (!unit) continue;
        for (const syn of champSynergies(unit.name)) {
            counts[syn] = (counts[syn] || 0) + 1;
        }
    }
    return counts;
}

function traitRowHTML(traitName, count) {
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

// ── Renderers ─────────────────────────────────────────────────
function renderBoard(board) {
    document.getElementById('rd-board').innerHTML = ROWS.map((row, ri) => {
        const offsetCls = ri % 2 === 1 ? ' rd-board-row--offset' : '';
        const cells = Array.from({ length: 7 }, (_, ci) =>
            hexWrapHTML(board[`${row}${ci + 1}`])).join('');
        return `<div class="rd-board-row${offsetCls}">${cells}</div>`;
    }).join('');
}

function renderBench(bench) {
    document.getElementById('rd-bench').innerHTML =
        (bench || []).map(u => benchWrapHTML(u)).join('');
}

function renderShop(shop, shopBought) {
    document.getElementById('rd-shop').innerHTML =
        (shop || []).map((name, i) => shopSlotHTML(name, shopBought?.[i] ?? false)).join('');
}

function renderTraits(board) {
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
        : `<div class="rd-trait"><span class="rd-trait__name" style="color:#3d5560">—</span></div>`;
}

function renderSnap(snapshots, idx) {
    const snap = snapshots[idx];
    renderBoard(snap.board);
    renderBench(snap.bench);
    renderShop(snap.shop, snap.shopBought);
    renderTraits(snap.board);
    document.getElementById('rd-level').textContent      = `Lv. ${snap.level || 8}`;
    document.getElementById('rd-gold').textContent       = `${snap.gold}g`;
    document.getElementById('rd-roll-label').textContent = `${snap.label}  (${idx + 1}/${snapshots.length})`;
    document.getElementById('rd-prev').disabled = idx === 0;
    document.getElementById('rd-next').disabled = idx === snapshots.length - 1;
}

// ── Snapshot builder ──────────────────────────────────────────
function buildSnapshots(events) {
    const snapshots = [];
    let rollNum = 0;
    let hasRoundEnd = false;
    let pendingSnap = null;

    function flushPending() {
        if (pendingSnap) { snapshots.push(pendingSnap); pendingSnap = null; }
    }

    for (const e of events) {
        if (e.type === 'round:start') {
            flushPending();
            const shop = e.shop ? [...e.shop] : [];
            pendingSnap = { label: 'Start', shop, shopBought: shop.map(() => false), bench: e.bench, board: e.board, gold: e.gold, level: e.level };
        } else if (e.type === 'roll') {
            flushPending();
            rollNum++;
            const shop = e.shopAfter ? [...e.shopAfter] : [];
            pendingSnap = { label: `Roll ${rollNum}`, shop, shopBought: shop.map(() => false), bench: e.bench, board: e.board, gold: e.goldAfter, level: e.level };
        } else if (e.type === 'buy') {
            if (e.shopIndex != null && pendingSnap) pendingSnap.shopBought[e.shopIndex] = true;
        } else if (e.type === 'round:end') {
            flushPending();
            hasRoundEnd = true;
            const lastSnap = snapshots[snapshots.length - 1];
            snapshots.push({ label: 'End', shop: lastSnap?.shop ?? [], shopBought: lastSnap?.shopBought ?? [], bench: e.bench, board: e.board, gold: e.gold, level: e.level });
        }
    }
    flushPending();

    if (!hasRoundEnd && snapshots.length > 0) {
        const last = snapshots[snapshots.length - 1];
        snapshots.push({ label: 'End', shop: last.shop, shopBought: last.shopBought, bench: last.bench, board: last.board, gold: last.gold, level: last.level });
    }

    return snapshots;
}

// ── Responsive hex sizing ─────────────────────────────────────
let _resizeObserver = null;

function setupResponsive() {
    const HEX_GAP_BASE = 3;
    const rdEl        = document.querySelector('.postrd-rd');
    const boardArea   = document.querySelector('.postrd-rd__board-area');
    const leftPanel   = document.querySelector('.postrd-rd__left');
    const rdScreen    = document.querySelector('.postrd-rd__screen');
    const postrdPanel = document.querySelector('.postrd__panel');

    function updateTraitPos() {
        const benchRect  = document.getElementById('rd-bench').getBoundingClientRect();
        const boardRect  = document.getElementById('rd-board').getBoundingClientRect();
        const screenRect = rdScreen.getBoundingClientRect();
        const newLeft = benchRect.left - screenRect.left - leftPanel.offsetWidth - 8;
        const newTop  = boardRect.top  - screenRect.top;
        leftPanel.style.left = `${Math.max(4, newLeft)}px`;
        leftPanel.style.top  = `${Math.max(0, newTop)}px`;
    }

    function updateHexSize() {
        const W = boardArea.clientWidth;
        const H = boardArea.clientHeight;
        if (!W || !H) return;
        const uiScale   = Math.max(0.45, Math.min(postrdPanel.clientWidth / 1440, 2.5));
        const scaledGap = HEX_GAP_BASE * uiScale;
        rdEl.style.setProperty('--rd-ui-scale', uiScale.toFixed(4));
        const fromH = (H * 0.8 - 8) / 5.0;
        const fromW = (W * 0.9 - 6.5 * scaledGap) / 7.5;
        const hexW  = Math.max(20, Math.min(fromH, fromW));
        rdEl.style.setProperty('--rd-hex-w', `${hexW.toFixed(2)}px`);
        requestAnimationFrame(updateTraitPos);
    }

    if (_resizeObserver) _resizeObserver.disconnect();
    _resizeObserver = new ResizeObserver(updateHexSize);
    _resizeObserver.observe(boardArea);
    requestAnimationFrame(updateTraitPos);
}

// ── Navigation ────────────────────────────────────────────────
let _snapshots = [];
let _current   = 0;

document.getElementById('rd-prev').addEventListener('click', () => {
    if (_current > 0) renderSnap(_snapshots, --_current);
});

document.getElementById('rd-next').addEventListener('click', () => {
    if (_current < _snapshots.length - 1) renderSnap(_snapshots, ++_current);
});

document.addEventListener('keydown', e => {
    if (document.getElementById('postrd-analysis').hidden) return;
    if (e.key === 'ArrowLeft'  && _current > 0)                        renderSnap(_snapshots, --_current);
    if (e.key === 'ArrowRight' && _current < _snapshots.length - 1)    renderSnap(_snapshots, ++_current);
});

// ── Public API ────────────────────────────────────────────────
export function initAnalysis(events) {
    _snapshots = buildSnapshots(events);
    _current   = 0;
    if (!_snapshots.length) return;
    setupResponsive();
    renderSnap(_snapshots, _current);
}
