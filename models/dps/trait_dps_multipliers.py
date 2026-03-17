"""
Trait DPS Multipliers
=====================
Computes per-unit DPS scaling factors (at 2★) for indirect stats used in
trait_strength.json, so those stats can be pre-converted to dps_pct.

Outputs
-------
  as_pct_to_dps_pct    per +1% AS bonus  → average DPS% gain across all DPS units
  ap_pct_to_dps_pct    per +1% AP bonus  → average DPS% gain (magic dmg scaled by 1+X/100)
  ad_pct_to_dps_pct    per +1% AD bonus  → average DPS% gain (atk_dmg + phys hits scaled)
  avg_auto_phys_frac   fraction of DPS from physical auto attacks (for crit modelling)

Methodology
-----------
  For each unit at 2★, run simulate_unit() with a small +1% perturbation to the
  relevant stat.  The ratio (delta_dps / base_dps) gives the fractional DPS gain
  per +1%.  Average across all DPS units.

  AP scaling: +1 AP = +1% to magic damage.  The sim uses hardcoded magic_dmg values
  that represent output at base 100 AP; +1% AP means multiply all magic-type hits
  by 1.01.  Physical-type and true-type hits are unaffected.

  AD scaling: +1% AD multiplies atk_dmg and physical-type ability hits by 1.01.

  AS scaling: +1% AS multiplies atk_spd by 1.01.

Crit helper
-----------
  avg_auto_phys_frac is computed by zeroing out atk_dmg and comparing to full DPS.
  Together with a target crit_chance (C) and crit_damage_bonus (D), effective DPS%
  from crit can be approximated as:
    crit_dps_pct = auto_phys_frac × [C/100 × (0.4 + D/100)]
  (0.4 = default crit multiplier 1.4 − 1.0 base; each +1% crit damage adds 0.01
   to the multiplier, but only affects the crit portion.)
"""

import json
import copy
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))
import dps_sim as _dps_sim

STAR_IDX = 1    # 2★

# Wrap simulate_unit to return float DPS instead of rounded int.
# The rounding in the original causes +1% perturbations to collapse to 0
# due to discretization, so we need the unrounded value here.
def simulate_unit(data, star_idx):
    dps_int, casts = _dps_sim.simulate_unit(data, star_idx)
    # Re-run without round(): replicate the final line of simulate_unit
    # by calling internal sim and recovering float via total_dmg / COMBAT_DURATION.
    # We do this by temporarily patching the return to skip round().
    # Simplest: just run with +1e-9 perturbation on atk_dmg to force float path
    # and recover via ratio. Instead, we use a 10× perturbation and divide:
    return dps_int, casts  # fallback — replaced by simulate_unit_float below


def simulate_unit_float(data, star_idx):
    """Like simulate_unit but returns float DPS for perturbation accuracy."""
    import copy as _copy
    # We get the float by running the sim twice with ±epsilon atk_dmg boost
    # and using the midpoint.  For pure float: we duplicate the sim core.
    # Simplest: copy dps_sim.simulate_unit with round() removed.
    role_key = _dps_sim._role_key(data.get("role", "caster"))
    mana_pa, mana_regen = _dps_sim.ROLE_MANA[role_key]

    atk_dmg   = data["atk_dmg"][star_idx]
    atk_spd   = data["atk_spd"]
    mana      = float(data["starting_mana"])
    mana_cost = float(data["mana_cost"])
    cast_time = float(data["ability"].get("cast_time",
                      1 if role_key == "caster" else 0))

    subsequent_mana_cost = data["ability"].get("subsequent_mana_cost")
    effective_mana_cost  = mana_cost

    auto_magic_raw     = data["ability"].get("auto_magic_dmg")
    auto_magic_dmg     = auto_magic_raw[star_idx] if auto_magic_raw else 0.0
    auto_magic_targets = data["ability"].get("auto_magic_targets", 1)

    auto_phys_factor  = 100 / (100 + _dps_sim.DUMMY_AR)
    auto_magic_factor = 100 / (100 + _dps_sim.DUMMY_MR)
    auto_cd           = 1.0 / atk_spd

    t             = 0.0
    total_dmg     = 0.0
    time_to_auto  = auto_cd
    casting_until = 0.0
    casts         = 0

    while t < _dps_sim.COMBAT_DURATION:
        t += _dps_sim.DT

        mana = min(mana + mana_regen * _dps_sim.DT, effective_mana_cost)

        if t < casting_until:
            pass
        else:
            time_to_auto -= _dps_sim.DT
            if time_to_auto <= 1e-9:
                total_dmg   += atk_dmg * auto_phys_factor
                total_dmg   += auto_magic_dmg * auto_magic_targets * auto_magic_factor
                mana         = min(mana + mana_pa, effective_mana_cost)
                time_to_auto += auto_cd

        if mana >= effective_mana_cost and t >= casting_until:
            mana          -= effective_mana_cost
            total_dmg     += _dps_sim._cast_dmg(
                                 data, star_idx,
                                 _dps_sim.COMBAT_DURATION - t,
                                 first_cast=(casts == 0))
            casts         += 1
            casting_until  = t + cast_time
            if casts == 1 and subsequent_mana_cost is not None:
                effective_mana_cost = float(subsequent_mana_cost)
                mana = min(mana, effective_mana_cost)

    # Return float DPS (no round)
    return total_dmg / _dps_sim.COMBAT_DURATION, casts


