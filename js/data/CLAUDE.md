## data/ — Static Game Data (Set 17)

Read-only tables. No app imports. Import directly from individual files.

| File | Export | Contents |
|------|--------|----------|
| `pool.js` | `pool` | 63 champion objects |
| `traits.js` | `traits` | 35 trait objects |
| `shop-odds.js` | `shop_odds` | Level 2–10 shop probabilities |
| `xp.js` | `xp_to_level` | XP required per level |

---

### Champion Schema (`pool`)

Each of 63 champions:
```js
{
  unlocked: bool,
  cost: 1|2|3|4|5,
  name: string,
  teamPlannerCode: number,   // 0 = unknown (Set 17 codes not yet available)
  copies_in_pool: number,    // 30/25/18/10/9 by cost tier
  synergies: string[],       // trait names
  tile: string,              // img/tiles-sm/tft17_{name_lowercase}.jpg
  icon: string,              // img/icons-sm/tft17_{name_lowercase}.jpg
  role: string,              // Tank, Fighter, Caster, Assassin, Marksman, Specialist
  damageType: 'Magic'|'Attack'|'Hybrid'
}
```

### Trait Schema (`traits`)

```js
{
  icon: string,                        // img/traits/{traitslug}.png
  breakpoints: number[],
  breakpoint_tiers: string[],          // 'Bronze'|'Silver'|'Gold'|'Prismatic'|'Legendary'
  description: string,
  breakpoint_descriptions?: string[]
}
```

### shop_odds

Keyed by level (2–10), value is `{ 1: prob, 2: prob, 3: prob, 4: prob, 5: prob }`.

### xp_to_level

Keyed by current level (2–9), value is XP needed to reach the next level.

---

### Read Guidance

- Find a champion: `Grep pattern="ChampionName" path="js/data/pool.js"`
- Read traits only: `Read js/data/traits.js`
- Read economy tables: `Read js/data/shop-odds.js` / `Read js/data/xp.js`
- Full pool read only when adding/removing champions or doing bulk edits
