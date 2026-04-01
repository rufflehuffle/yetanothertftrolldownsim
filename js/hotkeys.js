import { dispatch, history, RollCommand, BuyXpCommand, SellCommand, MoveHoveredCommand } from './commands.js';
import { getUnitAt } from './board.js';
import { hoveredSlot } from './movement.js';
import {
    isPlanning, isRound, isPaused, isRoundEnd, isFreeroll, isActiveRound,
    startRound, pauseRound, resumeRound, returnToPlanning, exitFreeroll
} from './rolldown-state.js';
import { timerControls } from './timer.js';
import { lastLoadedPreset, loadPreset } from './teams.js';
import { dragging, endDrag } from './drag.js';
import { playSound } from './audio.js';
import { rdShopPrimaryBtn, updateOverlayContent, wasLastRoundGenerated } from './overlay.js';
import { triggerGenerate41Board } from './planner.js';
import { state } from './state.js';
import { teamBuilderActive } from './team-builder.js';
import { render } from './render.js';
import { addXp } from './shop.js';
import { ACTIONS, matches, matchesMouse } from './hotkey-bindings.js';

// ---- Shared action dispatcher ----

function fireAction(id, repeat = false) {
    switch (id) {
        case 'loadPreset':
            if (lastLoadedPreset && !isActiveRound()) loadPreset(lastLoadedPreset);
            break;

        case 'round':
            if (isPlanning() && !rdShopPrimaryBtn.disabled) {
                addXp(state, 2); // +2 XP: round passive grant
                render();
                timerControls.start();
                startRound();
            } else if (isPaused()) {
                timerControls.resume();
                resumeRound();
            } else if (isRound()) {
                timerControls.pause();
                pauseRound();
            }
            break;

        case 'reroll':
            if (!repeat) {
                if (isRoundEnd() && (lastLoadedPreset || wasLastRoundGenerated())) {
                    if (wasLastRoundGenerated()) {
                        triggerGenerate41Board();
                    } else {
                        loadPreset(lastLoadedPreset);
                    }
                    timerControls.reset();
                    returnToPlanning();
                    updateOverlayContent();
                } else if (!isPlanning() && !isRoundEnd()) {
                    dispatch(new RollCommand());
                }
            }
            break;

        case 'buyXp':
            if (!repeat && !isRoundEnd()) dispatch(new BuyXpCommand());
            break;

        case 'moveToBoard':
            if (isPlanning()) { playSound('board_full.mp3'); return; }
            dispatch(new MoveHoveredCommand());
            break;

        case 'sell': {
            if (isRoundEnd()) return;
            const activeSlot = (dragging && dragging.type !== 'shop') ? dragging : hoveredSlot;
            if (isPlanning() && activeSlot?.type !== 'bench' && !teamBuilderActive) return;
            if (dragging && dragging.type !== 'shop') {
                const unit = getUnitAt(state, dragging);
                if (unit) dispatch(new SellCommand(unit, dragging));
                endDrag();
            } else if (!dragging && hoveredSlot) {
                const unit = getUnitAt(state, hoveredSlot);
                if (unit) dispatch(new SellCommand(unit, hoveredSlot));
            }
            break;
        }
    }
}

// ---- Keyboard handler ----

document.addEventListener('keydown', (e) => {
    // Escape: exit free roll, or pause the round (hardcoded — not remappable)
    if (e.key === 'Escape') {
        if (isFreeroll()) {
            exitFreeroll();
        } else if (isRound()) {
            timerControls.pause();
            pauseRound();
        }
        return;
    }

    if (e.target.tagName === 'INPUT') return;

    for (const { id } of ACTIONS) {
        if (matches(e, id)) {
            e.preventDefault();
            fireAction(id, e.repeat);
            break;
        }
    }
});

// ---- Mouse handler ----

document.addEventListener('mousedown', (e) => {
    // Don't fire while the hotkeys modal is open (user may be rebinding)
    if (document.getElementById('hotkeys-modal')?.classList.contains('hotkeys-modal--open')) return;
    if (e.target.tagName === 'INPUT') return;

    for (const { id } of ACTIONS) {
        if (matchesMouse(e, id)) {
            e.preventDefault();
            fireAction(id, false);
            break;
        }
    }
});
