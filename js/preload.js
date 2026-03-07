import { pool, traits } from './tables.js';

const _preloaded = Object.values(pool).map(champ => {
    const img = new Image();
    img.src = champ.tile;
    return img;
});

const _preloadedTraits = Object.values(traits).map(trait => {
    const img = new Image();
    img.src = trait.icon;
    return img;
});
