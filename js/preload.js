import { pool } from './data/pool.js';
import { traits } from './data/traits.js';

function preloadImage(href) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'image';
    link.href = href;
    document.head.appendChild(link);
}

Object.values(pool).forEach(champ => {
    if (champ.tile) preloadImage(champ.tile);
    if (champ.icon) preloadImage(champ.icon);
});

Object.values(traits).forEach(trait => {
    if (trait.icon) preloadImage(trait.icon);
});
