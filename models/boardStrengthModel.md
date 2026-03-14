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
