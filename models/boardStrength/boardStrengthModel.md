# Board Strength Model

A metric that approximates board strength. Boards with higher board strength beat other boards on average.

$$\text{Board Strength} \propto \sum \text{Tank EHP} \times \sum \text{DPS}$$

---

## Tank EHP

### Core Formula

$$\text{EHP} = (\text{HP} + \text{casts} \times \text{heal\_shield}) \times \text{res\_mult} + \text{DPS} \times \text{casts} \times \text{stun\_dur} + \text{dur\_ehp} + \text{passive\_ehp}$$

Where:

$$\text{res\_mult} = 1 + \frac{\text{resistances}}{100}$$

$$\text{mana\_gen} = 5 \times 25 \times \text{atk\_spd} + 0.01 \times \left(\text{HP} + \frac{\text{resistances}}{100}\right) + 0.03 \times \text{HP}$$

$$\text{casts} = \frac{\text{starting\_mana} + \text{mana\_gen}}{\text{mana\_cost}}$$

### Ability Type Handling

| Ability Type | Contribution | Notes |
|---|---|---|
| `heal` (flat) | `heal_shield += flat` | Added to HP before applying res\_mult |
| `heal` (per\_second) | `heal_shield += flat × duration` | Total heal over ability duration |
| `heal` (per\_hit) | `heal_shield += flat × hits` | Multiplied by hit count per cast |
| `shield` (flat) | `heal_shield += flat` | Treated as equivalent HP for EHP |
| `durability` (% Durability) | `dur_ehp += DPS × (flat/100) × casts × duration` | % incoming damage negated |
| `resist_buff` (flat Armor+MR) | `resist_ehp += DPS × (flat / (100 + base_resists)) × casts × duration` | Effective DR fraction of gaining flat resists on top of base |
| `stun` | `stun_ehp += DPS × casts × duration` | Full incoming DPS nullified during stun |
| `passive_healing` (self, per\_second) | `passive_ehp += flat × COMBAT_DURATION × res_mult` | Continuous self-regen |

### Excluded Effects

| Unit | Excluded Effect | Reason |
|---|---|---|
| Leona | Solar Flare — flat damage reduction per instance | Requires known hit rate; not modelled |
| Sion | Soul Furnace — permanent HP per takedown | Conditional on kills; baseline excluded |
| Kobuko | Yuumi passive heal | Heals the lowest-HP ally, not Kobuko |
| Ornn | Call of the Forge | Pure damage ability; no survivability mechanic |
| Tahm Kench | Spit stun | Duration unspecified in available data |

---

## Assumptions

