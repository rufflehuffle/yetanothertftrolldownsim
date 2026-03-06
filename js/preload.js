import { pool } from './tables.js';

const _preloaded = Object.values(pool).map(champ => {
    const img = new Image();
    img.src = champ.tile;
    return img;
});
