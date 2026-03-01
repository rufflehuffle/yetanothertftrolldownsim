import { pool, traits as traitTable, xp_to_level } from './tables.js';
import { shop_odds } from './tables.js';
import { state } from './state.js';
import { boardCount, isChampAnywhere } from './logic.js';

// ============================================================
// Display helpers
// ============================================================
export function starsText(stars) {
    return '★'.repeat(stars);
}

export function starColor(stars) {
    if (stars === 3) return '#f0c040';
    if (stars === 2) return '#a0c4ff';
    return '#d1d5db';
}

export function costColor(cost) {
    switch (cost) {
        case 1: return '#162431';
        case 2: return '#10572C';
        case 3: return '#1D5079';
        case 4: return '#8F0A6B';
        case 5: return '#C48217';
        case 7: return '#C48217';
        default: return '#444';
    }
}

// ============================================================
// Trait computation
// ============================================================
export function computeTraits() {
    const boardChampNames = new Set(
        Object.values(state.board).filter(u => u !== null).map(u => u.name)
    );
    const traitCounts = {};
    const traitUnits  = {};
    for (const name of boardChampNames) {
        const champ = pool[name];
        if (!champ) continue;
        for (const syn of champ.synergies) {
            traitCounts[syn] = (traitCounts[syn] ?? 0) + 1;
            if (!traitUnits[syn]) traitUnits[syn] = [];
            traitUnits[syn].push(name);
        }
    }
    return { traitCounts, traitUnits };
}

function activeBreakpoint(traitName, count) {
    const bp = traitTable[traitName]?.breakpoints ?? [];
    let active = 0;
    for (const b of bp) {
        if (count >= b) active = b;
    }
    return active;
}

function nextBreakpoint(traitName, count) {
    const bp = traitTable[traitName]?.breakpoints ?? [];
    for (const b of bp) {
        if (b > count) return b;
    }
    return null;
}

// ============================================================
// Trait panel render
// ============================================================
const traitPanel   = document.querySelector('.trait-panel');
const traitTooltip = document.querySelector('.trait-tooltip');

function positionTooltip(e) {
    const tw = traitTooltip.offsetWidth;
    const th = traitTooltip.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - 14;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - 14;
    traitTooltip.style.left = `${x}px`;
    traitTooltip.style.top  = `${y}px`;
}

function showTraitTooltip(e, traitName, count, activeBP) {
    const lines = [];
    if (activeBP > 0) {
        lines.push(`<span class="tt-active">✦ ${traitName} (${activeBP} active)</span>`);
    } else {
        lines.push(`<span class="tt-name">${traitName}</span>`);
    }
    lines.push('<hr class="tt-divider">');

    const allTraitUnits = Object.values(pool)
        .filter(c => c.synergies.includes(traitName))
        .sort((a, b) => a.cost !== b.cost ? a.cost - b.cost : a.name.localeCompare(b.name));

    const onBoard = new Set(
        Object.values(state.board).filter(u => u !== null).map(u => u.name)
    );

    lines.push('<div class="tt-unit-grid">');
    for (const champ of allTraitUnits) {
        const active = onBoard.has(champ.name);
        lines.push(`
            <div class="tt-unit-icon${active ? '' : ' tt-unit-inactive'}" title="${champ.name}">
                <img src="${champ.icon}" alt="${champ.name}">
                <span class="tt-unit-name">${champ.name}</span>
            </div>
        `);
    }
    lines.push('</div>');

    traitTooltip.innerHTML = lines.join('');
    traitTooltip.style.display = 'block';
    positionTooltip(e);
}

