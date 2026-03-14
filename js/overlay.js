import { state } from './state.js';
import {
    getRdMode, setRdMode,
    isPlanning, isRoundEnd, isFreeroll,
    startRound, returnToPlanning, enterFreeroll, exitFreeroll, finishRound
} from './rolldown-state.js';
import { timerControls } from './timer.js';
import { lastLoadedPreset, loadPreset, openPresets, openSavePreset } from './teams.js';
import { openTeamBuilder } from './team-builder.js';
import { ghost } from './drag.js';
import { triggerGenerate41Board } from './planner.js';
import { history } from './commands.js';

// ============================================================
// Rolldown UI Overlays
// ============================================================
const rdShopOverlayHint             = document.querySelector('.rd-shop-overlay__hint');
const rdShopOverlayPresetName       = document.querySelector('.rd-shop-overlay__preset-name');
export const rdShopPrimaryBtn       = document.querySelector('.rd-shop-overlay__primary-btn');
const rdOverlayTbBtn                = document.querySelector('.rd-overlay-tb-btn');
const rdOverlayPresetsBtn           = document.querySelector('.rd-overlay-presets-btn');
const rdOverlayFreerollBtn          = document.querySelector('.rd-overlay-freeroll-btn');
const rdOverlayRoundendFreerollBtn  = document.querySelector('.rd-overlay-roundend-freeroll-btn');
const rdOverlayGenerateBtn          = document.querySelector('.rd-overlay-generate-btn');
const rdPauseEndBtn                 = document.querySelector('.rd-pause-overlay__end-btn');
const rdPauseResetBtn               = document.querySelector('.rd-pause-overlay__reset-btn');
const rdPauseFreerollBtn            = document.querySelector('.rd-pause-overlay__freeroll-btn');

export function updateOverlayContent() {
    const mode = getRdMode();
    if (mode === 'planning') {
        const canStart = !(Object.values(state.board).every(v => v === null) && state.teamPlan.size === 0);
        rdShopOverlayHint.textContent = 'Space to start';
        rdShopOverlayPresetName.textContent = '';
        rdShopPrimaryBtn.textContent = '▶  Start Round';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = !canStart;
        rdOverlayTbBtn.style.display = '';
        rdOverlayPresetsBtn.style.display = '';
        rdOverlayFreerollBtn.style.display = '';
        rdOverlayRoundendFreerollBtn.style.display = 'none';
        rdOverlayGenerateBtn.style.display = 'none';
    } else if (mode === 'roundEnd') {
        rdShopOverlayHint.textContent = lastLoadedPreset ? 'Press D to reset' : '';
        rdShopOverlayPresetName.textContent = lastLoadedPreset ? lastLoadedPreset.name : '';
        rdShopPrimaryBtn.textContent = lastLoadedPreset ? '↺  Reset to Preset' : '↺  Reset Timer';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = false;
        rdOverlayTbBtn.style.display = 'none';
        rdOverlayPresetsBtn.style.display = 'none';
        rdOverlayFreerollBtn.style.display = 'none';
        rdOverlayRoundendFreerollBtn.style.display = '';
        rdOverlayGenerateBtn.style.display = '';
    } else {
        rdOverlayRoundendFreerollBtn.style.display = 'none';
        rdOverlayGenerateBtn.style.display = 'none';
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
        timerControls.start();
        startRound();
    } else if (mode === 'roundEnd') {
        if (lastLoadedPreset) loadPreset(lastLoadedPreset);
        timerControls.reset();
        returnToPlanning();
    }
});

// Secondary overlay buttons
rdOverlayTbBtn.addEventListener('click', () => {
    if (isPlanning()) openTeamBuilder(ghost, openSavePreset);
});
rdOverlayPresetsBtn.addEventListener('click', () => {
    if (isPlanning()) openPresets();
});
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
    returnToPlanning();
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

// Init
updateOverlayContent();
