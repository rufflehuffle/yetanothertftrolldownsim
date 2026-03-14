import { pool, traits } from './tables.js';

// --- Data: count how many champions share each trait ---
const traitCounts = {};
for (const champ of Object.values(pool)) {
    for (const trait of champ.synergies) {
        traitCounts[trait] = (traitCounts[trait] || 0) + 1;
    }
}

// Alphabetical, drop traits belonging to only one unit
const filterTraits = Object.keys(traits)
    .filter(name => (traitCounts[name] ?? 0) > 1)
    .sort((a, b) => a.localeCompare(b));

// --- Render ---
const PER_COL = 8;

function buildFilterTraits(containerEl) {
    const numCols = Math.ceil(filterTraits.length / PER_COL);

    const columns = Array.from({ length: numCols }, (_, col) =>
        filterTraits.slice(col * PER_COL, col * PER_COL + PER_COL)
    );

    containerEl.innerHTML = columns.map(colTraits => `
        <div class="filter__trait-column">
            ${colTraits.map(name => `
                <div class="filter__trait" data-trait="${name}">
                    <span class="filter__trait-symbol" style="--symbol-img: url('${traits[name].icon}')"></span>
                    <span class="filter__trait-name">${name}</span>
                </div>
            `).join('')}
        </div>
    `).join('');

    // Toggle active on click
    containerEl.querySelectorAll('.filter__trait').forEach(el => {
        el.addEventListener('click', () => {
            el.classList.toggle('filter__trait--active');
            dispatchFilterChange();
        });
    });
}

export function getActiveFilterTraits() {
    return [...document.querySelectorAll('#filterModal .filter__trait--active')]
        .map(el => el.dataset.trait);
}

function dispatchFilterChange() {
    document.dispatchEvent(new CustomEvent('filterchange'));
}

// --- Wire up open / close / clear ---
export function initFilter(openBtnEl) {
    const modal    = document.getElementById('filterModal');
    const backdrop = document.getElementById('filterBackdrop');
    const closeBtn = document.getElementById('filterClose');
    const clearBtn = document.getElementById('filterClear');
    const traitsEl = modal.querySelector('.filter__traits');

    buildFilterTraits(traitsEl);

    function openFilter()  {
        modal.classList.add('filter--open');
        backdrop.classList.add('filter-backdrop--open');
    }
    function closeFilter() {
        modal.classList.remove('filter--open');
        backdrop.classList.remove('filter-backdrop--open');
    }

    openBtnEl?.addEventListener('click', openFilter);
    closeBtn.addEventListener('click', closeFilter);
    backdrop.addEventListener('click', closeFilter);
    clearBtn.addEventListener('click', () => {
        traitsEl.querySelectorAll('.filter__trait--active')
                .forEach(el => el.classList.remove('filter__trait--active'));
        dispatchFilterChange();
    });
}

// Playground self-init
if (document.getElementById('openFilter')) {
    document.addEventListener('DOMContentLoaded', () =>
        initFilter(document.getElementById('openFilter'))
    );
}
