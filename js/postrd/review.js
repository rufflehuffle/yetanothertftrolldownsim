// ============================================================
// postrd/review.js — Rolldown review panel, navigation state,
//                    snapshot rendering, and arrow-key handling
// ============================================================

import { positioningMistakeHexes } from '../grading/positioning.js';
import {
    speedMistakes,
    disciplineMistakes,
    accuracyMistakes,
    positioningMistakes,
    flexibilityMistakes,
} from './mistakes.js';
import { scoreToGrade, METRIC_NAMES } from './helpers.js';
import { renderBoard, renderBench, renderShop, renderTraits } from './renderers.js';
import { captureRects, triggerMoveAnimations, clearGhosts } from './animation.js';

// ── Shared navigation state ─────────────────────────────────
let _snapshots          = [];
let _current            = 0;
let _allMistakes        = [];   // navigable mistakes (excludes sentinels)
let _allMoments         = [];   // [startSentinel, ...mistakes, endSentinel]
let _reviewMistakeIdx   = -1;
let _mistakeLiMap       = new Map();
let _highlightHexes     = null; // Map<boardKey, type> | null
let _highlightShopSlots = null; // Set<number> | null
let _reviewMode         = false;
let _cancelAnimation    = null;
let _prevBtn            = null;
let _nextBtn            = null;

// ── Getters / setters for external modules ───────────────────

export function getSnapshots()        { return _snapshots; }
export function getCurrent()          { return _current; }
export function setSnapshots(s)       { _snapshots = s; }
export function setCurrent(i)         { _current = i; }
export function setReviewMode(v)      { _reviewMode = v; }
export function cancelPendingAnim() {
    if (_cancelAnimation) { _cancelAnimation(); _cancelAnimation = null; }
    clearGhosts();
}

// ── Render a single snapshot ─────────────────────────────────