# ── Perturbation helpers ───────────────────────────────────────────────────────

def _boost_as(data, pct):
    """Multiply atk_spd by (1 + pct/100)."""
    d = copy.deepcopy(data)
    d["atk_spd"] = data["atk_spd"] * (1 + pct / 100)
    return d


def _boost_ap(data, pct):
    """Multiply all magic-type damage values by (1 + pct/100).
    Physical and true damage are unaffected (AP does not scale them)."""
    d = copy.deepcopy(data)
    factor = 1 + pct / 100
    ab = d["ability"]
    for key in ("hits", "first_cast_hits"):
        for hit in ab.get(key, []):
            if hit.get("damage_type", "magic") == "magic":
                hit["magic_dmg"] = [v * factor for v in hit["magic_dmg"]]
    if ab.get("auto_magic_dmg"):
        ab["auto_magic_dmg"] = [v * factor for v in ab["auto_magic_dmg"]]
    return d


def _boost_ad(data, pct):
    """Multiply atk_dmg and physical-type ability hits by (1 + pct/100)."""
    d = copy.deepcopy(data)
    factor = 1 + pct / 100
    d["atk_dmg"] = [v * factor for v in data["atk_dmg"]]
    for key in ("hits", "first_cast_hits"):
        for hit in d["ability"].get(key, []):
            if hit.get("damage_type") == "physical":
                hit["magic_dmg"] = [v * factor for v in hit["magic_dmg"]]
    return d