export function renderTraits() {
    const { traitCounts } = computeTraits();
    const entries = Object.entries(traitCounts).sort((a, b) => {
        const aActive = activeBreakpoint(a[0], a[1]) > 0;
        const bActive = activeBreakpoint(b[0], b[1]) > 0;
        if (aActive !== bActive) return bActive - aActive;
        return b[1] - a[1];
    });

    traitPanel.innerHTML = '';

    for (const [traitName, count] of entries.slice(0, 8)) {
        const traitData = traitTable[traitName];
        if (!traitData) continue;
        const activeBP = activeBreakpoint(traitName, count);
        const nextBP   = nextBreakpoint(traitName, count);
        const isActive = activeBP > 0;
        const bps      = traitData.breakpoints ?? [];

        const row = document.createElement('div');
        row.className = 'trait-row' + (isActive ? ' trait-active' : '');

        const iconWrap = document.createElement('div');
        iconWrap.className = 'trait-icon-wrap' + (isActive ? ' trait-icon-active' : '');
        const img = document.createElement('img');
        img.src = traitData.icon;
        img.alt = traitName;
        iconWrap.appendChild(img);
        row.appendChild(iconWrap);

        const info = document.createElement('div');
        info.className = 'trait-info';
        const countEl = document.createElement('span');
        countEl.className = 'trait-count';
        countEl.textContent = count;
        info.appendChild(countEl);
        const nameEl = document.createElement('span');
        nameEl.className = 'trait-name';
        nameEl.textContent = traitName;
        info.appendChild(nameEl);
        row.appendChild(info);

        if (bps.length > 0) {
            const pips = document.createElement('div');
            pips.className = 'trait-pips';
            for (const bp of bps) {
                const pip = document.createElement('span');
                pip.className = 'trait-pip' +
                    (count >= bp ? ' pip-active' : '') +
                    (bp === activeBP && isActive ? ' pip-current' : '');
                pip.textContent = bp;
                pips.appendChild(pip);
            }
            row.appendChild(pips);
        }

        row.addEventListener('mouseenter', (e) => showTraitTooltip(e, traitName, count, activeBP));
        row.addEventListener('mousemove', positionTooltip);
        row.addEventListener('mouseleave', () => { traitTooltip.style.display = 'none'; });

        traitPanel.appendChild(row);
    }
}

function renderUnit(slot, unit) {
    const champ = unit ? pool[unit.name] : null;
    slot.style.backgroundImage = champ ? `url(${champ.icon})` : 'none';
    const wrapper = slot.parentElement;
    wrapper.classList.toggle('has-unit', !!unit);
    const indicator = wrapper.querySelector('.star-indicator');
    indicator.textContent = unit ? starsText(unit.stars) : '';
    indicator.style.color = unit ? starColor(unit.stars) : '';
}

function updateStarIndicator(el, copyCount, copiesInShop=1, isBenchFull=false, isUnitAnywhere=true) {
    let willStar3 = copyCount >= 8;
    let willStar2 = copyCount === 2 || copyCount === 5;
    // Handle full bench star indicators
    if (isBenchFull && isUnitAnywhere) {
        willStar3 = copyCount + copiesInShop >= 9;
        if (copyCount <= 2) {
            willStar2 = copyCount + copiesInShop >= 3;
        } else {
            willStar2 = copyCount + copiesInShop >= 6;
        }
    }
    el.textContent = willStar3 ? '★★★' : willStar2 ? '★★' : '';
    el.style.color = willStar3 ? '#f0c040' : willStar2 ? '#a0c4ff' : '';
    return { willStar2, willStar3 };
}

// Helpers

