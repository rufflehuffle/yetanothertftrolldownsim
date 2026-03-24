// ============================================================
// postrd/animation.js — FLIP move animations + responsive hex sizing
// ============================================================

import { BOARD_ROWS, champIcon } from './helpers.js';
import { playSound } from '../audio.js';

// ── FLIP ghost animations ────────────────────────────────────

/** Remove any lingering ghost overlays (e.g. on cancel). */
export function clearGhosts() {
    document.querySelectorAll('.rd-fly-ghost').forEach(g => g.remove());
}

/**
 * Capture bounding rects for every occupied board hex and bench slot
 * so we can animate units that move between snapshots.
 */
export function captureRects(snap) {
    const map = new Map();

    const boardEl = document.getElementById('rd-board');
    const rows = boardEl ? boardEl.querySelectorAll('.rd-board-row') : [];
    rows.forEach((row, ri) => {
        row.querySelectorAll('.rd-hex-wrap').forEach((wrap, ci) => {
            const key = `${BOARD_ROWS[ri]}${ci + 1}`;
            const unit = snap.board?.[key];
            if (unit) {
                const inner = wrap.querySelector('.rd-hex') || wrap;
                map.set(`board:${key}`, { unit, rect: inner.getBoundingClientRect(), el: inner });
            }
        });
    });

    const benchEl = document.getElementById('rd-bench');
    if (benchEl) {
        benchEl.querySelectorAll('.rd-bench-wrap').forEach((wrap, i) => {
            const unit = snap.bench?.[i];
            if (unit) {
                const inner = wrap.querySelector('.rd-bench-slot') || wrap;
                map.set(`bench:${i}`, { unit, rect: inner.getBoundingClientRect(), el: inner });
            }
        });
    }

    return map;
}

/**
 * Compare old and new position maps; for each unit that moved,
 * hide the destination unit, then animate ghosts one-by-one.
 * Returns a Promise that resolves when all animations finish.
 */
export function triggerMoveAnimations(oldRects, newRects) {
    const oldBySig = new Map();
    for (const [posKey, { unit, rect }] of oldRects) {
        const sig = `${unit.name}:${unit.stars ?? 0}`;
        if (!oldBySig.has(sig)) oldBySig.set(sig, []);
        oldBySig.get(sig).push({ posKey, rect, unit });
    }
    const newBySig = new Map();
    for (const [posKey, { unit, rect, el }] of newRects) {
        const sig = `${unit.name}:${unit.stars ?? 0}`;
        if (!newBySig.has(sig)) newBySig.set(sig, []);
        newBySig.get(sig).push({ posKey, rect, unit, el });
    }

    // Collect all move pairs
    const moves = [];
    for (const [sig, newEntries] of newBySig) {
        const oldEntries = oldBySig.get(sig) ?? [];
        const oldPosSet = new Set(oldEntries.map(e => e.posKey));
        const newPosSet = new Set(newEntries.map(e => e.posKey));

        const movedFrom = oldEntries.filter(e => !newPosSet.has(e.posKey));
        const movedInto = newEntries.filter(e => !oldPosSet.has(e.posKey));

        const newlyAdded    = Math.max(0, newEntries.length - oldEntries.length);
        const animatableCount = Math.max(0, movedInto.length - newlyAdded);

        for (let i = 0; i < animatableCount && i < movedFrom.length; i++) {
            moves.push({
                unit: movedFrom[i].unit,
                fromRect: movedFrom[i].rect,
                toRect: movedInto[i].rect,
                destEl: movedInto[i].el,
            });
        }
    }

    if (moves.length === 0) return Promise.resolve();

    // Show empty hex at destination while ghost flies
    for (const m of moves) {
        m.savedBg = m.destEl.style.backgroundImage;
        m.destEl.style.backgroundImage = 'none';
        // Hide the star indicator beneath the hex
        const stars = m.destEl.parentElement?.querySelector('.rd-star-indicator');
        if (stars) { m.starsEl = stars; m.savedStars = stars.style.visibility; stars.style.visibility = 'hidden'; }
    }

    // Animate each move sequentially
    let i = 0;
    return new Promise(resolve => {
        function next() {
            if (i >= moves.length) { resolve(); return; }
            const m = moves[i++];
            playSound('unit_select.mp3');
            flyGhost(m.unit, m.fromRect, m.toRect, () => {
                // Restore unit image + stars once ghost arrives
                m.destEl.style.backgroundImage = m.savedBg;
                if (m.starsEl) m.starsEl.style.visibility = m.savedStars;
                playSound('unit_drop.mp3');
                next();
            });
        }
        next();
    });
}

/** Animate a translucent ghost hex from one rect to another. Calls onDone when finished. */
function flyGhost(unit, fromRect, toRect, onDone) {
    const ghost = document.createElement('div');
    ghost.className = 'rd-fly-ghost';
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top  - toRect.top;

    ghost.style.cssText = [
        `position:fixed`,
        `left:${toRect.left}px`,
        `top:${toRect.top}px`,
        `width:${toRect.width}px`,
        `height:${toRect.height}px`,
        `background-image:url(${champIcon(unit.name)})`,
        `background-size:cover`,
        `background-position:center`,
        `clip-path:polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`,
        `pointer-events:none`,
        `z-index:1000`,
        `transform:translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)`,
        `will-change:transform`,
    ].join(';');
    document.body.appendChild(ghost);

    ghost.getBoundingClientRect(); // force reflow

    requestAnimationFrame(() => {
        ghost.style.transition = 'transform 90ms cubic-bezier(0.15,0,0.2,1)';
        ghost.style.transform  = 'translate(0,0)';
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            if (ghost.parentNode) ghost.remove();
            if (onDone) onDone();
        };
        ghost.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 250);
    });
}

// ── Responsive hex sizing ────────────────────────────────────

let _resizeObserver = null;

/**
 * Attach a ResizeObserver to the board area so hex size and
 * trait panel position adapt when the container resizes.
 */
export function setupResponsive() {
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
