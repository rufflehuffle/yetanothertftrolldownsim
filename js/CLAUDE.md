## tables.js Reference

File: `js/tables.js` — 1303 lines. Use `offset`/`limit` to avoid loading the full 60 KB.

### Line Ranges
| Object        | Lines     | Description                   |
|---------------|-----------|-------------------------------|
| `pool`        | 1–1231    | 103 champion objects          |
| `traits`      | 1232–1281 | 50+ trait objects             |
| `shop_odds`   | 1283–1293 | Level 2–10 shop probabilities |
| `xp_to_level` | 1295–1303 | XP required per level         |

### Champion Schema (pool)
Each of 103 champions follows this exact structure — do not read the file to discover fields:
```js
{
  unlocked: bool,
  cost: 1|2|3|4|5,
  name: string,
  teamPlannerCode: number,   // ~range 1–840
  copies_in_pool: number,    // usually 30
  synergies: string[],       // trait names
  tile: string,              // ddragon CDN URL (see pattern)
  icon: string,              // metatft CDN URL (see pattern)
  role: string,              // e.g. Caster, Tank, Assassin, Marksman
  damageType: 'Magic'|'Attack'
}
```
URL patterns (never read file just for these):
- tile: `https://ddragon.leagueoflegends.com/cdn/16.4.1/img/tft-champion/TFT16_{Name}_splash_centered_0.TFT_Set16.png`
- icon: `https://cdn.metatft.com/file/metatft/champions/tft16_{name_lowercase}.png`

### Trait Schema (traits)
```js
{ icon: string, breakpoints: number[], breakpoint_tiers: string[] }
```

### Read Guidance
- Find a champion: `Grep pattern="ChampionName" path="js/tables.js"`
- Read only traits: `Read js/tables.js offset=1232 limit=50`
- Read shop_odds / xp_to_level: `Read js/tables.js offset=1283`
- Full read only when adding/removing champions or doing bulk edits
