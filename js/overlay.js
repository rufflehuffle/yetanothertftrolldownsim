import { state } from './state.js';
import { render } from './render.js';
import { addXp } from './logic.js';
import {
    getRdMode, setRdMode,
    isPlanning, isRound, isRoundEnd, isFreeroll,
    startRound, returnToPlanning, enterFreeroll, exitFreeroll, finishRound
} from './rolldown-state.js';
import { timerControls } from './timer.js';
import { lastLoadedPreset, loadPreset } from './teams.js';
import { triggerGenerate41Board } from './planner.js';
import { history, dispatch, ResetBoardCommand } from './commands.js';

// ============================================================
// Rolldown UI Overlays
// ============================================================
const rdShopOverlayHint             = document.querySelector('.rd-shop-overlay__hint');
const rdShopOverlayPresetName       = document.querySelector('.rd-shop-overlay__preset-name');
export const rdShopPrimaryBtn       = document.querySelector('.rd-shop-overlay__primary-btn');
const rdOverlayFreerollBtn          = document.querySelector('.rd-overlay-freeroll-btn');
const rdOverlayRoundendFreerollBtn  = document.querySelector('.rd-overlay-roundend-freeroll-btn');
const rdOverlayGenerateBtn          = document.querySelector('.rd-overlay-generate-btn');
const rdPauseEndBtn                 = document.querySelector('.rd-pause-overlay__end-btn');
const rdPauseResetBtn               = document.querySelector('.rd-pause-overlay__reset-btn');
const rdPauseFreerollBtn            = document.querySelector('.rd-pause-overlay__freeroll-btn');
const resetBoardBtn                 = document.querySelector('.reset-board-btn');
const rdEndRoundBtn                 = document.querySelector('.rd-end-round-btn');

export function updateOverlayContent() {
    const mode = getRdMode();
    if (mode === 'planning') {
        const canStart = !(Object.values(state.board).every(v => v === null) && state.teamPlan.size === 0);
        rdShopOverlayHint.textContent = 'Space to start';
        rdShopOverlayPresetName.textContent = '';
        rdShopPrimaryBtn.textContent = '▶  Start Round';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = !canStart;
        rdOverlayFreerollBtn.style.display = '';
        rdOverlayRoundendFreerollBtn.style.display = 'none';
        rdOverlayGenerateBtn.style.display = 'none';
    } else if (mode === 'roundEnd') {
        rdShopOverlayHint.textContent = lastLoadedPreset ? 'Press D to reset' : '';
        rdShopOverlayPresetName.textContent = lastLoadedPreset ? lastLoadedPreset.name : '';
        rdShopPrimaryBtn.textContent = lastLoadedPreset ? '↺  Reset to Preset' : '↺  Reset Timer';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = false;
        rdOverlayFreerollBtn.style.display = 'none';
        rdOverlayRoundendFreerollBtn.style.display = '';
        rdOverlayGenerateBtn.style.display = '';
    } else {
        rdOverlayRoundendFreerollBtn.style.display = 'none';
        rdOverlayGenerateBtn.style.display = 'none';
    }
    // Reset board button: only in planning, only when board has units
    const boardHasUnits = Object.values(state.board).some(v => v !== null);
    if (getRdMode() === 'planning' && boardHasUnits) {
        resetBoardBtn.textContent = state.boardGenerated ? '↺  Regenerate Board' : 'Clear Board';
        resetBoardBtn.style.display = 'block';
    } else {
        resetBoardBtn.style.display = 'none';
    }
    if (rdPauseResetBtn) {
        rdPauseResetBtn.disabled = !lastLoadedPreset;
        rdPauseResetBtn.textContent = lastLoadedPreset ? `↺  ${lastLoadedPreset.name}` : 'Reset to Preset';
    }
}

// Primary button: Start Round (planning) or Reset to Preset (roundEnd)
rdShopPrimaryBtn.addEventListener('click', () => {
    const mode = getRdMode();
    if (mode === 'planning') {
        addXp(2); // +2 XP: round passive grant
        render();
        timerControls.start();
        startRound();
    } else if (mode === 'roundEnd') {
        if (lastLoadedPreset) loadPreset(lastLoadedPreset);
        timerControls.reset();
        returnToPlanning();
    }
});

