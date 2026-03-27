import { state } from './state.js';
import { render } from './render.js';
import { applyBoardEffects } from './effects.js';
import { openTeamBuilder, closeTeamBuilder } from './team-builder.js';
import { openSavePreset } from './teams.js';
import { ghost } from './drag.js';
import { dispatch, BuyXpCommand } from './commands.js';
import { isRoundEnd } from './rolldown-state.js';

// ============================================================
// Level dropdown
// ============================================================
(function () {
    const levelDropdown = document.querySelector('.level-dropdown');
    const levelDisplay  = document.querySelector('.level-display');

    levelDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        levelDropdown.classList.toggle('open');
    });

    levelDropdown.querySelectorAll('.level-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const chosen = Number(opt.dataset.value);
            if (chosen !== state.level) {
                state.level = chosen;
                state.xp = 0;
                applyBoardEffects(state);
                render();
            }
            levelDropdown.classList.remove('open');
        });
    });

    document.addEventListener('click', () => {
        levelDropdown.classList.remove('open');
    });
})();

// ============================================================
// Gold editor (persistent input)
// ============================================================
(function () {
    const goldInput = document.querySelector('.gold-persistent');
    let persistentOriginal = state.gold;

    goldInput.addEventListener('focus', () => {
        persistentOriginal = state.gold;
        goldInput.select();
    });
    goldInput.addEventListener('blur', () => {
        const val = parseInt(goldInput.value, 10);
        state.gold = isNaN(val) ? persistentOriginal : Math.max(0, val);
        render();
    });
    goldInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); goldInput.blur(); }
        if (e.key === 'Escape') { goldInput.value = state.gold; goldInput.blur(); }
    });
    goldInput.addEventListener('mousedown', (e) => e.stopPropagation());
    goldInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
})();

// ============================================================
// Team Builder & Presets sidebar buttons
// ============================================================
document.querySelector('.buy-xp-button').addEventListener('click', () => { if (!isRoundEnd()) dispatch(new BuyXpCommand()); });

document.querySelector('.builder-btn').addEventListener('click', () => openTeamBuilder(ghost, openSavePreset));
document.querySelector('.rolldown-btn').addEventListener('click', closeTeamBuilder);
