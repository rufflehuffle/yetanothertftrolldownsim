"""
DPS Simulator — batch mode from dps_units.json

Simulation
----------
  Combat duration : 25 s
  Dummy target    : 100 Armor, 100 Magic Resist
  Time step       : 10 ms

Mana generation by role
-----------------------
  Role        mana/auto   mana/s regen
  --------    ---------   ------------
  caster           7           2
  marksman        10           0

  Caster auto timer is frozen during cast_time; marksman cast_time is 0 (no freeze).
  Mana is capped at mana_cost at all times.

Damage
------
  Auto attack (physical) : AD × 100 / (100 + DUMMY_AR)
  Auto attack (magic)    : auto_magic_dmg × auto_magic_targets × 100 / (100 + DUMMY_MR)
  Ability — damage_type magic    : magic_dmg × targets × 100 / (100 + DUMMY_MR)
  Ability — damage_type physical : magic_dmg × targets × 100 / (100 + DUMMY_AR)
  Ability — damage_type true     : magic_dmg × targets  (no mitigation)
  DoT (per_second=true)  : magic_dmg × min(duration, remaining_time) × targets
  Conditional hits       : excluded (e.g. Zilean death explosion)

Special ability fields
----------------------
  first_cast_hits       : hit array used only on the first cast (e.g. Annie's global DoT)
  subsequent_mana_cost  : mana cost applied after the first cast (e.g. Annie 160 → 20)
  If first_cast_hits is absent, the first cast uses the normal hits array.

Output
------
  dps.csv     — per-unit DPS at each star level, normalized to lowest 1-cost 1★ DPS
  dps_avg.csv — average DPS per (cost, star), normalized to avg 1-cost 1★ DPS
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

COMBAT_DURATION = 25.0   # seconds
DUMMY_AR        = 100
DUMMY_MR        = 100
DT              = 0.01   # simulation time step (seconds)

# Role → (mana_per_auto, mana_regen_per_s)
ROLE_MANA = {
    "caster":    (7,  2.0),
    "marksman":  (10, 0.0),
}

STAR_LABELS = ["1★", "2★", "3★"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _role_key(role_str):
    """Map full role string (e.g. 'Attack Marksman') to sim key."""
    r = role_str.lower()
    if "marksman" in r:
        return "marksman"
    return "caster"


# ── Ability damage ────────────────────────────────────────────────────────────

def _hits_dmg(hits, star_idx, time_remaining):
    """Damage from a list of hit descriptors (post-mitigation vs dummy target)."""
    total = 0.0
    for hit in hits:
        if "magic_dmg" not in hit:
            continue
        note = hit.get("note", "").lower()
        if "conditional" in note:          # skip conditional effects (e.g. death explosion)
            continue

        dmg     = hit["magic_dmg"][star_idx]
        targets = hit.get("targets", 1)

        if hit.get("per_second"):
            dur_list = hit.get("duration")
            dur = dur_list[star_idx] if dur_list else time_remaining
            dmg *= min(dur, time_remaining)

        dmg_type = hit.get("damage_type", "magic")
        if dmg_type == "true":
            factor = 1.0
        elif dmg_type == "physical":
            factor = 100 / (100 + DUMMY_AR)
        else:
            factor = 100 / (100 + DUMMY_MR)

        total += dmg * targets * factor
    return total


def _cast_dmg(data, star_idx, time_remaining, first_cast):
    """Damage dealt by one ability cast, selecting the correct hit array."""
    ability = data["ability"]
    if first_cast and "first_cast_hits" in ability:
        hits = ability["first_cast_hits"]
    else:
        hits = ability.get("hits", [])
    return _hits_dmg(hits, star_idx, time_remaining)


# ── Core simulation ───────────────────────────────────────────────────────────

def simulate_unit(data, star_idx):
    """
    Step through COMBAT_DURATION in DT increments.
    Returns (dps: int, casts: int).
    """
    role_key  = _role_key(data.get("role", "caster"))
    mana_pa, mana_regen = ROLE_MANA[role_key]

    atk_dmg   = data["atk_dmg"][star_idx]
    atk_spd   = data["atk_spd"]
    mana      = float(data["starting_mana"])
    mana_cost = float(data["mana_cost"])
    cast_time = float(data["ability"].get("cast_time", 1 if role_key == "caster" else 0))

    subsequent_mana_cost = data["ability"].get("subsequent_mana_cost")
    effective_mana_cost  = mana_cost

    # Passive magic auto (e.g. Ziggs' bomb)
    auto_magic_raw     = data["ability"].get("auto_magic_dmg")
    auto_magic_dmg     = auto_magic_raw[star_idx] if auto_magic_raw else 0.0
    auto_magic_targets = data["ability"].get("auto_magic_targets", 1)

    auto_phys_factor  = 100 / (100 + DUMMY_AR)
    auto_magic_factor = 100 / (100 + DUMMY_MR)
    auto_cd           = 1.0 / atk_spd

    t             = 0.0
    total_dmg     = 0.0
    time_to_auto  = auto_cd   # first auto fires after one full CD
    casting_until = 0.0
    casts         = 0

    while t < COMBAT_DURATION:
        t += DT

        # Passive mana regen — always ticks, capped at effective mana cost
        mana = min(mana + mana_regen * DT, effective_mana_cost)

        if t < casting_until:
            # Mid-cast: auto timer is frozen (casters only; marksman cast_time=0)
            pass
        else:
            # Tick auto timer
            time_to_auto -= DT
            if time_to_auto <= 1e-9:
                total_dmg   += atk_dmg * auto_phys_factor
                total_dmg   += auto_magic_dmg * auto_magic_targets * auto_magic_factor
                mana         = min(mana + mana_pa, effective_mana_cost)
                time_to_auto += auto_cd

        # Cast when mana full and not currently casting
        if mana >= effective_mana_cost and t >= casting_until:
            mana          -= effective_mana_cost
            total_dmg     += _cast_dmg(data, star_idx, COMBAT_DURATION - t, first_cast=(casts == 0))
            casts         += 1
            casting_until  = t + cast_time
            # Switch to reduced mana cost after first cast if defined
            if casts == 1 and subsequent_mana_cost is not None:
                effective_mana_cost = float(subsequent_mana_cost)
                mana = min(mana, effective_mana_cost)

    dps = total_dmg / COMBAT_DURATION
    return round(dps), casts


# ── Statistics helpers ────────────────────────────────────────────────────────

def remove_outliers(vals):
    if len(vals) < 4:
        return vals
    s  = sorted(vals)
    n  = len(s)
    q1 = s[n // 4]
    q3 = s[(3 * n) // 4]
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return [v for v in s if lo <= v <= hi] or vals


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    base      = Path(__file__).parent
    json_path = base / "dps_units.json"
    csv_path  = base / "dps.csv"
    avg_path  = base / "dps_avg.csv"

    with open(json_path, encoding="utf-8") as f:
        raw = json.load(f)

    units = {name: data for name, data in raw.items() if name != "_schema"}

    # ── Per-unit results ──────────────────────────────────────────────────────
    rows = []
    for name, data in units.items():
        cost = data["cost"]
        for star_idx, label in enumerate(STAR_LABELS):
            dps, casts = simulate_unit(data, star_idx)
            rows.append((cost, name, label, dps, casts))

    rows.sort(key=lambda r: (r[0], r[1]))

    base_dps = min(dps for cost, name, label, dps, _ in rows if cost == 1 and label == "1★")

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Cost", "Name", "Star", "DPS", "Norm DPS", "Casts"])
        for cost, name, label, dps, casts in rows:
            writer.writerow([cost, name, label, dps, round(dps / base_dps, 2), casts])

    print(f"Wrote {len(rows)} rows to {csv_path}")

    # ── Averaged results ──────────────────────────────────────────────────────
    groups = defaultdict(list)
    for cost, name, label, dps, _ in rows:
        groups[(cost, label)].append(dps)

    avg_rows = [
        (cost, label, round(sum(clean := remove_outliers(vals)) / len(clean)))
        for (cost, label), vals in groups.items()
    ]
    avg_rows.sort(key=lambda r: (r[0], STAR_LABELS.index(r[1])))

    avg_base = next(avg for cost, label, avg in avg_rows if cost == 1 and label == "1★")

    with open(avg_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Cost", "Star", "Avg DPS", "Norm DPS"])
        for cost, label, avg in avg_rows:
            writer.writerow([cost, label, avg, round(avg / avg_base, 2)])

    print(f"Wrote {len(avg_rows)} rows to {avg_path}")


if __name__ == "__main__":
    main()
