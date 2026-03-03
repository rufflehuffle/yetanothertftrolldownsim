// ============================================================
// Rolldown State Machine
// ============================================================
// Modes:
//   'planning'   — between rounds; can access team builder, presets, set timer
//   'round'      — timer is ticking; shop/board are live; team builder/presets locked
//   'paused'     — timer frozen mid-round; shop/board blocked
//   'roundEnd'   — timer expired; board/shop locked; waiting for player to reset
//   'freeroll'   — infinite timer; full shop/board access + team builder; no countdown
//
// Open menus tracked separately so mode transitions can close them as needed.
// ============================================================

const VALID_MODES = new Set(['planning', 'round', 'paused', 'roundEnd', 'freeroll']);

const _state = {
    mode: 'planning',
};

// ── Getters ──────────────────────────────────────────────────

export function getRdMode() { return _state.mode; }

export function isPlanning()  { return _state.mode === 'planning'; }
export function isRound()     { return _state.mode === 'round'; }
export function isPaused()    { return _state.mode === 'paused'; }
export function isRoundEnd()  { return _state.mode === 'roundEnd'; }
export function isFreeroll()  { return _state.mode === 'freeroll'; }

// ── Core transition ──────────────────────────────────────────

/**
 * Transition to a new mode. Fires a 'rdmodechange' CustomEvent on document
 * with { detail: { from, to } } so any module can react without coupling.
 */
export function setRdMode(newMode) {
    if (!VALID_MODES.has(newMode)) {
        console.warn(`[rdState] Unknown mode: ${newMode}`);
        return;
    }
    if (newMode === _state.mode) return;

    const from = _state.mode;
    _state.mode = newMode;

    // Apply body class for CSS hooks
    document.body.classList.remove('rd-planning', 'rd-round', 'rd-paused', 'rd-roundEnd', 'rd-freeroll');
    document.body.classList.add(`rd-${newMode}`);

    document.dispatchEvent(new CustomEvent('rdmodechange', {
        detail: { from, to: newMode }
    }));
}

// ── Named transitions ────────────────────────────────────────
// Convenience wrappers that encode allowed transitions.
// The timer control functions (start/pause/reset/lock) are wired
// in main.js after the timer module initialises.

/** Player clicks "Start Round" from planning screen. */
export function startRound() {
    if (_state.mode !== 'planning') return false;
    setRdMode('round');
    return true;
}

/** Player pauses during a round. */
export function pauseRound() {
    if (_state.mode !== 'round') return false;
    setRdMode('paused');
    return true;
}

/** Player resumes from pause. */
export function resumeRound() {
    if (_state.mode !== 'paused') return false;
    setRdMode('round');
    return true;
}

/** Round timer expires or player ends the round early → locked state. */
export function finishRound() {
    if (_state.mode !== 'round' && _state.mode !== 'paused') return false;
    setRdMode('roundEnd');
    return true;
}

/** Player resets from the roundEnd screen → back to planning. */
export function returnToPlanning() {
    if (_state.mode !== 'roundEnd') return false;
    setRdMode('planning');
    return true;
}

/** Enter free-roll mode (infinite timer, full access + team builder). */
export function enterFreeroll() {
    setRdMode('freeroll');
    return true;
}

/** Exit freeroll → planning or round depending on context. */
export function exitFreeroll(toMode = 'planning') {
    if (_state.mode !== 'freeroll') return false;
    setRdMode(toMode);
    return true;
}

// ── Init ─────────────────────────────────────────────────────
// Apply the starting body class on load.
document.body.classList.add('rd-planning');