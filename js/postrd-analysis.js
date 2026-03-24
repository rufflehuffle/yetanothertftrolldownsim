import { pool, traits as traitTable } from './tables.js';
import { calcApm, calcRolldownSpeed } from './grading/speed.js';
const TARGET_ROLLS_PER_SECOND = 1 / 1.5;
import { positioningMistakeHexes } from './grading/positioning.js';
import {
    speedMistakes,
    disciplineMistakes,
    accuracyMistakes,
    positioningMistakes,
    flexibilityMistakes,
} from './postrd-mistakes.js';

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

function scoreToGrade(score) {
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

const METRIC_NAMES = ['Speed', 'Discipline', 'Accuracy', 'Positioning', 'Flexibility'];

// ── HTML builders ─────────────────────────────────────────────
const ROWS = ['A', 'B', 'C', 'D'];

function hexWrapHTML(unit, highlightType = null) {
    const bgImg = unit ? `background-image:url(${champIcon(unit.name)})` : '';
    const stars = unit ? starsText(unit.stars) : '';
    const color = unit ? starColor(unit.stars) : '';
    let overlay = '';
    if (highlightType && unit) {
        if (highlightType === 'discipline') {
            overlay = `<div class="rd-hex-discipline-overlay"></div><div class="rd-discipline-badge-wrap rd-discipline-badge-wrap--hex"><div class="rd-discipline-badge">!</div></div>`;
        } else {
            overlay = `<div class="rd-hex-mistake-overlay"></div><div class="rd-mistake-badge rd-mistake-badge--hex">×</div>`;
        }
    }
    return `<div class="rd-hex-wrap">` +
        `<div class="rd-hex" style="${bgImg}"></div>` +
        overlay +
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

function shopSlotHTML(name, bought = false, highlighted = false) {
    if (!name) return `<div class="rd-shop-slot rd-shop-slot--empty"></div>`;
    const cost  = champCost(name);
    const color = costColor(cost);
    const icon  = champIcon(name);
    const boughtOverlay = bought
        ? `<div class="rd-shop-bought-overlay"><span class="rd-shop-bought-label">🪙<br>BOUGHT</span></div>`
        : '';
    const mistakeOverlay = highlighted
        ? `<div class="rd-shop-mistake-overlay"></div><div class="rd-mistake-badge rd-mistake-badge--shop">×</div>`
        : '';
    return `<div class="rd-shop-slot" style="border-color:${color}" title="${name}">` +
        `<img class="rd-shop-img${bought ? ' rd-shop-img--bought' : ''}" src="${icon}" alt="${name}" onerror="this.style.opacity='.15'">` +
        boughtOverlay +
        mistakeOverlay +
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
function renderBoard(board, highlightHexes = null) {
    document.getElementById('rd-board').innerHTML = ROWS.map((row, ri) => {
        const offsetCls = ri % 2 === 1 ? ' rd-board-row--offset' : '';
        const cells = Array.from({ length: 7 }, (_, ci) => {
            const key = `${row}${ci + 1}`;
            const hlType = board[key] ? (highlightHexes?.get(key) ?? null) : null;
            return hexWrapHTML(board[key], hlType);
        }).join('');
        return `<div class="rd-board-row${offsetCls}">${cells}</div>`;
    }).join('');
}

function renderBench(bench) {
    document.getElementById('rd-bench').innerHTML =
        (bench || []).map(u => benchWrapHTML(u)).join('');
}

function renderShop(shop, shopBought, highlightSlots = null) {
    document.getElementById('rd-shop').innerHTML =
        (shop || []).map((name, i) => shopSlotHTML(name, shopBought?.[i] ?? false, highlightSlots?.has(i))).join('');
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
    renderBoard(snap.board, _highlightHexes);
    renderBench(snap.bench);
    renderShop(snap.shop, snap.shopBought, _highlightShopSlots);
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
let _snapshots          = [];
let _current            = 0;
let _allMistakes        = [];   // navigable mistakes for Prev/Next buttons
let _reviewMistakeIdx   = -1;   // -1 = none active
let _mistakeLiMap       = new Map(); // mistake object → <li> in log
let _highlightHexes     = null; // Set<string> | null
let _highlightShopSlots = null; // Set<number> | null

document.getElementById('rd-prev').addEventListener('click', () => {
    if (_current > 0) { _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, --_current); }
});

document.getElementById('rd-next').addEventListener('click', () => {
    if (_current < _snapshots.length - 1) { _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, ++_current); }
});

document.addEventListener('keydown', e => {
    if (document.getElementById('postrd-analysis').hidden) return;
    if (e.key === 'ArrowLeft'  && _current > 0)                     { _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, --_current); }
    if (e.key === 'ArrowRight' && _current < _snapshots.length - 1) { _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, ++_current); }
});