| Assumption | Value | Justification |
|---|---|---|
| Incoming DPS (for durability / stun pricing) | 500 | Approx. 4-cost 2★ carry with 3 items (e.g. Seraphine ~13k/25s ≈ 520 DPS, Yunara ~10k/25s ≈ 400 DPS, AP Kai'Sa ~7.5k/25s ≈ 300 DPS; 500 used as round mid-estimate excluding shred/sunder) |
| Combat duration (for passive self-healing) | 25 s | Matches assumed combat duration; only affects passive continuous heals (Swain) |
| Resistances | `armor` field only | All tank units have armor == MR; either value is equivalent |
| Item multiplier | Excluded | Base EHP only; items applied separately if needed |
| Outlier removal (averages) | IQR × 1.5 | Groups with < 4 units skip removal (5-cost: only 3 units) |
| Norm EHP baseline (per-unit table) | Illaoi 1★ = 1,479 | Lowest EHP among 1-cost 1★ tanks |
| Norm EHP baseline (average table) | Avg 1-cost 1★ = 1,562 | Average EHP across all 1-cost 1★ tanks |

---

## Tank EHP — Average by Cost

Outliers removed per group using IQR × 1.5. Normalized to average 1-cost 1★ EHP (1,562).

| Cost | Star | Avg EHP | Norm EHP |
|------|------|---------|----------|
| 1 | 1★ | 1562 | 1.0 |
| 1 | 2★ | 2616 | 1.67 |
| 1 | 3★ | 4528 | 2.9 |
| 2 | 1★ | 2328 | 1.49 |
| 2 | 2★ | 3732 | 2.39 |
| 2 | 3★ | 6434 | 4.12 |
| 3 | 1★ | 2936 | 1.88 |
| 3 | 2★ | 4768 | 3.05 |
| 3 | 3★ | 7949 | 5.09 |
| 4 | 1★ | 4274 | 2.74 |
| 4 | 2★ | 7244 | 4.64 |
| 4 | 3★ | 22659 | 14.51 |
| 5 | 1★ | 2253 | 1.44 |
| 5 | 2★ | 3759 | 2.41 |
| 5 | 3★ | 8195 | 5.25 |

> **Note:** 4-cost 3★ average remains high even after outlier removal due to the breakpoint scaling of units like Wukong, Nasus, Skarner, and Taric at 3★. 5-cost units trend lower than 4-cost because Ornn and Tahm Kench have minimal ability-based survivability; their cost premium is not reflected in raw EHP.

---

## Tank EHP — Per Unit

Normalized to the lowest 1-cost 1★ EHP: Illaoi 1★ = 1,479.

| Cost | Name | Star | EHP | Norm EHP |
|------|------|------|-----|----------|
| 1 | Blitzcrank | 1★ | 1816 | 1.23 |
| 1 | Blitzcrank | 2★ | 2911 | 1.97 |
| 1 | Blitzcrank | 3★ | 4931 | 3.33 |
| 1 | Illaoi | 1★ | 1479 | 1.0 |
| 1 | Illaoi | 2★ | 2524 | 1.71 |
| 1 | Illaoi | 3★ | 4440 | 3.0 |
| 1 | Jarvan IV | 1★ | 1632 | 1.1 |
| 1 | Jarvan IV | 2★ | 2689 | 1.82 |
| 1 | Jarvan IV | 3★ | 4545 | 3.07 |
| 1 | Rumble | 1★ | 1617 | 1.09 |
| 1 | Rumble | 2★ | 2669 | 1.8 |
| 1 | Rumble | 3★ | 4615 | 3.12 |
| 1 | Shen | 1★ | 1522 | 1.03 |
| 1 | Shen | 2★ | 2581 | 1.75 |
| 1 | Shen | 3★ | 4510 | 3.05 |
| 2 | Cho'Gath | 1★ | 2782 | 1.88 |
| 2 | Cho'Gath | 2★ | 4115 | 2.78 |
| 2 | Cho'Gath | 3★ | 6988 | 4.72 |
| 2 | Neeko | 1★ | 2339 | 1.58 |
| 2 | Neeko | 2★ | 3821 | 2.58 |
| 2 | Neeko | 3★ | 6672 | 4.51 |
| 2 | Poppy | 1★ | 2198 | 1.49 |
| 2 | Poppy | 2★ | 3621 | 2.45 |
| 2 | Poppy | 3★ | 6147 | 4.16 |
| 2 | Sion | 1★ | 1338 | 0.9 |
| 2 | Sion | 2★ | 2267 | 1.53 |
| 2 | Sion | 3★ | 3970 | 2.68 |
| 2 | Xin Zhao | 1★ | 3478 | 2.35 |
| 2 | Xin Zhao | 2★ | 5324 | 3.6 |
| 2 | Xin Zhao | 3★ | 8770 | 5.93 |
| 2 | Yorick | 1★ | 1832 | 1.24 |
| 2 | Yorick | 2★ | 3242 | 2.19 |
| 2 | Yorick | 3★ | 5928 | 4.01 |
| 3 | Darius | 1★ | 2443 | 1.65 |
| 3 | Darius | 2★ | 4434 | 3.0 |
| 3 | Darius | 3★ | 8683 | 5.87 |
| 3 | Dr. Mundo | 1★ | 2932 | 1.98 |
| 3 | Dr. Mundo | 2★ | 5785 | 3.91 |
| 3 | Dr. Mundo | 3★ | 12160 | 8.22 |
| 3 | Kennen | 1★ | 3822 | 2.58 |
| 3 | Kennen | 2★ | 5541 | 3.75 |
| 3 | Kennen | 3★ | 8875 | 6.0 |
| 3 | Kobuko | 1★ | 2156 | 1.46 |
| 3 | Kobuko | 2★ | 3897 | 2.63 |
| 3 | Kobuko | 3★ | 7230 | 4.89 |
| 3 | Leona | 1★ | 2397 | 1.62 |
| 3 | Leona | 2★ | 3810 | 2.58 |
| 3 | Leona | 3★ | 6354 | 4.3 |
| 3 | Loris | 1★ | 3615 | 2.44 |
| 3 | Loris | 2★ | 5347 | 3.62 |
| 3 | Loris | 3★ | 8687 | 5.87 |
| 3 | Nautilus | 1★ | 2344 | 1.58 |
| 3 | Nautilus | 2★ | 3834 | 2.59 |
| 3 | Nautilus | 3★ | 6629 | 4.48 |
| 3 | Sejuani | 1★ | 3780 | 2.56 |
| 3 | Sejuani | 2★ | 5492 | 3.71 |
| 3 | Sejuani | 3★ | 9188 | 6.21 |
| 4 | Braum | 1★ | 3837 | 2.59 |
| 4 | Braum | 2★ | 5775 | 3.9 |
| 4 | Braum | 3★ | 11201 | 7.57 |
| 4 | Garen | 1★ | 3706 | 2.51 |
| 4 | Garen | 2★ | 6018 | 4.07 |
| 4 | Garen | 3★ | 14296 | 9.67 |
| 4 | Nasus | 1★ | 5912 | 4.0 |
| 4 | Nasus | 2★ | 9914 | 6.7 |
| 4 | Nasus | 3★ | 31955 | 21.61 |
| 4 | Rift Herald | 1★ | 3163 | 2.14 |
| 4 | Rift Herald | 2★ | 5190 | 3.51 |
| 4 | Rift Herald | 3★ | 16361 | 11.06 |
| 4 | Singed | 1★ | 2329 | 1.57 |
| 4 | Singed | 2★ | 5798 | 3.92 |
| 4 | Singed | 3★ | 18500 | 12.51 |
| 4 | Skarner | 1★ | 5709 | 3.86 |
| 4 | Skarner | 2★ | 9307 | 6.29 |
| 4 | Skarner | 3★ | 32182 | 21.76 |
| 4 | Swain | 1★ | 4179 | 2.83 |
| 4 | Swain | 2★ | 6708 | 4.54 |
| 4 | Swain | 3★ | 19683 | 13.31 |
| 4 | Taric | 1★ | 4759 | 3.22 |
| 4 | Taric | 2★ | 9180 | 6.21 |
| 4 | Taric | 3★ | 33695 | 22.78 |
| 4 | Wukong | 1★ | 4873 | 3.29 |
| 4 | Wukong | 2★ | 7306 | 4.94 |
| 4 | Wukong | 3★ | 26055 | 17.62 |
| 5 | Galio | 1★ | 3268 | 2.21 |
| 5 | Galio | 2★ | 5259 | 3.56 |
| 5 | Galio | 3★ | 14014 | 9.48 |
| 5 | Ornn | 1★ | 1395 | 0.94 |
| 5 | Ornn | 2★ | 2511 | 1.7 |
| 5 | Ornn | 3★ | 4520 | 3.06 |
| 5 | Tahm Kench | 1★ | 2095 | 1.42 |
| 5 | Tahm Kench | 2★ | 3508 | 2.37 |
| 5 | Tahm Kench | 3★ | 6052 | 4.09 |

## DPS

Simulated via `dps/dps_sim.py` using a discrete time-step (10 ms) over a fixed 25 s combat window against a single dummy target with 100 Armor and 100 Magic Resist.

### Simulation Parameters & Assumptions

| Parameter | Value | Notes |
|---|---|---|
| Combat duration | 25 s | Fixed window; DoT damage is capped at time remaining |
| Dummy Armor | 100 | Physical damage multiplied by 100/200 = 0.5 |
| Dummy Magic Resist | 100 | Magic damage multiplied by 100/200 = 0.5 |
| Time step | 10 ms | Discrete simulation; sub-10 ms timing effects are ignored |
| Mana per auto (caster) | 7 | Flat per-auto mana gain for caster-role units |
| Mana regen (caster) | 2 / s | Passive regen; ticks every step, capped at mana_cost |
| Mana per auto (marksman) | 10 | Higher per-auto gain; no passive regen |
| Mana regen (marksman) | 0 / s | Marksmen rely entirely on autos for mana |
| Cast time (caster) | 1 s | Auto timer is frozen during cast animation |
| Cast time (marksman) | 0 s | Abilities are modifiers on autos; no animation freeze |
| Target count | As specified per unit | AOE splash targets encoded in `hits[].targets` |
| Mana cap | = mana\_cost | Mana cannot exceed the cast threshold |

### Shortcuts & Limitations

| Item | Detail |
|---|---|
| Single target assumed for non-AOE units | Multi-target splash counts are hardcoded in unit data, not derived from board state |
| Conditional hits excluded | Zilean's death explosion, Caitlyn's ricochet on kill — these require target HP tracking |
| No items modelled | Base stats only; attack speed, AP, and AD items are excluded |
| No trait bonuses | Freljord, Invoker, etc. are not applied |
| No crowd-control interaction | Stuns cast by DPS units (LeBlanc) are not deducted from enemy DPS |
| No Chill interaction | Anivia's Crit-if-Chilled bonus is not modelled |
| Annie special cast | First cast costs 160 mana (global DoT); subsequent casts cost 20 mana (fireball). Modelled via `first_cast_hits` + `subsequent_mana_cost` fields |
| Ziggs passive bomb | Replaces physical autos with magic-damage bouncing bombs; AD = 0 in unit data |
| **Limited unit pool** | 19 carry/DPS units are included in the simulation (see table below). Notable absences include Jinx, Kai'Sa, and other physical carries. Averages and normalizations reflect only the modelled subset and should be treated as directional rather than exhaustive |

---

### DPS — Average by Cost

Outliers removed per group using IQR × 1.5. Groups with fewer than 4 units skip outlier removal (2-cost has 2 units, so removal is skipped there). Normalized to average 1-cost 1★ DPS (29).

| Cost | Star | Avg DPS | Norm DPS |
|------|------|---------|----------|
| 1 | 1★ | 29 | 1.0 |
| 1 | 2★ | 44 | 1.52 |
| 1 | 3★ | 66 | 2.28 |
| 2 | 1★ | 36 | 1.24 |
| 2 | 2★ | 56 | 1.93 |
| 2 | 3★ | 95 | 3.28 |
| 3 | 1★ | 46 | 1.59 |
| 3 | 2★ | 69 | 2.38 |
| 3 | 3★ | 116 | 4.0 |
| 4 | 1★ | 62 | 2.14 |
| 4 | 2★ | 93 | 3.21 |
| 4 | 3★ | 299 | 10.31 |
| 5 | 1★ | 54 | 1.86 |
| 5 | 2★ | 81 | 2.79 |
| 5 | 3★ | 294 | 10.14 |

> **Note:** 4-cost and 5-cost 3★ averages spike sharply due to breakpoint scaling (e.g. Lissandra 3★ ability damage jumps to 2800/2800, Lux 3★ beam to 1600/900, Ziggs 3★ bomb to 500 passive, Miss Fortune 3★ first wave targets 6 enemies). These 3★ values are not representative of typical combat; they reflect late-game hyperscaling. IQR outlier removal keeps Miss Fortune 3★ out of the 4-cost 3★ average (outlier threshold ≈ 474), bringing it closer to the Lissandra/Lux/Yunara/Seraphine cluster.

---

### DPS — Per Unit

Normalized to the lowest 1-cost 1★ DPS: Kog'Maw 1★ = 22.

| Cost | Name | Star | DPS | Norm DPS | Casts |
|------|------|------|-----|----------|-------|
| 1 | Anivia | 1★ | 36 | 1.64 | 4 |
| 1 | Anivia | 2★ | 51 | 2.32 | 4 |
| 1 | Anivia | 3★ | 74 | 3.36 | 4 |
| 1 | Caitlyn | 1★ | 36 | 1.64 | 2 |
| 1 | Caitlyn | 2★ | 54 | 2.45 | 2 |
| 1 | Caitlyn | 3★ | 83 | 3.77 | 2 |
| 1 | Kog'Maw | 1★ | 22 | 1.0 | 4 |
| 1 | Kog'Maw | 2★ | 32 | 1.45 | 4 |
| 1 | Kog'Maw | 3★ | 49 | 2.23 | 4 |
| 1 | Lulu | 1★ | 27 | 1.23 | 2 |
| 1 | Lulu | 2★ | 41 | 1.86 | 2 |
| 1 | Lulu | 3★ | 61 | 2.77 | 2 |
| 1 | Sona | 1★ | 26 | 1.18 | 4 |
| 1 | Sona | 2★ | 40 | 1.82 | 4 |
| 1 | Sona | 3★ | 61 | 2.77 | 4 |
| 2 | Orianna | 1★ | 28 | 1.27 | 3 |
| 2 | Orianna | 2★ | 42 | 1.91 | 3 |
| 2 | Orianna | 3★ | 71 | 3.23 | 3 |
| 2 | Teemo | 1★ | 45 | 2.05 | 5 |
| 2 | Teemo | 2★ | 70 | 3.18 | 5 |
| 2 | Teemo | 3★ | 119 | 5.41 | 5 |
| 3 | Ahri | 1★ | 51 | 2.32 | 5 |
| 3 | Ahri | 2★ | 77 | 3.5 | 5 |
| 3 | Ahri | 3★ | 134 | 6.09 | 5 |
| 3 | LeBlanc | 1★ | 38 | 1.73 | 2 |
| 3 | LeBlanc | 2★ | 58 | 2.64 | 2 |
| 3 | LeBlanc | 3★ | 99 | 4.5 | 2 |
| 3 | Malzahar | 1★ | 48 | 2.18 | 4 |
| 3 | Malzahar | 2★ | 72 | 3.27 | 4 |
| 3 | Malzahar | 3★ | 124 | 5.64 | 4 |
| 3 | Milio | 1★ | 39 | 1.77 | 2 |
| 3 | Milio | 2★ | 59 | 2.68 | 2 |
| 3 | Milio | 3★ | 92 | 4.18 | 2 |
| 3 | Vayne | 1★ | 54 | 2.45 | 5 |
| 3 | Vayne | 2★ | 81 | 3.68 | 5 |
| 3 | Vayne | 3★ | 130 | 5.91 | 5 |
| 4 | Lissandra | 1★ | 56 | 2.55 | 2 |
| 4 | Lissandra | 2★ | 84 | 3.82 | 2 |
| 4 | Lissandra | 3★ | 359 | 16.32 | 2 |
| 4 | Lux | 1★ | 64 | 2.91 | 3 |
| 4 | Lux | 2★ | 96 | 4.36 | 3 |
| 4 | Lux | 3★ | 334 | 15.18 | 3 |
| 4 | Miss Fortune | 1★ | 92 | 4.18 | 5 |
| 4 | Miss Fortune | 2★ | 138 | 6.27 | 5 |
| 4 | Miss Fortune | 3★ | 1306 | 59.36 | 5 |
| 4 | Seraphine | 1★ | 33 | 1.5 | 7 |
| 4 | Seraphine | 2★ | 50 | 2.27 | 7 |
| 4 | Seraphine | 3★ | 222 | 10.09 | 7 |
| 4 | Yunara | 1★ | 66 | 3.0 | 4 |
| 4 | Yunara | 2★ | 99 | 4.5 | 4 |
| 4 | Yunara | 3★ | 282 | 12.82 | 4 |
| 5 | Annie | 1★ | 28 | 1.27 | 2 |
| 5 | Annie | 2★ | 42 | 1.91 | 2 |
| 5 | Annie | 3★ | 150 | 6.82 | 2 |
| 5 | Kindred | 1★ | 35 | 1.59 | 1 |
| 5 | Kindred | 2★ | 52 | 2.36 | 1 |
| 5 | Kindred | 3★ | 172 | 7.82 | 1 |
| 5 | Ziggs | 1★ | 54 | 2.45 | 1 |
| 5 | Ziggs | 2★ | 87 | 3.95 | 1 |
| 5 | Ziggs | 3★ | 740 | 33.64 | 1 |
| 5 | Zilean | 1★ | 99 | 4.5 | 4 |
| 5 | Zilean | 2★ | 143 | 6.5 | 4 |
| 5 | Zilean | 3★ | 112 | 5.09 | 4 |

> **Zilean 3★ anomaly:** DPS drops from 2★ to 3★ because the death-explosion hit (conditional on target dying) is excluded. At 3★ the death explosion carries most of the expected damage; without it, the Time Bomb DoT alone (1000/s × remaining time) drives the number but less frequently triggers than the excluded conditional. Treat Zilean 3★ DPS as a significant underestimate.
>
> **Ziggs 3★ outlier:** Passive bomb scales to 500 magic damage per auto at 3★ (vs 40/65 at lower stars), producing a massive DPS spike. This represents true breakpoint scaling and is not an artifact of the simulation.
>
> **Annie 1★/2★ underperformance:** Annie's first cast (global DoT, 160 mana cost) is strong but the subsequent fireball casts do low damage at 1★/2★. The simulation does not model the sustained DoT's interaction with enemies dying, so lower-star Annie DPS is somewhat underestimated relative to reality.
>
> **Miss Fortune 3★ spike:** At 3★ the wave count and target count both scale sharply (6 targets per wave, 5 casts in 25 s), producing 1306 DPS — a significant outlier removed by IQR from the 4-cost average. Lower-star Miss Fortune (92/138 DPS) is more representative of practical performance.
>
> **Kindred 1★/2★ underestimate:** The zone lasts only 2.5 s at 1★/2★, yielding ~5 secondary arrows. At 3★ the 99 s zone covers the full combat window, so 3★ DPS is a reasonable upper bound while 1★/2★ values significantly understate reality.

## Items

Items are not individually modelled. Instead, the strongest tank (highest EHP) and strongest carry (highest DPS) each receive a 5× multiplier on their contribution, simulating three full items on each.

## Traits

Trait bonuses are loaded from `traits/trait_strength.json`. Each trait's active breakpoint contributes one or more effects, each pre-converted to either `tank_ehp_pct` or `dps_pct`.

### Active breakpoint

The highest breakpoint threshold that the unit count satisfies is used. Effects do not accumulate across lower breakpoints — only the single highest active breakpoint applies.

Unique traits (one unit = active) use a `"unique"` key instead of a numeric breakpoint.

### Effect schema

```
{ metric, value, scope }
```

| Field    | Values |
|----------|--------|
| `metric` | `"tank_ehp_pct"` \| `"dps_pct"` |
| `value`  | Fractional multiplier — applied as `(1 + value)` |
| `scope`  | `"splash"` \| `"selfish"` \| `"strongest_tank"` \| `"strongest_carry"` \| `"second_strongest_carry"` |

### Scope application order

1. **`splash`** — `(1 + value)` applied to `ehpMult` or `dpsMult` of every unit on the board.
2. **`selfish`** — same, but only for units whose synergy list includes this trait.
3. Units are split into `ehpEntries` (tanks) and `dpsEntries` (carries) and sorted descending by effective value.
4. **`strongest_tank`** — multiplies the top `ehpEntry` by `(1 + value)`.
5. **`strongest_carry`** — multiplies the top `dpsEntry` by `(1 + value)`.
6. **`second_strongest_carry`** — multiplies the second `dpsEntry` by `(1 + value)`.
7. Lists are re-sorted; item 5× multiplier is then applied to the top entries.

### Stacking

Multiple effects on the same unit stack multiplicatively:

```
ehpMult = (1 + effect_A) × (1 + effect_B) × …
```

### Conversion factors

Indirect stats (flat HP, flat Armor/MR, AS%, AP%, AD%) are pre-converted in `trait_strength.json` using the factors below, derived from perturbation simulations at 2★ across all modelled units.

| Stat | Conversion | Source |
|------|-----------|--------|
| +1 flat HP | `× 0.00044389 → tank_ehp_pct` | `tank_ehp/trait_ehp_multipliers.py` |
| +1 Armor or MR | `× 0.00556048 → tank_ehp_pct` | same |
| +1 HP/s regen | `× 0.01109722 → tank_ehp_pct` (= flat_hp × 25 s) | same |
| +1% AS | `× 0.00591229 → dps_pct` | `dps/trait_dps_multipliers.py` |
| +1% AP | `× 0.00585748 → dps_pct` | same |
| +1% AD | `× 0.00393726 → dps_pct` | same |
| `health_pct` / `damage_amp_pct` / `shield_pct_max_hp` | 1 : 1 | direct |
| `durability_pct` (DR fraction `x`) | `1/(1−x) − 1` | exact |
| crit | `avg_auto_phys_frac(0.2936) × C/100 × (0.4 + D/100)` | formula |
