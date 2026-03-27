import { getEvents } from './round.js';
import { state } from './state.js';
import { openPostRdWith } from './postrd/postrd.js';

// ============================================================
// TFT Debug Utilities — exposed on window.__tft
// ============================================================
// DevTools commands:
//
//   __tft.openPostRd()
//     Instantly opens the post-rolldown screen with the current
//     live event log and board state.
//
//   __tft.exportEventLog()
//     Downloads the last rolldown event log as a JSON file.
//
//   __tft.toggleAutoOpen()
//     Saves the current event log + board to localStorage and
//     sets a flag so the post-rolldown screen auto-opens on the
//     next page load. Call again to clear the flag.
// ============================================================

const LS_EVENTS = '__tft_debug_events';
const LS_BOARD  = '__tft_debug_board';
const LS_AUTO   = '__tft_debug_autoopen';

// ── Auto-open on load ─────────────────────────────────────────
if (localStorage.getItem(LS_AUTO) === 'true') {
    try {
        const events = JSON.parse(localStorage.getItem(LS_EVENTS) || '[]');
        const board  = JSON.parse(localStorage.getItem(LS_BOARD)  || '{}');
        // Defer one tick so all module init (timers, state hydration) completes first
        setTimeout(() => openPostRdWith(events, board), 0);
        console.log(`[TFT Debug] Auto-opening post-RD screen (${events.length} stored events)`);
    } catch (e) {
        console.error('[TFT Debug] Failed to restore stored event log:', e);
    }
}

// ── window.__tft namespace ────────────────────────────────────
window.__tft ??= {};

/**
 * Instantly open the post-rolldown screen using the current live event log.
 * Useful mid-session to preview grading without finishing a round.
 */
window.__tft.openPostRd = () => {
    openPostRdWith(getEvents(), state.board.snapshot());
};

/**
 * Download the current round event log as a timestamped JSON file.
 * Use after completing a rolldown to export its event data.
 */
window.__tft.exportEventLog = () => {
    const events = getEvents();
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href:     url,
        download: `tft-events-${Date.now()}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[TFT Debug] Exported ${events.length} events`);
};

/**
 * Toggle the auto-open flag in localStorage.
 *
 * When enabling: saves the current event log + board state, then sets the flag.
 *   Reload the page and the post-rolldown screen will open automatically.
 * When disabling: clears the saved snapshot and the flag.
 *
 * Optionally pass a pre-built events array to replay a specific log:
 *   __tft.toggleAutoOpen(myEvents, myBoard)
 */
window.__tft.toggleAutoOpen = (eventsOverride, boardOverride) => {
    if (localStorage.getItem(LS_AUTO) === 'true') {
        localStorage.removeItem(LS_EVENTS);
        localStorage.removeItem(LS_BOARD);
        localStorage.removeItem(LS_AUTO);
        console.log('[TFT Debug] Auto-open disabled');
    } else {
        const events = eventsOverride ?? getEvents();
        const board  = boardOverride  ?? state.board.snapshot();
        localStorage.setItem(LS_EVENTS, JSON.stringify(events));
        localStorage.setItem(LS_BOARD,  JSON.stringify(board));
        localStorage.setItem(LS_AUTO,   'true');
        console.log(`[TFT Debug] Auto-open enabled (${events.length} events). Reload the page to trigger it.`);
    }
};
