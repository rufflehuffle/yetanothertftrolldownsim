import { pool, traits } from './tables.js';

const _preloaded = Object.values(pool).map(champ => {
    if (!champ.tile) return null;
    const img = new Image();
    img.src = champ.tile;
    return img;
});

const _preloadedTraits = Object.values(traits).map(trait => {
    if (!trait.icon) return null;
    const img = new Image();
    img.src = trait.icon;
    return img;
});
