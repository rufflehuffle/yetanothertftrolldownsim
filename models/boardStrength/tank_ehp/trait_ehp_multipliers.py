"""
Trait EHP Multipliers
=====================
Computes per-unit EHP scaling factors (at 2★) for indirect stats used in
trait_strength.json, so those stats can be pre-converted to tank_ehp_pct.

Outputs
-------
  flat_hp_to_ehp_pct       per +1 flat HP  → average EHP% gain across all tank units
  flat_armor_mr_to_ehp_pct per +1 Armor/MR → average EHP% gain across all tank units
  health_regen_to_ehp_pct  per +1 HP/s     → uses flat_hp_to_ehp_pct × 25 s duration

Methodology
-----------
  For each unit at 2★ (star_idx=1), compute base EHP via calc_ehp(), then apply
  a +1 perturbation to the relevant stat and compare the resulting EHP.
  The ratio (delta_ehp / base_ehp) gives the fractional EHP gain per +1 unit.
  Average across all tank units.

  Note: calc_ehp() uses ASSUMED_DPS=500 for durability/stun/resist_buff pricing,
  so the result for HP/armor perturbations does not depend on ASSUMED_DPS.
"""

import json
import copy
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))
from tank_ehp import calc_ehp

STAR_IDX = 1        # 2★ is the primary competitive star level
REGEN_DURATION = 25 # seconds (matches COMBAT_DURATION in tank_ehp.py)


def main():
    base = Path(__file__).parent
    with open(base / "tank_units.json", encoding="utf-8") as f:
        raw = json.load(f)
    units = {name: data for name, data in raw.items() if name != "_schema"}

    hp_pcts    = []
    armor_pcts = []

    header = f"{'Name':15s} {'Cost':4s} {'BaseEHP':8s}  {'+1 HP':>8s}  {'+1 AR/MR':>10s}"
    print(header)
    print("-" * len(header))

    for name, data in sorted(units.items(), key=lambda x: (x[1]["cost"], x[0])):
        base_ehp = calc_ehp(data, STAR_IDX)
        if base_ehp == 0:
            continue

        # +1 flat HP
        d_hp = copy.deepcopy(data)
        d_hp["health"][STAR_IDX] += 1
        boosted_hp = calc_ehp(d_hp, STAR_IDX)
        hp_pct = (boosted_hp - base_ehp) / base_ehp

        # +1 flat Armor (calc_ehp reads only "armor"; armor == mr for all tank units)
        d_ar = copy.deepcopy(data)
        d_ar["resists"]["armor"] += 1
        boosted_ar = calc_ehp(d_ar, STAR_IDX)
        ar_pct = (boosted_ar - base_ehp) / base_ehp

        hp_pcts.append(hp_pct)
        armor_pcts.append(ar_pct)

        print(f"{name:15s} {data['cost']:4d} {base_ehp:8d}  "
              f"{hp_pct*100:+7.4f}%  {ar_pct*100:+9.4f}%")

    avg_hp = sum(hp_pcts)    / len(hp_pcts)
    avg_ar = sum(armor_pcts) / len(armor_pcts)
    avg_regen = avg_hp * REGEN_DURATION   # per +1 HP/s over 25 s combat

    print("-" * len(header))
    print(f"{'AVERAGE':15s} {'':4s} {'':8s}  {avg_hp*100:+7.4f}%  {avg_ar*100:+9.4f}%")
    print()
    print("=== Conversion Factors (2★ average) ===")
    print(f"flat_hp_to_ehp_pct            per +1 HP:    {avg_hp:.8f}  ({avg_hp*100:.5f}%)")
    print(f"flat_armor_mr_to_ehp_pct      per +1 AR/MR: {avg_ar:.8f}  ({avg_ar*100:.5f}%)")
    print(f"health_regen_to_ehp_pct       per +1 HP/s:  {avg_regen:.8f}  ({avg_regen*100:.5f}%)")
    print()
    print("Usage examples:")
    print(f"  +150 flat HP  (Bruiser splash):  {150 * avg_hp * 100:.2f}% EHP")
    print(f"  +200 flat HP  (Void selfish):    {200 * avg_hp * 100:.2f}% EHP")
    print(f"  +350 flat HP  (Ornn 1★ per item):{350 * avg_hp * 100:.2f}% EHP")
    print(f"  +12  AR/MR    (Defender splash): {12  * avg_ar * 100:.2f}% EHP")
    print(f"  +30  AR/MR    (Defender self):   {30  * avg_ar * 100:.2f}% EHP")
    print(f"  +55  AR/MR    (Defender self 4): {55  * avg_ar * 100:.2f}% EHP")
    print(f"  +80  AR/MR    (Defender self 6): {80  * avg_ar * 100:.2f}% EHP")
    print(f"  +100 AR/MR    (Void selfish):    {100 * avg_ar * 100:.2f}% EHP")
    print(f"  +150 AR/MR    (Void selfish 6):  {150 * avg_ar * 100:.2f}% EHP")
    print(f"  +12  AR/MR    (Demacia self 3):  {12  * avg_ar * 100:.2f}% EHP")
    print(f"  +35  AR/MR    (Demacia self 5-7):{35  * avg_ar * 100:.2f}% EHP")
    print(f"  +150 AR/MR    (Demacia self 11): {150 * avg_ar * 100:.2f}% EHP")
    print(f"  +50  AR/MR    (Shurima self 3/4):{50  * avg_ar * 100:.2f}% EHP")
    print(f"  +20  HP/s     (Shurima):         {20  * avg_regen * 100:.2f}% EHP")

    return {
        "flat_hp_to_ehp_pct":      round(avg_hp, 8),
        "flat_armor_mr_to_ehp_pct": round(avg_ar, 8),
        "health_regen_to_ehp_pct": round(avg_regen, 8),
    }


if __name__ == "__main__":
    main()