export function renderSnap(snapshots, idx) {
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

// ── Highlight computation ────────────────────────────────────

function computeHighlightsForMistake(mistake, snap) {
    const board = snap?.board ?? {};
    const shop  = snap?.shop  ?? [];

    if (mistake.highlightType === 'accuracy' || mistake.highlightType === 'flexibility') {
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

// ── Animated navigation to a labelled snapshot ───────────────

function reviewNavigate(label, hexes, shopSlots = null) {
    const targetIdx = _snapshots.findIndex(s => s.label === label);
    if (targetIdx === -1) return;
    document.querySelector('[data-tab="analysis"]').click();

    cancelPendingAnim();

    const step = targetIdx > _current ? 1 : targetIdx < _current ? -1 : 0;
    if (step === 0) {
        _highlightHexes     = hexes;
        _highlightShopSlots = shopSlots;
        renderSnap(_snapshots, _current);
        return;
    }

    const frames = [];
    for (let i = _current + step; step > 0 ? i <= targetIdx : i >= targetIdx; i += step) {
        frames.push(i);
    }

    let cancelled = false;
    _cancelAnimation = () => { cancelled = true; };

    let fi = 0;
    async function tick() {
        if (cancelled) return;
        const idx = frames[fi++];
        const isFinal = fi >= frames.length;

        const oldRects = captureRects(_snapshots[_current]);

        _current            = idx;
        _highlightHexes     = isFinal ? hexes     : null;
        _highlightShopSlots = isFinal ? shopSlots : null;
        renderSnap(_snapshots, _current);

        await triggerMoveAnimations(oldRects, captureRects(_snapshots[_current]));

        if (cancelled) return;
        if (!isFinal) {
            setTimeout(tick, 100);
        } else {
            _cancelAnimation = null;
        }
    }
    tick();
}

// ── PREV / NEXT button state ─────────────────────────────────

function updateNavButtons() {
    if (_prevBtn) _prevBtn.disabled = _reviewMistakeIdx <= 0;
    if (_nextBtn) _nextBtn.disabled = _allMoments.length === 0 || _reviewMistakeIdx >= _allMoments.length - 1;
}

// ── Activate a specific moment by index ──────────────────────

function activateMistake(idx) {
    _reviewMistakeIdx = idx;
    updateNavButtons();
    for (const li of _mistakeLiMap.values()) li.classList.remove('rd-review__mistake-item--active');

    const moment = _allMoments[idx];
    if (!moment) return;

    // Sentinel: navigate to Start/End with no highlights
    if (moment.isSentinel) {
        reviewNavigate(moment.snapshotLabel, null, null);
        return;
    }

    // Regular mistake: highlight its log entry and navigate
    const li = _mistakeLiMap.get(moment);
    if (li) {
        li.classList.add('rd-review__mistake-item--active');
        li.scrollIntoView({ block: 'nearest' });
    }
    const snap = _snapshots.find(s => s.label === moment.snapshotLabel);
    const { hexes, shopSlots } = computeHighlightsForMistake(moment, snap);
    if (moment.snapshotLabel === null) {
        _highlightHexes     = null;
        _highlightShopSlots = null;
        renderSnap(_snapshots, _current);
    } else {
        reviewNavigate(moment.snapshotLabel, hexes, shopSlots);
    }
}

// ── Prev / Next snapshot buttons ─────────────────────────────

document.getElementById('rd-prev').addEventListener('click', () => {
    cancelPendingAnim();
    if (_current > 0) { _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, --_current); }
});

document.getElementById('rd-next').addEventListener('click', () => {
    cancelPendingAnim();
    if (_current < _snapshots.length - 1) { _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, ++_current); }
});

// ── Keyboard navigation ──────────────────────────────────────

document.addEventListener('keydown', e => {
    if (document.getElementById('postrd-analysis').hidden) return;
    if (_reviewMode) {
        if (e.key === 'ArrowLeft') {
            if (_reviewMistakeIdx <= 0) return;
            activateMistake(_reviewMistakeIdx - 1);
        } else if (e.key === 'ArrowRight') {
            if (_reviewMistakeIdx >= _allMoments.length - 1) return;
            activateMistake(_reviewMistakeIdx < 0 ? 0 : _reviewMistakeIdx + 1);
        }
        return;
    }
    if (e.key === 'ArrowLeft'  && _current > 0)                     { cancelPendingAnim(); _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, --_current); }
    if (e.key === 'ArrowRight' && _current < _snapshots.length - 1) { cancelPendingAnim(); _highlightHexes = null; _highlightShopSlots = null; renderSnap(_snapshots, ++_current); }
});

// ── Public: jump to a labelled snapshot ──────────────────────

