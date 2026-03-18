## Board Strength Model

`Σ Tank EHP × Σ DPS`. Strongest tank and carry each get a 5× item multiplier. Trait bonuses loaded from `traits/trait_strength.json`: each trait's highest active breakpoint emits one or more `{metric, value, scope}` effects pre-converted to `tank_ehp_pct` or `dps_pct`, applied multiplicatively per scope (`splash` → all units, `selfish` → trait members, `strongest_tank/carry/second_strongest_carry` → targeted). Full methodology in [`boardStrengthModel.md`](boardStrengthModel.md).

### Normalized averages (1-cost 1★ = 1.0)

| Cost | EHP 1★ | EHP 2★ | EHP 3★ | DPS 1★ | DPS 2★ | DPS 3★ |
|------|--------|--------|--------|--------|--------|--------|
| 1 | 1.0 | 1.67 | 2.9 | 1.0 | 1.52 | 2.28 |
| 2 | 1.49 | 2.39 | 4.12 | 1.24 | 1.93 | 3.28 |
| 3 | 1.88 | 3.05 | 5.09 | 1.59 | 2.38 | 4.0 |
| 4 | 2.74 | 4.64 | 14.51 | 2.14 | 3.21 | 10.31 |
| 5 | 1.44 | 2.41 | 5.25 | 1.86 | 2.79 | 10.14 |

4-cost 3★ spikes (EHP: Nasus/Skarner/Taric/Wukong; DPS: Lissandra/Lux/Ziggs) reflect true breakpoint scaling, not model error. 5-cost EHP is below 4-cost because Ornn and Tahm Kench have weak ability-based survivability. Zilean 3★ DPS is a significant underestimate (death-explosion excluded).
