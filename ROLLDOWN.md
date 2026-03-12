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

Speed
- Check if player properly completed their turn
    - Were any units auto-fielded? -> if yes, -1 grade
    - Did you need to roll more? -> if yes, -1 grade
    - If yes, give an A
- Extra points for >20 shops seen in one turn -> give +1 grade

Accuracy
- Major mistakes:
    - Player missed a copy of their main carries
    - Not holding a 5 cost unit that fits onto the board
    - Selling additional copies of their carries
- Minor mistakes:
    - Player missed a copy of a filler unit

Positioning
- Major mistakes:
    - Tank in the back line
    - Carry in the front line
- Minor mistakes:
    - Main carry not in the corner
    - Strongest tank not in front of the main carry

Flexibility
- Give the player a C if they did not hold other possible units
- Major mistakes:
    - Not holding alternate 4 cost tanks
- Minor mistakes (-1 can still get an A):
    - Not holding alternate 4 cost carries
    - Not holding alternate 3 cost tanks
    - Not holding splashable 5 costs

Discipline
- Give the player an A by default
- Track avg. # of gold until the next upgrade
- +1 if they stopped rolling at the correct time
- -1 if they slightly overrolled
- -2 if they kept rolling even though all their units were 2*

## TODO
- Add rolldown scoring
    - Score discipline
    - Score flexibility

- Implement round detail
- Implement rolldown history

- Add star indicators to units on final board
    - Should go on the top of the unit
- Add active traits to the top of the final board panel
- Sort units on the final board