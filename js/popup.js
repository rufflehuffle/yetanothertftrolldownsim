import { state } from './state.js';
import { openTeamPlanner, triggerGenerate41Board } from './team-planner.js';
import { history } from './commands.js';
import { isPlanning, isFreeroll } from './rolldown-state.js';

const popupEl       = document.querySelector('.no-comp-popup');
const emptyEl       = document.querySelector('.no-comp-popup--empty');
const hasPlanEl     = document.querySelector('.no-comp-popup--has-plan');
const openBtn       = document.querySelector('.no-comp-popup__open-btn');
const generateBtn   = document.querySelector('.no-comp-popup__generate-btn');

function isBoardEmpty() {
    return Object.values(state.board).every(v => v === null);
}

function isPlannerEmpty() {
    return state.teamPlan.size === 0;
}

export function updateNoCompPopup() {
    const active = isPlanning() || isFreeroll();
    const boardEmpty = isBoardEmpty();
    const plannerEmpty = isPlannerEmpty();

    if (!active || !boardEmpty) {
        popupEl.style.display = 'none';
        return;
    }

    popupEl.style.display = 'flex';
    if (plannerEmpty) {
        emptyEl.style.display = '';
        hasPlanEl.style.display = 'none';
    } else {
        emptyEl.style.display = 'none';
        hasPlanEl.style.display = '';
    }
}

openBtn.addEventListener('click', () => {
    openTeamPlanner();
});

generateBtn.addEventListener('click', () => {
    triggerGenerate41Board();
});

history.addListener(updateNoCompPopup);
document.addEventListener('rdmodechange', updateNoCompPopup);
document.addEventListener('teamplanchange', updateNoCompPopup);
