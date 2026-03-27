import { computeTraits } from './render.js';
import { setUnitAt } from './board.js';
import { isChampOnBoard, isChampAnywhere, removeChamps } from './units.js';

export function applyBoardEffects(state) {
    handleFreljordTower(state);
    handleAzirSoldiers(state);
    handleTibbers(state);
}

function handleFreljordTower(state) {
    const { traitCounts } = computeTraits();
    const freljordCount = traitCounts['Freljord'] ?? 0;
    const hasTower = isChampOnBoard(state, 'Ice Tower');
    if (freljordCount >= 3 && !hasTower) {
        setUnitAt(state, {type: 'board', key: 'B2'}, {name: 'Ice Tower', stars: 1});
    } else if (freljordCount < 3 && hasTower) {
        removeChamps(state, 'Ice Tower');
    }
}

function handleAzirSoldiers(state) {
    if (isChampOnBoard(state, 'Azir') && !isChampOnBoard(state, 'Sand Soldier')) {
        setUnitAt(state, {type: 'board', key: 'A1'}, {name: 'Sand Soldier', stars: 1});
        setUnitAt(state, {type: 'board', key: 'A2'}, {name: 'Sand Soldier', stars: 1});
    } else if (!isChampOnBoard(state, 'Azir') && isChampOnBoard(state, 'Sand Soldier')) {
        removeChamps(state, 'Sand Soldier');
    }
}

function handleTibbers(state) {
    if (isChampOnBoard(state, 'Annie') && !isChampAnywhere(state, 'Tibbers')) {
        setUnitAt(state, {type: 'bench', index: 0}, {name: 'Tibbers', stars: 1});
    } else if (!isChampOnBoard(state, 'Annie')) {
        removeChamps(state, 'Tibbers');
    }
}