// Navigate to a snapshot with highlights (review-only path)
function _reviewNavigate(label, hexes, shopSlots = null) {
    const idx = _snapshots.findIndex(s => s.label === label);
    if (idx === -1) return;
    document.querySelector('[data-tab="analysis"]').click();
    _current            = idx;
    _highlightHexes     = hexes;
    _highlightShopSlots = shopSlots;
    renderSnap(_snapshots, _current);
}

// Compute highlights for a specific mistake object.
// hexes is Map<boardKey, highlightType> | null
function _computeHighlightsForMistake(mistake, snap) {
    const board = snap?.board ?? {};
    const shop  = snap?.shop  ?? [];

    if (mistake.highlightType === 'accuracy') {
        const idx = shop.indexOf(mistake.champName);
        return { hexes: null, shopSlots: idx !== -1 ? new Set([idx]) : null };
    }
    if (mistake.highlightType === 'flexibility') {
        const idx = shop.indexOf(mistake.champName);
        return { hexes: null, shopSlots: idx !== -1 ? new Set([idx]) : null };
    }
    if (mistake.highlightType === 'discipline') {
        const unitNames = new Set(mistake.unitNames ?? []);
        const hexes = new Map();
        for (const [key, unit] of Object.entries(board)) {
            if (unit && unitNames.has(unit.name)) hexes.set(key, 'discipline');
        }
        return { hexes: hexes.size ? hexes : null, shopSlots: null };
    }
    if (mistake.highlightType === 'positioning') {
        const posSet = positioningMistakeHexes(board);
        const hexes  = new Map([...posSet].map(k => [k, 'positioning']));
        return { hexes: hexes.size ? hexes : null, shopSlots: null };
    }
    return { hexes: null, shopSlots: null };
}

// Navigate to a specific mistake by index, highlight it in the log
function _activateMistake(idx) {
    _reviewMistakeIdx = idx;
    for (const li of _mistakeLiMap.values()) li.classList.remove('rd-review__mistake-item--active');
    const mistake = _allMistakes[idx];
    const li = _mistakeLiMap.get(mistake);
    if (li) {
        li.classList.add('rd-review__mistake-item--active');
        li.scrollIntoView({ block: 'nearest' });
    }
    const snap = _snapshots.find(s => s.label === mistake.snapshotLabel);
    const { hexes, shopSlots } = _computeHighlightsForMistake(mistake, snap);
    if (mistake.snapshotLabel === null) {
        _highlightHexes     = null;
        _highlightShopSlots = null;
        renderSnap(_snapshots, _current);
    } else {
        _reviewNavigate(mistake.snapshotLabel, hexes, shopSlots);
    }
}