// Secondary overlay buttons
rdOverlayFreerollBtn.addEventListener('click', () => {
    if (isPlanning()) enterFreeroll();
});
rdOverlayRoundendFreerollBtn.addEventListener('click', () => {
    if (isRoundEnd()) {
        timerControls.reset();
        returnToPlanning();
        enterFreeroll();
        updateOverlayContent();
    }
});
rdOverlayGenerateBtn.addEventListener('click', () => {
    if (!isRoundEnd()) return;
    const applied = triggerGenerate41Board();
    if (!applied) return;
    timerControls.reset();
    returnToPlanning();
    updateOverlayContent();
});

// Pause overlay buttons
rdPauseResetBtn.addEventListener('click', () => {
    if (!lastLoadedPreset) return;
    loadPreset(lastLoadedPreset);
    timerControls.reset();
    setRdMode('planning');
    updateOverlayContent();
});
rdPauseEndBtn.addEventListener('click', () => {
    timerControls.reset();
    finishRound();
    document.dispatchEvent(new CustomEvent('roundcomplete'));
    updateOverlayContent();
});
rdPauseFreerollBtn.addEventListener('click', () => {
    timerControls.reset();
    enterFreeroll();
});

// Freeroll return button
document.querySelector('.freeroll-return-btn').addEventListener('click', () => {
    if (isFreeroll()) exitFreeroll();
});

// Reset board button (planning only)
resetBoardBtn.addEventListener('click', () => {
    if (!isPlanning()) return;
    if (state.boardGenerated) {
        triggerGenerate41Board();
        updateOverlayContent();
    } else {
        dispatch(new ResetBoardCommand());
    }
});

// postrd retry event
document.addEventListener('postrd-retry', () => {
    if (!lastLoadedPreset) return;
    loadPreset(lastLoadedPreset);
    timerControls.reset();
    setRdMode('planning');
    updateOverlayContent();
});

// Keep overlay fresh on every mode/state change
document.addEventListener('rdmodechange', () => updateOverlayContent());
history.addListener(updateOverlayContent);
document.addEventListener('teamplanchange', updateOverlayContent);

// ============================================================
// End Round button (3 s since last roll, or low gold during round)
// ============================================================
let _noRollElapsed = false;
let _noRollTimer = null;
let _endRoundBtnEverShown = false;

function _updateEndRoundBtn() {
    if (isRound() && (state.gold < 5 || _noRollElapsed)) _endRoundBtnEverShown = true;
    const visible = isRound() && _endRoundBtnEverShown;
    rdEndRoundBtn.classList.toggle('rd-end-round-btn--visible', visible);
    rdEndRoundBtn.classList.toggle('rd-end-round-btn--dim', isRound() && !visible);
}

function _startNoRollTimer() {
    clearTimeout(_noRollTimer);
    _noRollElapsed = false;
    _noRollTimer = setTimeout(() => {
        _noRollElapsed = true;
        _updateEndRoundBtn();
    }, 3000);
}

document.addEventListener('shoproll', () => { if (isRound()) _startNoRollTimer(); });

document.addEventListener('rdmodechange', ({ detail: { from, to } }) => {
    if (to === 'round' && from !== 'paused') {
        _noRollElapsed = false;
        _endRoundBtnEverShown = false;
        _startNoRollTimer();
        _updateEndRoundBtn();
    } else if (to === 'round') {
        // Resuming from pause — restart the idle timer, preserve _endRoundBtnEverShown
        _startNoRollTimer();
        _updateEndRoundBtn();
    } else {
        clearTimeout(_noRollTimer);
        _noRollElapsed = false;
        if (to !== 'paused') _endRoundBtnEverShown = false;
        _updateEndRoundBtn();
    }
});

history.addListener(() => _updateEndRoundBtn());

function _endRoundEarly() {
    clearTimeout(_noRollTimer);
    timerControls.reset();
    finishRound();
    document.dispatchEvent(new CustomEvent('roundcomplete'));
    updateOverlayContent();
}

rdEndRoundBtn.addEventListener('click', _endRoundEarly);

// Init
updateOverlayContent();