/**
 * Switch to the analysis tab and jump to the snapshot matching `label`
 * (e.g. "Roll 3" or "End"). No-ops if the label isn't found.
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

// ── Review panel: overview + log screens ─────────────────────

export function renderRolldownReview(events, board, scores) {
    const container = document.getElementById('rd-mistakes');
    if (!container) return;
    container.innerHTML = '';

    const perMetric = [
        speedMistakes(events),
        disciplineMistakes(events),
        accuracyMistakes(events),
        positioningMistakes(board),
        flexibilityMistakes(events),
    ];
    const allMistakes = perMetric.flat();

    // Sort navigable mistakes by snapshot order
    const snapOrder = new Map(_snapshots.map((s, i) => [s.label, i]));
    _allMistakes = allMistakes
        .filter(m => m.snapshotLabel !== null)
        .sort((a, b) => (snapOrder.get(a.snapshotLabel) ?? Infinity) - (snapOrder.get(b.snapshotLabel) ?? Infinity));

    // Sentinel moments bookend the list for terminal navigation
    _allMoments       = [
        { isSentinel: true, snapshotLabel: 'Start' },
        ..._allMistakes,
        { isSentinel: true, snapshotLabel: 'End' },
    ];
    _reviewMistakeIdx = -1;
    _mistakeLiMap     = new Map();

    // ── Header (always visible) ──────────────────────────────
    const header = document.createElement('div');
    header.className = 'rd-review__header';
    const backBtnHeader = document.createElement('button');
    backBtnHeader.className = 'rd-review__back-btn';
    backBtnHeader.textContent = '\u2190';
    backBtnHeader.hidden = true;
    const headerLabel = document.createElement('span');
    headerLabel.className = 'rd-review__header-label';
    headerLabel.textContent = 'ROLLDOWN REVIEW';
    header.appendChild(backBtnHeader);
    header.appendChild(headerLabel);
    container.appendChild(header);

    // ── Screen 1: Overview ───────────────────────────────────
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
    startBtn.textContent = 'START REVIEW \u2192';
    overview.appendChild(startBtn);

    // ── Screen 2: Log ────────────────────────────────────────
    const logEl = document.createElement('div');
    logEl.className = 'rd-review__log';
    logEl.hidden = true;

    const mistakesByLabel = new Map();
    for (const mistake of allMistakes) {
        const key = mistake.snapshotLabel ?? 'Round';
        if (!mistakesByLabel.has(key)) mistakesByLabel.set(key, []);
        mistakesByLabel.get(key).push(mistake);
    }

    const logList = document.createElement('div');
    logList.className = 'rd-review__log-list';

    // Helper: build a snapshot group in the log
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
            // Non-navigable groups (Round) — no checkmark
        } else if (mistakes.length === 0) {
            const ok = document.createElement('span');
            ok.className = 'rd-review__no-mistakes';
            ok.textContent = '\u2713';
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
                    const momentIdx = _allMoments.indexOf(mistake);
                    li.addEventListener('click', () => activateMistake(momentIdx));
                }
                li.textContent = mistake.text;
                ul.appendChild(li);
            }
            group.appendChild(ul);
        }
        return group;
    }

    // ROUND section (non-navigable speed items)
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

    // Per-snapshot groups
    for (const snap of _snapshots) {
        if (snap.label === 'Start') continue;
        if (!mistakesByLabel.has(snap.label)) continue;
        logList.appendChild(buildGroup(snap.label, snap.label.toUpperCase(), true));
    }
    logEl.appendChild(logList);

    // Log footer: PREV / NEXT
    const logFooter = document.createElement('div');
    logFooter.className = 'rd-review__log-footer';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'rd-review__prev-btn';
    prevBtn.textContent = '\u2190 PREV';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'rd-review__next-btn';
    nextBtn.textContent = 'NEXT \u2192';
    logFooter.appendChild(prevBtn);
    logFooter.appendChild(nextBtn);
    logEl.appendChild(logFooter);

    _prevBtn = prevBtn;
    _nextBtn = nextBtn;

    // ── Wire buttons ─────────────────────────────────────────
    startBtn.addEventListener('click', () => {
        overview.hidden = true;
        logEl.hidden = false;
        backBtnHeader.hidden = false;
        _reviewMistakeIdx = -1;
        _reviewMode = true;
        _current = 0;
        renderSnap(_snapshots, _current);
        updateNavButtons();
    });
    backBtnHeader.addEventListener('click', () => {
        logEl.hidden = true;
        overview.hidden = false;
        backBtnHeader.hidden = true;
        _reviewMode = false;
        cancelPendingAnim();
        _highlightHexes     = null;
        _highlightShopSlots = null;
        renderSnap(_snapshots, _current);
    });
    prevBtn.addEventListener('click', () => {
        if (_reviewMistakeIdx <= 0) return;
        activateMistake(_reviewMistakeIdx - 1);
    });
    nextBtn.addEventListener('click', () => {
        if (_reviewMistakeIdx >= _allMoments.length - 1) return;
        activateMistake(_reviewMistakeIdx < 0 ? 0 : _reviewMistakeIdx + 1);
    });

    container.appendChild(overview);
    container.appendChild(logEl);
}
