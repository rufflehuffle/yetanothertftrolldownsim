# Yet Another TFT Rolldown Simulator
A TFT rolldown simulator updated for Set 16 with a focus on faithful recreation of the in-game environment and QOL features.

## Questions (for myself)
### What does done look like for this project? (v1.0)

I want v1.0 to launch once all the UI elements and quirks that cause the simulator to be different from the actual game (proper summons, proper shop UI, etc.) have been resolved. Basically v1.0 will be a simple no-frills rolldown simulator with AS LITTLE JANK AS POSSIBLE, nothing fancy.

### What is the advantage of this simulator compared to others that already exist (datatft, prismatactics)?

Despite being in early development, this simulator already has a couple of advantages over existing products. The Team Builder and Preset menus make it very, very easy to set up a realistic rolldown situation and practice it over and over again. This is something that is either annoying or impossible to do in other simulators.

This simulator also has a properly working round timer that locks your shop and board once it ends. This timer is vital for training your speed and nerves for those stressful in-game rolldowns.

### What do you mean by a faithful recreation of the in-game environment? What are you trying to simulate faithfully that others don't?

By faithful recreation, I mean that I'm going to try to simulate any possible mechanic that will come up during a rolldown. Here are a couple of things that other simulators are missing:
1. Unit summons (Freljord Ice Tower, Azir Soldiers, Tibbers)
2. Items - item swapping, removering, reforging, etc. are vital parts of your rolldown turn
3. Enemy boards (being contested / uncontested)
4. 4-2 pre-rolldown boards from real games / randomly generated mock boards
5. Board travel / 5s post-shop-lock

### How will you maintain this when a new set / patch comes out?

There will be a lot of manual work involved, simply put. I'd like to set up some systems or hire someone to help me with this work if possible. Hopefully, this project attracts the attention from someone from datatft / MetaTFT and they'll let me work with / for them to improve this tool.

### Why are you building this?

First and foremost, I think mechanics are an underrated and relatively unexplored part of TFT. Using rolldown simulators that other people always made me think that there was something missing. Other simulators have had a whole host of problems. 

1. They're unrealistic - the shops and UI feel off from the real game and they give you empty boards and infinite gold.
2. They're poorly maintained - there have probably been 10-20 rolldown simulator projects, and there's probably a whole graveyard of rolldown projects for each set.
3. They don't try to actually teach / train you to do a rolldown.

I want to make a tool that **teaches** players how to do a rolldown like a Challenger player. Not only that, I want to make a tool that breaks the limits of what we know to be possible in TFT. Currently, even at the highest tier of play, players still mess up their big rolldowns. They still don't flex as much as they can between lines due to human error. I want this tool to **improve the TFT community as a whole**.