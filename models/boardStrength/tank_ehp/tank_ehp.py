"""
Tank EHP Calculator — batch mode from tank_units.json

Formula
-------
  res_multiplier  = 1 + resistances / 100
  mana_generated  = 5 * 25 * atk_spd
                  + 0.01 * (hp + resistances / 100)
                  + 0.03 * hp
  ability_casts   = (starting_mana + mana_generated) / mana_cost

  heal_shield_ehp = (hp + casts * heal_shield_per_cast) * res_multiplier
  stun_ehp        = ASSUMED_DPS * casts * stun_duration
  dur_pct_ehp     = ASSUMED_DPS * (flat / 100) * casts * duration        [% Durability]
  resist_buff_ehp = ASSUMED_DPS * (flat / (100 + resistances)) * casts * duration
                                                                          [flat Armor+MR buff]
  passive_ehp     = flat_per_s * COMBAT_DURATION * res_multiplier         [continuous self-heal]

  EHP = heal_shield_ehp + stun_ehp + dur_pct_ehp + resist_buff_ehp + passive_ehp

Assumptions
-----------
  ASSUMED_DPS     = 500   (mixed incoming DPS, used to price durability / stun seconds)
  COMBAT_DURATION = 25 s  (used only for continuous passive healing, e.g. Swain)

Durability / resist notes
-------------------------
  "% Durability"  entries (type: durability) use dur_pct_ehp.
  Flat Armor+MR buffs (type: resist_buff) use resist_buff_ehp.
    The effective damage-reduction fraction of gaining R flat resists on top of base B
    is R / (100 + B), applied to both armor and MR, so ASSUMED_DPS is not doubled.
  Flat per-instance DR (Leona) and conditional HP-per-takedown (Sion) are excluded.
  Passive heals that target allies (Kobuko's Yuumi) are excluded.
"""

import csv
import json
from pathlib import Path

ASSUMED_DPS     = 500
COMBAT_DURATION = 25  # seconds

STAR_LABELS = ["1★", "2★", "3★"]


def _flat(val_list, star_idx):
    """Return val_list[star_idx], or 0 if None / missing."""
    if not val_list:
        return 0
    v = val_list[star_idx]
    return v if v is not None else 0


def calc_ehp(data, star_idx):
    hp           = data["health"][star_idx]
    resistances  = data["resists"]["armor"]   # armor == mr for all tank units
    atk_spd      = data["atk_spd"]
    starting_mana = data["starting_mana"]
    mana_cost    = data["mana_cost"]

    res_mult = 1 + resistances / 100
    mana_gen = (
        5 * 25 * atk_spd
        + 0.01 * (hp + resistances / 100)
        + 0.03 * hp
    )
    casts = (starting_mana + mana_gen) / mana_cost

    values = data.get("ability", {}).get("values", {})

    # ── Heal + Shield ────────────────────────────────────────────────────────
    heal_shield = 0
    for atype in ("heal", "shield"):
        if atype not in values:
            continue
        v = values[atype]
        flat = _flat(v.get("flat"), star_idx)
        if v.get("per_second") and v.get("duration"):
            flat *= _flat(v["duration"], star_idx)
        if v.get("hits"):
            flat *= v["hits"]
        heal_shield += flat

    # ── Stun ─────────────────────────────────────────────────────────────────
    stun_dur = 0
    if "stun" in values:
        stun_dur = _flat(values["stun"].get("duration"), star_idx)

    # ── Durability (% damage reduction) ──────────────────────────────────────
    dur_ehp = 0
    if "durability" in values:
        d    = values["durability"]
        flat = _flat(d.get("flat"), star_idx)
        dur_list = d.get("duration")
        if flat and dur_list:
            dur = _flat(dur_list, star_idx)
            dur_ehp = ASSUMED_DPS * (flat / 100) * casts * dur

    # ── Resist Buff (flat Armor+MR gain) ─────────────────────────────────────
    resist_ehp = 0
    if "resist_buff" in values:
        r    = values["resist_buff"]
        flat = _flat(r.get("flat"), star_idx)
        dur_list = r.get("duration")
        if flat and dur_list:
            dur = _flat(dur_list, star_idx)
            # R flat resists on top of base B → effective DR fraction = R / (100 + B)
            resist_ehp = ASSUMED_DPS * (flat / (100 + resistances)) * casts * dur

    # ── Passive continuous healing (self only) ───────────────────────────────
    passive_ehp = 0
    if "passive_healing" in values:
        p    = values["passive_healing"]
        flat = _flat(p.get("flat"), star_idx)
        note = p.get("note", "")
        heals_self = flat and p.get("per_second") and "ally" not in note.lower() and "lowest" not in note.lower()
        if heals_self:
            passive_ehp = flat * COMBAT_DURATION * res_mult

    ehp = (
        (hp + casts * heal_shield) * res_mult
        + ASSUMED_DPS * casts * stun_dur
        + dur_ehp
        + resist_ehp
        + passive_ehp
    )
    return round(ehp)


def main():
    base      = Path(__file__).parent
    json_path = base / "tank_units.json"
    csv_path  = base / "tank_ehp.csv"

    with open(json_path, encoding="utf-8") as f:
        raw = json.load(f)

    units = {name: data for name, data in raw.items() if name != "_schema"}

    rows = []
    for name, data in units.items():
        cost = data["cost"]
        for star_idx, label in enumerate(STAR_LABELS):
            ehp = calc_ehp(data, star_idx)
            rows.append((cost, name, label, ehp))

    rows.sort(key=lambda r: (r[0], r[1]))

    base_ehp = min(ehp for cost, name, label, ehp in rows if cost == 1 and label == "1★")

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Cost", "Name", "Star", "EHP", "Norm EHP"])
        for cost, name, label, ehp in rows:
            writer.writerow([cost, name, label, ehp, round(ehp / base_ehp, 2)])

    print(f"Wrote {len(rows)} rows to {csv_path}")

    # ── Averaged CSV ─────────────────────────────────────────────────────────
    avg_csv_path = base / "tank_ehp_avg.csv"

    from collections import defaultdict
    groups = defaultdict(list)
    for cost, name, label, ehp in rows:
        groups[(cost, label)].append(ehp)

    def remove_outliers(vals):
        if len(vals) < 4:
            return vals
        s = sorted(vals)
        n = len(s)
        q1 = s[n // 4]
        q3 = s[(3 * n) // 4]
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        return [v for v in s if lo <= v <= hi] or vals

    avg_rows = [
        (cost, label, round(sum(clean := remove_outliers(vals)) / len(clean)))
        for (cost, label), vals in groups.items()
    ]
    avg_rows.sort(key=lambda r: (r[0], STAR_LABELS.index(r[1])))

    avg_base = next(avg for cost, label, avg in avg_rows if cost == 1 and label == "1★")

    with open(avg_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Cost", "Star", "Avg EHP", "Norm EHP"])
        for cost, label, avg in avg_rows:
            writer.writerow([cost, label, avg, round(avg / avg_base, 2)])

    print(f"Wrote {len(avg_rows)} rows to {avg_csv_path}")


if __name__ == "__main__":
    main()
