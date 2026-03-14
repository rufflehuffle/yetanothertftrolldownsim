# Post Rolldown Screen

Modal that pops up after a rolldown and has the following tabs:
- Performance
    - Comp
    - Score History - graph that shows your last X rolldowns with the current comp
    - Grade - aggregated score from the below
    - Score Breakdown (Pentagon that measures how good you did on 5 axes)
        - Speed - measures if you had enough APM to complete your turn
        - Discipline - measures if you stopped rolling at the right time
        - Accuracy - measures if you missed any units
        - Positioning - measures how good your positioning is
        - Flexibility - measures how open you were to other lines / alternate carries
- Analysis
    - Shows the round detail by roll
        - Look at MetaTFT Round Detail for inspiration
    - Notes where you made mistakes
    - RNG Score

## Scoring Heuristics

Speed — measures whether you had enough APM to complete your turn
- Counts actions: buys, sells, rolls, and moves (bench-to-bench moves excluded)
- Duration is measured to the last counted action (not round end), so short rolldowns aren't penalised for finishing early
- APM = total actions / (duration in minutes)
- Roll volume bonus (highest tier only): +5 for ≥10 rolls, +10 for ≥15, +20 for ≥20
- Score = min(100, APM + rollBonus)

Accuracy — measures whether you bought every unit you were rolling for
- A missed unit is one that appeared in the shop while the player had an existing copy (on board, bench, or in team plan), could be afforded at roll time, but was not bought before the next roll
- Duplicate shop slots for the same champion are collapsed — each champion counts at most once per roll
- Penalty: −5 per missed unit (floor 0)
- TODO: weight main carries/tanks more heavily; account for gold-constrained misses

Positioning — measures how well your board is set up for combat
- Boolean checks (−10 each if failing):
    - Main ranged carry (Marksman/Caster/Specialist) is in D1 or D7
    - Strongest melee carry (Fighter/Assassin) is adjacent to strongest tank
    - Main tank is in the A-row zone directly in front of the corner ranged carry (D1 → A1–A4; D7 → A4–A7)
- Per-unit checks (−5 per offending unit):
    - Melee carries placed in the back row (D hexes)
    - Ranged carries not in the back row (D row)
    - Melee carries with no adjacent tank

Flexibility — measures whether you picked up stronger tank alternatives when they appeared
- Scores whether the player picked up alternate tanks that appeared in the shop
- An alternate tank qualifies if it is: (a) Tank role, (b) has a tank synergy trait (Defender / Bruiser / Juggernaut / Warden) whose first breakpoint is reachable with existing board + bench, (c) stronger at 2★ than the main tank's current reference strength, and (d) equal or higher cost than the main tank
- Main tank reference: strongest 2★ Tank on board (if available); otherwise the strongest Tank in team plan at its current star level; falls back to strongest Tank on board
- Penalty: −15 per missed alternate tank opportunity (floor 0)

Discipline — measures whether you stopped rolling at the right time
- At each roll event, computes avgGoldPerStrengthPoint: expected gold cost to gain 1 board-strength point via the most efficient available upgrade path
- Upgrade paths considered: board 1★ units upgrading to 2★, bench 1★ units upgrading to 2★ (may displace weakest board unit), and team-plan units not yet acquired (buying 1 copy may displace weakest board unit)
- Board strength uses a weighted sum: strongest Tank ×8, strongest carry ×5, all others ×1
- Probability model: p(slot = unit) = shop_odds[level][cost] × (unit_remaining / tier_remaining); expected copies per shop = 5p
- Penalty: −5 × Σ max(0, avgGoldPerStrengthPoint − 1) across all roll events (floor 0)


## TODO
- Implement rolldown history

- Round detail
    - Include insights on areas where you can improve your score. for example: you lost discipline points here (overrolled)
- Add star indicators to units on final board
    - Should go on the top of the unit
- Add active traits to the top of the final board panel
- Sort units on the final board

- Things not currently being graded but are important
    - Check for player fielding the correct units / their strongest possible board (no dupes, correct traits in etc.)
    - Check for player missing a unit they need to field a trait
    - Check for whether or not the player should've kept rolling but stopped