def _zero_auto_phys(data):
    """Zero out atk_dmg to isolate ability + magic-auto DPS."""
    d = copy.deepcopy(data)
    d["atk_dmg"] = [0, 0, 0]
    return d


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    base = Path(__file__).parent
    with open(base / "dps_units.json", encoding="utf-8") as f:
        raw = json.load(f)
    units = {name: data for name, data in raw.items() if name != "_schema"}

    as_deltas   = []
    ap_deltas   = []
    ad_deltas   = []
    auto_fracs  = []

    header = (f"{'Name':15s} {'Cost':4s} {'Role':10s} {'BaseDPS':7s}  "
              f"{'AS+1%':>8s}  {'AP+1%':>8s}  {'AD+1%':>8s}  {'AutoFrac':>9s}")
    print(header)
    print("-" * len(header))

    for name, data in sorted(units.items(), key=lambda x: (x[1]["cost"], x[0])):
        base_dps, _ = simulate_unit_float(data, STAR_IDX)
        if base_dps == 0:
            continue

        as_dps,  _ = simulate_unit_float(_boost_as(data, 1), STAR_IDX)
        ap_dps,  _ = simulate_unit_float(_boost_ap(data, 1), STAR_IDX)
        ad_dps,  _ = simulate_unit_float(_boost_ad(data, 1), STAR_IDX)
        no_auto, _ = simulate_unit_float(_zero_auto_phys(data), STAR_IDX)

        as_pct   = (as_dps  - base_dps) / base_dps * 100
        ap_pct   = (ap_dps  - base_dps) / base_dps * 100
        ad_pct   = (ad_dps  - base_dps) / base_dps * 100
        auto_f   = (base_dps - no_auto)  / base_dps  # fraction from physical autos

        as_deltas.append(as_pct)
        ap_deltas.append(ap_pct)
        ad_deltas.append(ad_pct)
        auto_fracs.append(auto_f)

        print(f"{name:15s} {data['cost']:4d} {data.get('role','?'):10s} {base_dps:7d}  "
              f"{as_pct:+7.3f}%  {ap_pct:+7.3f}%  {ad_pct:+7.3f}%  {auto_f:+8.3f}")

    avg_as   = sum(as_deltas)  / len(as_deltas)
    avg_ap   = sum(ap_deltas)  / len(ap_deltas)
    avg_ad   = sum(ad_deltas)  / len(ad_deltas)
    avg_auto = sum(auto_fracs) / len(auto_fracs)

    print("-" * len(header))
    print(f"{'AVERAGE':15s} {'':4s} {'':10s} {'':7s}  "
          f"{avg_as:+7.3f}%  {avg_ap:+7.3f}%  {avg_ad:+7.3f}%  {avg_auto:+8.3f}")
    print()

    print("=== Conversion Factors (2★ average) ===")
    print(f"as_pct_to_dps_pct    per +1% AS:  {avg_as:.8f}%  ({avg_as/100:.8f})")
    print(f"ap_pct_to_dps_pct    per +1% AP:  {avg_ap:.8f}%  ({avg_ap/100:.8f})")
    print(f"ad_pct_to_dps_pct    per +1% AD:  {avg_ad:.8f}%  ({avg_ad/100:.8f})")
    print(f"avg_auto_phys_frac               {avg_auto:.6f}")
    print()

    # ── Crit formula reference ────────────────────────────────────────────────
    print("=== Crit DPS% Formula ===")
    print("  crit_dps_pct = avg_auto_phys_frac × [crit_chance/100 × (0.4 + crit_dmg_bonus/100)]")
    print("  (0.4 = base crit mult 1.4 – 1.0;  crit_dmg_bonus adds to the crit multiplier)")
    print()
    for label, cc, cd in [
        ("Vanquisher 2", 15, 15),
        ("Vanquisher 3", 20, 20),
        ("Vanquisher 4", 25, 25),
        ("Vanquisher 5", 30, 30),
    ]:
        crit_pct = avg_auto * (cc / 100) * (0.4 + cd / 100) * 100
        print(f"  {label} ({cc}% crit, +{cd}% crit dmg):  {crit_pct:.2f}% DPS")
    print()

    # ── Usage examples ────────────────────────────────────────────────────────
    print("=== Usage Examples ===")
    examples = [
        ("+15%  AS (Quickstriker splash)",     15,  avg_as),
        ("+30%  AS (Quickstriker self mid)",   30,  avg_as),
        ("+60%  AS (Quickstriker self max)",   60,  avg_as),
        ("+90%  AS burst×0.5 (Zaun 3)",       90 * 0.5, avg_as),
        ("+135% AS burst×0.5 (Zaun 7)",       135 * 0.5, avg_as),
        ("+15%  AP (Arcanist splash 2)",       15,  avg_ap),
        ("+20%  AP (Arcanist splash 4)",       20,  avg_ap),
        ("+35%  AP (Arcanist splash 6)",       35,  avg_ap),
        ("+25%  AP (Arcanist self 2)",         25,  avg_ap),
        ("+50%  AP (Arcanist self 4)",         50,  avg_ap),
        ("+70%  AP (Arcanist self 6)",         70,  avg_ap),
        ("+18%  AD+AP (Shadow Isles 2)",       18,  (avg_ap + avg_ad) / 2),
        ("+22%  AD (Gunslinger 2)",            22,  avg_ad),
        ("+40%  AD (Gunslinger 4)",            40,  avg_ad),
    ]
    for label, val, factor in examples:
        print(f"  {label:45s}  {val * factor / 100:.4f}  ({val * factor / 100 * 100:.2f}% DPS)")
    print()

    # ── Mana stats approximation ──────────────────────────────────────────────
    # For mana-related stats (Invoker mana_regen +1/s, mana_gain_amplification),
    # approximate using avg caster cast frequency.
    # +1 mana/s = 25 extra mana in 25s; avg mana cost ≈ 80 → +0.3 extra casts
    # AP fraction of DPS ≈ 1 - avg_auto_phys_frac
    ability_frac = 1 - avg_auto
    approx_mana_regen_dps_pct = (25 / 80) * ability_frac * 100  # +1 mana/s
    approx_mana_gain_25_dps_pct = 0.25 * ability_frac * 100     # +25% mana gain
    approx_mana_gain_40_dps_pct = 0.40 * ability_frac * 100     # +40% mana gain
    print("=== Mana Stat Approximations (caster units only; avg over all applies ~50%) ===")
    print(f"  +1  mana/s (Invoker splash):        ~{approx_mana_regen_dps_pct:.2f}% DPS  "
          f"→ splash half-rate: ~{approx_mana_regen_dps_pct * 0.5:.2f}%")
    print(f"  +25% mana gain (Invoker self 2):    ~{approx_mana_gain_25_dps_pct:.2f}% DPS")
    print(f"  +40% mana gain (Invoker self 4):    ~{approx_mana_gain_40_dps_pct:.2f}% DPS")
    print(f"  Mana cost −10% (Demacia per rally): ~{0.10 * ability_frac * 100:.2f}% DPS (self)")

    return {
        "as_pct_to_dps_pct": round(avg_as / 100, 8),
        "ap_pct_to_dps_pct": round(avg_ap / 100, 8),
        "ad_pct_to_dps_pct": round(avg_ad / 100, 8),
        "avg_auto_phys_frac": round(avg_auto, 6),
    }


if __name__ == "__main__":
    main()
