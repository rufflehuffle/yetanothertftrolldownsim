// ============================================================
// postrd/analysis.js — Public API for the analysis tab
// ============================================================

import { buildSnapshots } from './snapshots.js';
import { setupResponsive } from './animation.js';
import { renderSpeedStats } from './renderers.js';
import {
    getSnapshots, setSnapshots, setCurrent,
    setReviewMode, cancelPendingAnim,
    renderSnap, renderRolldownReview, goToSnapshot,
} from './review.js';

/**
 * Initialize the analysis tab with round events and final board.
 * Called once per completed rolldown from postrd.js.
 */
export function initAnalysis(events, board = {}, scores = []) {
    const snapshots = buildSnapshots(events);
    setSnapshots(snapshots);
    cancelPendingAnim();
    setReviewMode(false);
    if (!snapshots.length) return;
    setCurrent(snapshots.length - 1);   // default to final board
    setupResponsive();
    renderSnap(snapshots, snapshots.length - 1);
    renderSpeedStats(events);
    renderRolldownReview(events, board, scores);
}

export { goToSnapshot };
