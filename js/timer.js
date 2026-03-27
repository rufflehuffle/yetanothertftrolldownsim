import { state } from './state.js';
import { render } from './render.js';
import { boardCount, findEmptyBoardHex } from './board.js';
import { applyBoardEffects } from './effects.js';
import { finishRound, isRound, isPaused, pauseRound, resumeRound } from './rolldown-state.js';

// ============================================================
// Round Timer
// ============================================================

// timerControls is populated below and exposed for overlay wiring
export let timerControls = {};

const timerValueEl  = document.querySelector('.timer-value');
const timerInput    = document.querySelector('.timer-input');
const progressFill  = document.querySelector('.top-timer-progress-fill');

let totalMs    = 30000; // total duration in milliseconds
let remainingMs = 30000; // ms left at last pause/start
let startedAt  = null;  // Date.now() when the current run began
let rafId      = null;
let running    = false;
let expired    = false;

// How many ms are actually left right now (accounts for time elapsed since startedAt)
function currentRemainingMs() {
    if (!running || startedAt === null) return remainingMs;
    return Math.max(0, remainingMs - (Date.now() - startedAt));
}

function showInput() {
    timerInput.style.display = '';
    timerValueEl.style.display = 'none';
}

function showText() {
    timerInput.style.display = 'none';
    timerValueEl.style.display = '';
}

function updateDisplay() {
    const ms = currentRemainingMs();
    const secs = Math.ceil(ms / 1000);
    timerValueEl.textContent = `${secs}`;
    const pct = totalMs > 0 ? (ms / totalMs) * 100 : 0;
    progressFill.style.width = `${pct}%`;
    timerValueEl.classList.toggle('timer-running',  running && !expired);
    timerValueEl.classList.toggle('timer-warning',  running && !expired && secs <= 5 && secs > 0);
    timerValueEl.classList.toggle('timer-expired',  expired);
    progressFill.classList.toggle('timer-warning',  secs <= 5 && secs > 0 && !expired);
    progressFill.classList.toggle('timer-expired',  expired);
}

function fillBoardFromBench() {
    for (let i = 0; i < state.bench.length; i++) {
        if (boardCount(state) >= state.level) break;
        const unit = state.bench[i];
        if (!unit) continue;
        const targetKey = findEmptyBoardHex(state);
        if (!targetKey) break;
        state.board[targetKey] = unit;
        state.bench[i] = null;
    }
    applyBoardEffects(state);
    render();
}

function lockBoard() {
    expired = true;
    remainingMs = 0;
    document.body.classList.add('timer-locked');
    fillBoardFromBench();
    finishRound();
    document.dispatchEvent(new CustomEvent('roundcomplete'));
}

function unlockBoard() {
    expired = false;
    document.body.classList.remove('timer-locked');
}

function tick() {
    if (!running) return;
    const ms = currentRemainingMs();
    updateDisplay();
    if (ms <= 0) {
        running = false;
        rafId = null;
        lockBoard();
        updateDisplay();
        return;
    }
    rafId = requestAnimationFrame(tick);
}

function runRaf() {
    running = true;
    startedAt = Date.now();
    showText();
    // No CSS transition while running — rAF drives the bar directly
    progressFill.style.transition = 'none';
    rafId = requestAnimationFrame(tick);
    updateDisplay();
}

function stopRaf() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    // Snapshot how much time was actually left when we stopped
    remainingMs = currentRemainingMs();
    startedAt = null;
    running = false;
}

function startTimer() {
    if (running || expired) return;
    const parsed = parseInt(timerInput.value, 10);
    totalMs = ((isNaN(parsed) || parsed < 1) ? 30 : parsed) * 1000;
    remainingMs = totalMs;
    runRaf();
}

// Resume from pause — picks up from wherever remainingMs is
function resumeTimer() {
    if (running || expired || remainingMs <= 0) return;
    runRaf();
}

function pauseTimer() {
    stopRaf();
    // Smooth short transition now that the bar is static
    progressFill.style.transition = 'width 0.15s ease, background 0.4s';
    updateDisplay();
}

function resetTimer() {
    stopRaf();
    unlockBoard();
    const parsed = parseInt(timerInput.value, 10);
    totalMs = ((isNaN(parsed) || parsed < 1) ? 30 : parsed) * 1000;
    remainingMs = totalMs;
    timerInput.value = Math.round(totalMs / 1000);
    progressFill.style.transition = 'width 0.3s ease, background 0.4s';
    showInput();
    updateDisplay();
}

timerInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

showInput();
updateDisplay();

// Expose timer controls for overlays and external callers
timerControls.start         = startTimer;
timerControls.resume        = resumeTimer;
timerControls.pause         = pauseTimer;
timerControls.reset         = resetTimer;
timerControls.lock          = lockBoard;
timerControls.unlock        = unlockBoard;
timerControls.isRunning     = () => running;
timerControls.isExpired     = () => expired;
timerControls.getRemaining  = () => Math.ceil(currentRemainingMs() / 1000);
timerControls.setDuration   = (secs) => {
    timerInput.value = secs;
    if (!running && !expired) {
        totalMs = secs * 1000;
        remainingMs = totalMs;
        updateDisplay();
    }
};

// ============================================================
// Timer pause button
// ============================================================
const timerPauseBtn = document.querySelector('.timer-pause-btn');

function updateTimerPauseBtn() {
    const active = isRound() || isPaused();
    timerPauseBtn.style.display = active ? '' : 'none';
    timerPauseBtn.textContent = isPaused() ? '▶' : '❚❚';
}

timerPauseBtn.addEventListener('click', () => {
    if (isRound()) {
        pauseRound();
    } else if (isPaused()) {
        resumeRound();
    }
});

document.addEventListener('rdmodechange', updateTimerPauseBtn);
updateTimerPauseBtn();

// ============================================================
// State machine → timer side effects
// ============================================================
document.addEventListener('rdmodechange', ({ detail: { from, to } }) => {
    // Pause the visual timer when the state machine moves to paused
    if (to === 'paused' && from === 'round') {
        if (timerControls.isRunning?.()) timerControls.pause();
    }
    // Resume the visual timer when the state machine moves back to round
    if (to === 'round' && from === 'paused') {
        if (!timerControls.isRunning?.() && !timerControls.isExpired?.()) timerControls.resume();
    }
    // roundEnd: board is already locked by lockBoard(); nothing extra needed here.
    // planning: board should be unlocked and timer reset so the next round can start
    if (to === 'planning') {
        if (timerControls.isExpired?.()) timerControls.reset();
    }
    // Freeroll: clear expired lock if somehow set
    if (to === 'freeroll') {
        if (timerControls.isExpired?.()) timerControls.unlock();
    }
});