function renderShopSlot(slot, champName) {
    const champ = champName ? pool[champName] : null;
    const img = slot.querySelector('.champ-img');
    const barEl = slot.querySelector('.shop-slot-bar');
    const nameEl = slot.querySelector('.shop-slot-name');
    const costEl = slot.querySelector('.shop-slot-cost');
    slot.dataset.champName = champName ?? '';

    slot.querySelector('.team-plan-badge')?.remove();
    slot.querySelectorAll('.shop-slot-trait')?.forEach((x) => x.remove());
    costEl.style.setProperty('--before-display', 'none');

    if (champ) {
        img.src = champ.tile;
        img.alt = champ.name;
        img.style.display = 'block';
        const color = costColor(champ.cost);
        slot.style.borderColor = color;
        barEl.style.backgroundColor = color;
        nameEl.textContent = champ.name;
        costEl.textContent = champ.cost;
        costEl.style.setProperty('--before-display', 'inline-block');

        const traits = pool[champName].synergies;
        traits.forEach((trait, i) => {
            const traitDiv = document.createElement('div');
            traitDiv.className = 'shop-slot-trait';
            traitDiv.style.bottom = `${(traits.length - i - 1) * 28 + 36}px`;

            const traitSymbol = document.createElement('div');
            traitSymbol.className = 'shop-slot-trait-symbol';
            traitSymbol.style.setProperty('--symbol-img', `url(${traitTable[trait].icon})`)
            traitDiv.append(traitSymbol)

            const traitText = document.createElement('div');
            traitText.className = 'shop-slot-trait-text';
            traitText.textContent = trait;
            traitDiv.append(traitText)
            
            slot.appendChild(traitDiv);
        })

        const ownedUnits = [
            ...state.bench.filter(u => u?.name === champName),
            ...Object.values(state.board).filter(u => u?.name === champName)
        ];
        slot.classList.toggle('owned', ownedUnits.length > 0);

        const copyCount = ownedUnits.reduce((sum, u) => sum + (u.stars === 2 ? 3 : u.stars === 3 ? 9 : 1), 0);

        const isBenchFull = state.bench.every(slot => slot !== null);

        // Had to rewrite isChampAnywhere function bc it's broken for some reason?
        const isUnitOnBench = state.bench.filter(u => u?.name == champName).length >= 1;
        const isUnitOnBoard = Object.values(state.board).filter(u => u?.name == champName).length >= 1;
        const isUnitAnywhere = isUnitOnBench || isUnitOnBoard;
        const copiesInShop = state.shop.filter(u => u == champName).length;

        const { willStar2, willStar3 } = updateStarIndicator(slot.querySelector('.shop-star-indicator'), copyCount, copiesInShop, isBenchFull, isUnitAnywhere);
        slot.classList.toggle('star-up-2', willStar2);
        slot.classList.toggle('star-up-3', willStar3);

        if (state.teamPlan.has(champName)) {
            const badge = document.createElement('div');
            badge.className = 'team-plan-badge';
            slot.querySelector('.shop-slot-clip').appendChild(badge);
        }

        if (champ.cost > state.gold) { 
            slot.style.filter = "grayscale(100%)";
        } else {
            slot.style.filter = "";
        }
    } else {
        slot.querySelector('.shop-star-indicator').textContent = '';
        slot.style.borderColor = '#444';
        barEl.style.backgroundColor = '';
        [nameEl, costEl].forEach(el => el.textContent = '');
        img.style.display = 'none';
        slot.classList.remove('owned', 'star-up-2', 'star-up-3');
    }
}

function renderXpBar() {
    const maxXp = xp_to_level[state.level];
    const xpFill = document.querySelector('.xp-bar-fill');
    const xpText = document.querySelector('.xp-bar-text');
    const levelDisplay = document.querySelector('.level-display');
    if (levelDisplay) levelDisplay.textContent = `Lvl ${state.level}`;
    if (xpFill && xpText) {
        if (state.level >= 10 || maxXp == null) {
            xpFill.style.width = '100%';
            xpText.textContent = 'MAX';
        } else {
            xpFill.style.width = `${Math.min(100, (state.xp / maxXp) * 100)}%`;
            xpText.textContent = `${state.xp} / ${maxXp}`;
        }
    }
}

function renderOdds() {
    const odds = document.querySelectorAll('.odd');
    const display_odds = shop_odds[state.level];
    const symbols = ["•", "●", "▲", "◆", "⬟"]
    odds.forEach((x, i) => {
        x.textContent = `${symbols[i]} ${display_odds[i+1] * 100}%`
    });
}

// ============================================================
// Main render
// ============================================================
export function render() {
    document.querySelector('.gold').textContent = state.gold;

    document.querySelector('select[name="level"]').value = state.level;
    renderXpBar();
    renderOdds();

    const boardCountEl = document.querySelector('.board-count');
    boardCountEl.textContent = `${boardCount()}/${state.level}`;
    boardCountEl.style.color = boardCount() >= state.level ? '#4a4a4a' : '#60a5fa';

    document.querySelectorAll('.shop-slot').forEach((slot, i) => renderShopSlot(slot, state.shop[i]));
    document.querySelectorAll('.bench-slot').forEach((slot, i) => renderUnit(slot, state.bench[i]));
    document.querySelectorAll('.hex').forEach(hex => renderUnit(hex, state.board[[...hex.classList].find(c => c !== 'hex')]));

    renderTraits();
}