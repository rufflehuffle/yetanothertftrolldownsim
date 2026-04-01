import { state } from './state.js';
import { render } from './render.js';
import { applyBoardEffects } from './effects.js';
import { openTeamBuilder, closeTeamBuilder } from './team-builder.js';
import { openSavePreset } from './teams.js';
import { ghost } from './drag.js';
import { dispatch, BuyXpCommand, RollCommand } from './commands.js';
import { isPlanning, isRoundEnd, isActiveRound } from './rolldown-state.js';

// ============================================================
// Level dropdown
// ============================================================
(function () {
    document.querySelectorAll('.level-display').forEach(levelDisplay => {
        const levelDropdown = levelDisplay.closest('.level-dropdown');
        levelDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            levelDropdown.classList.toggle('open');
        });
    });

    document.querySelectorAll('.level-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const chosen = Number(opt.dataset.value);
            if (chosen !== state.level) {
                state.level = chosen;
                state.xp = 0;
                applyBoardEffects(state);
                render();
            }
            document.querySelectorAll('.level-dropdown').forEach(d => d.classList.remove('open'));
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.level-dropdown').forEach(d => d.classList.remove('open'));
    });
})();

// ============================================================
// Gold editor (persistent input)
// ============================================================
(function () {
    document.querySelectorAll('.gold-persistent').forEach(goldInput => {
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
    });
})();

// ============================================================
// Team Builder & Presets sidebar buttons
// ============================================================
document.querySelectorAll('.buy-xp-button').forEach(btn => btn.addEventListener('click', () => { if (!isRoundEnd()) dispatch(new BuyXpCommand()); }));
document.querySelector('.roll-button').addEventListener('click', () => { if (!isPlanning() && !isRoundEnd()) dispatch(new RollCommand()); });

document.querySelector('.builder-btn').addEventListener('click', () => { if (!isActiveRound()) openTeamBuilder(ghost, openSavePreset); });
document.querySelector('.rolldown-btn').addEventListener('click', closeTeamBuilder);