// ── Left panel: speed + action stats ─────────────────────────
function renderSpeedStats(events) {
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

// ── Right panel: Rolldown Review ─────────────────────────────
function renderRolldownReview(events, board, scores) {
    const container = document.getElementById('rd-mistakes');
    if (!container) return;
    container.innerHTML = '';
    const { rollsPerSecond } = calcRolldownSpeed(events);

    const perMetric = [
        speedMistakes(events),
        disciplineMistakes(events),
        accuracyMistakes(events),
        positioningMistakes(board),
        flexibilityMistakes(events),
    ];
    const allMistakes = perMetric.flat();

    // All navigable mistakes for Prev/Next buttons, sorted by snapshot order (event log order)
    const _snapOrder  = new Map(_snapshots.map((s, i) => [s.label, i]));
    _allMistakes      = allMistakes
        .filter(m => m.snapshotLabel !== null)
        .sort((a, b) => (_snapOrder.get(a.snapshotLabel) ?? Infinity) - (_snapOrder.get(b.snapshotLabel) ?? Infinity));
    _reviewMistakeIdx = -1;
    _mistakeLiMap     = new Map();

    // ── Shared header (always visible) ───────────────────────
    const header = document.createElement('div');
    header.className = 'rd-review__header';
    const backBtnHeader = document.createElement('button');
    backBtnHeader.className = 'rd-review__back-btn';
    backBtnHeader.textContent = '←';
    backBtnHeader.hidden = true;
    const headerLabel = document.createElement('span');
    headerLabel.className = 'rd-review__header-label';
    headerLabel.textContent = 'ROLLDOWN REVIEW';
    header.appendChild(backBtnHeader);
    header.appendChild(headerLabel);
    container.appendChild(header);

    // ── Screen 1: Overview ────────────────────────────────────
    const overview = document.createElement('div');
    overview.className = 'rd-review__overview';

    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    const overallEl = document.createElement('div');
    overallEl.className = 'rd-review__overall';
    overallEl.innerHTML =
        `<span class="rd-review__overall-grade">${scoreToGrade(avg)}</span>` +
        `<span class="rd-review__overall-score">${Math.round(avg)}</span>` +
        `<span class="rd-review__overall-label">OVERALL</span>`;
    overview.appendChild(overallEl);

    const metricsEl = document.createElement('div');
    metricsEl.className = 'rd-review__metrics';
    for (let i = 0; i < METRIC_NAMES.length; i++) {
        const count = perMetric[i].filter(m => !m.isBonus).length;
        const row = document.createElement('div');
        row.className = 'rd-review__metric-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'rd-review__metric-name';
        nameEl.textContent = METRIC_NAMES[i];
        const gradeEl = document.createElement('span');
        gradeEl.className = 'rd-review__metric-grade';
        gradeEl.textContent = `${scoreToGrade(scores[i] ?? 0)} ${Math.round(scores[i] ?? 0)}`;
        const countEl = document.createElement('span');
        countEl.className = 'rd-review__metric-count' + (count > 0 ? ' rd-review__metric-count--bad' : '');
        countEl.textContent = count;
        row.appendChild(nameEl);
        row.appendChild(gradeEl);
        row.appendChild(countEl);
        metricsEl.appendChild(row);
    }
    overview.appendChild(metricsEl);

    const startBtn = document.createElement('button');
    startBtn.className = 'rd-review__start-btn';
    startBtn.textContent = 'START REVIEW →';
    overview.appendChild(startBtn);

    // ── Screen 2: Log ─────────────────────────────────────────
    const logEl = document.createElement('div');
    logEl.className = 'rd-review__log';
    logEl.hidden = true;

    // Build per-snapshot lookup for the log
    const mistakesByLabel = new Map();
    for (const mistake of allMistakes) {
        const key = mistake.snapshotLabel ?? 'Round';
        if (!mistakesByLabel.has(key)) mistakesByLabel.set(key, []);
        mistakesByLabel.get(key).push(mistake);
    }

    // Event log grouped by snapshot (roll)
    const logList = document.createElement('div');
    logList.className = 'rd-review__log-list';

    function buildGroup(snapLabel, displayLabel, navigable) {
        const group = document.createElement('div');
        group.className = 'rd-review__group';
        const labelEl = document.createElement('div');
        labelEl.className = 'rd-review__group-label';
        labelEl.textContent = displayLabel;
        group.appendChild(labelEl);
        const mistakes = mistakesByLabel.get(snapLabel) ?? [];
        const realMistakes = mistakes.filter(m => !m.isBonus);
        if (realMistakes.length === 0 && !navigable) {
            // non-navigable groups (Round) show no checkmark — content added by caller
        } else if (mistakes.length === 0) {
            const ok = document.createElement('span');
            ok.className = 'rd-review__no-mistakes';
            ok.textContent = '✓';
            group.appendChild(ok);
        } else {
            const ul = document.createElement('ul');
            ul.className = 'rd-review__mistake-list';
            for (const mistake of mistakes) {
                const li = document.createElement('li');
                let cls = 'rd-review__mistake-item';
                if (mistake.isBonus) cls += ' rd-review__mistake-item--bonus';
                else if (navigable)  cls += ' rd-review__mistake-item--link';
                li.className = cls;
                if (navigable && !mistake.isBonus) {
                    _mistakeLiMap.set(mistake, li);
                    const mistakeIdx = _allMistakes.indexOf(mistake);
                    li.addEventListener('click', () => _activateMistake(mistakeIdx));
                }
                li.textContent = mistake.text;
                ul.appendChild(li);
            }
            group.appendChild(ul);
        }
        return group;
    }

    // Always show ROUND section with roll speed target info
    {
        const roundGroup = document.createElement('div');
        roundGroup.className = 'rd-review__group';
        const roundLabelEl = document.createElement('div');
        roundLabelEl.className = 'rd-review__group-label';
        roundLabelEl.textContent = 'ROUND';
        roundGroup.appendChild(roundLabelEl);
        const roundMistakes = mistakesByLabel.get('Round') ?? [];
        if (roundMistakes.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'rd-review__mistake-list';
            for (const mistake of roundMistakes) {
                const li = document.createElement('li');
                li.className = 'rd-review__mistake-item' + (mistake.isBonus ? ' rd-review__mistake-item--bonus' : '');
                li.textContent = mistake.text;
                ul.appendChild(li);
            }
            roundGroup.appendChild(ul);
        }
        logList.appendChild(roundGroup);
    }
    for (const snap of _snapshots) {
        if (snap.label === 'Start') continue;
        if (!(mistakesByLabel.has(snap.label))) continue;
        logList.appendChild(buildGroup(snap.label, snap.label.toUpperCase(), true));
    }
    logEl.appendChild(logList);

    // Log footer with PREV and NEXT buttons
    const logFooter = document.createElement('div');
    logFooter.className = 'rd-review__log-footer';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'rd-review__prev-btn';
    prevBtn.textContent = '← PREV';
    prevBtn.disabled = _allMistakes.length === 0;
    const nextBtn = document.createElement('button');
    nextBtn.className = 'rd-review__next-btn';
    nextBtn.textContent = 'NEXT →';
    nextBtn.disabled = _allMistakes.length === 0;
    logFooter.appendChild(prevBtn);
    logFooter.appendChild(nextBtn);
    logEl.appendChild(logFooter);

    // ── Wire buttons ──────────────────────────────────────────
    startBtn.addEventListener('click', () => {
        overview.hidden = true;
        logEl.hidden = false;
        backBtnHeader.hidden = false;
        _reviewMistakeIdx = -1;
    });
    backBtnHeader.addEventListener('click', () => {
        logEl.hidden = true;
        overview.hidden = false;
        backBtnHeader.hidden = true;
        _highlightHexes     = null;
        _highlightShopSlots = null;
        renderSnap(_snapshots, _current);
    });
    prevBtn.addEventListener('click', () => {
        if (_allMistakes.length === 0) return;
        const idx = _reviewMistakeIdx <= 0
            ? _allMistakes.length - 1
            : _reviewMistakeIdx - 1;
        _activateMistake(idx);
    });
    nextBtn.addEventListener('click', () => {
        if (_allMistakes.length === 0) return;
        const idx = _reviewMistakeIdx < 0
            ? 0
            : (_reviewMistakeIdx + 1) % _allMistakes.length;
        _activateMistake(idx);
    });

    container.appendChild(overview);
    container.appendChild(logEl);
}

// ── Public API ────────────────────────────────────────────────
export function initAnalysis(events, board = {}, scores = []) {
    _snapshots = buildSnapshots(events);
    _current   = 0;
    if (!_snapshots.length) return;
    setupResponsive();
    renderSnap(_snapshots, _current);
    renderSpeedStats(events);
    renderRolldownReview(events, board, scores);
}

/**
 * Switch to the Detail tab and jump to the snapshot matching `label`
 * (e.g. "Roll 3" or "End"). No-ops if the label is not found.
 */
export function goToSnapshot(label) {
    _highlightHexes     = null;
    _highlightShopSlots = null;
    const idx = _snapshots.findIndex(s => s.label === label);
    if (idx === -1) return;
    document.querySelector('[data-tab="analysis"]').click();
    _current = idx;
    renderSnap(_snapshots, _current);
}
