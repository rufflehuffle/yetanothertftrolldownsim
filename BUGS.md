# Bugs

## Gameplay / Logic
- Inactive traits reorder based on unit positions on board (expected: some fixed order by breakpoints?)
- Presets don't load with XP in the bank

## Input / Controls
- Can hold a shop slot and roll it, leaving a null slot; buying causes wrong unit to be bought
- Can drag star indicators and unit count if clicking the right spot in board-bench gap
- `D` key triggers browser default navigation
- Pressing `D` after timer ends can accidentally reset board (~1s cooldown needed)

## UI / HUD
- HUD is messed up and clippy in TB mode
- Disable loading saved teams and entering TB mode while in a round

## Unit / Trait / Set Specific
- Galio can be fielded
- Unlock condition doesn't load properly
- Ice Tower, Tibbers, and Azir Soldiers have hardcoded hex placements and overwrite units
- Shop, planner, etc. don't support 7-cost units
