// ============================================================
// postrd/overview.js — Score Breakdown tab: mistakes per scoring section
// ============================================================

import {
    speedMistakes,
    disciplineMistakes,
    accuracyMistakes,
    positioningMistakes,
    flexibilityMistakes,
} from './mistakes.js';
import { goToSnapshot } from './analysis.js';
import { scoreToGrade, METRIC_NAMES } from './helpers.js';

/**
 * Populates the 5-column grid with per-section mistakes.
 * Clickable items switch to the analysis tab and jump to the snapshot.
 *
 * @param {object[]} events - Array from round.getEvents()
 * @param {object}   board  - Final board state
 * @param {number[]} scores - [Speed, Discipline, Accuracy, Positioning, Flexibility] (0-100)
 */
export function initOverview(events, board, scores) {
    const container = document.getElementById('postrd-overview-cols');
    container.innerHTML = '';

    const builders = [
        () => speedMistakes(events),
        () => disciplineMistakes(events),
        () => accuracyMistakes(events),
        () => positioningMistakes(board),
        () => flexibilityMistakes(events),
    ];

    for (let i = 0; i < METRIC_NAMES.length; i++) {
        const col = document.createElement('div');
        col.className = 'overview-col';

        // Header: grade letter + numeric score + section name
        const header = document.createElement('div');
        header.className = 'overview-col__header';

        const grade = document.createElement('span');
        grade.className = 'overview-col__grade';
        grade.textContent = scoreToGrade(scores[i]);

        const numeric = document.createElement('span');
        numeric.className = 'overview-col__score';
        numeric.textContent = Math.round(scores[i]);

        const title = document.createElement('span');
        title.className = 'overview-col__title';
        title.textContent = METRIC_NAMES[i].toUpperCase();

        header.appendChild(grade);
        header.appendChild(numeric);
        header.appendChild(title);
        col.appendChild(header);

        // Mistake list
        const mistakes = builders[i]();
        const list = document.createElement('ul');
        list.className = 'overview-col__list';

        if (mistakes.length === 0) {
            const item = document.createElement('li');
            item.className = 'overview-col__item overview-col__item--perfect';
            item.textContent = 'No mistakes';
            list.appendChild(item);
        } else {
            for (const { text, snapshotLabel } of mistakes) {
                const item = document.createElement('li');
                item.className = 'overview-col__item';
                item.textContent = text;
                if (snapshotLabel) {
                    item.classList.add('overview-col__item--link');
                    item.addEventListener('click', () => goToSnapshot(snapshotLabel));
                }
                list.appendChild(item);
            }
        }

        col.appendChild(list);
        container.appendChild(col);
    }
}
