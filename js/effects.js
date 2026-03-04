import { computeTraits, render } from './render.js';
import { isChampOnBoard, isChampAnywhere, setUnitAt, removeChamps } from './logic.js';

export function applyBoardEffects() {
    handleFreljordTower();
    handleAzirSoldiers();
    handleTibbers();
    render();
}

function handleFreljordTower() {
    const { traitCounts } = computeTraits();
    const freljordCount = traitCounts['Freljord'] ?? 0;
    const hasTower = isChampOnBoard('Ice Tower');
    if (freljordCount >= 3 && !hasTower) {
        setUnitAt({type: 'board', key: 'B2'}, {name: 'Ice Tower', stars: 1});
    } else if (freljordCount < 3 && hasTower) {
        removeChamps('Ice Tower');
    }
}

function handleAzirSoldiers() {
    if (isChampOnBoard('Azir') && !isChampOnBoard('Sand Soldier')) {
        setUnitAt({type: 'board', key: 'A1'}, {name: 'Sand Soldier', stars: 1});
        setUnitAt({type: 'board', key: 'A2'}, {name: 'Sand Soldier', stars: 1});
    } else if (!isChampOnBoard('Azir') && isChampOnBoard('Sand Soldier')) {
        removeChamps('Sand Soldier');
    }
}

function handleTibbers() {
    if (isChampOnBoard('Annie') && !isChampAnywhere('Tibbers')) {
        setUnitAt({type: 'bench', index: 0}, {name: 'Tibbers', stars: 1});
    } else if (!isChampOnBoard('Annie')) {
        removeChamps('Tibbers');
    }
}
