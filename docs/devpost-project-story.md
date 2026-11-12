# Daily Letter Bag — project story

## Inspiration

I have always enjoyed word games like Wordle and, before that, Scrabble. I wanted to take the simple act of spelling a word and see how much strategy I could build around it without making the rules hard to learn. Daily Letter Bag started with one constraint: you can only use the letters in your rack. The next layer came from showing the next five letters in the bag, so you can plan beyond the word you are making now. Then the scoring made longer words especially tempting: every additional letter is worth one more point than the previous one. Sometimes the best move is to hold on to a useful letter or play a smaller word to set up a longer one later.

## How I built it

I built Daily Letter Bag as a Reddit Devvit Web interactive post. Each daily puzzle uses a date-based seed, so everyone playing that day's post gets the same ordered set of letters. A round lasts 90 seconds and starts with 15 letters in the rack and 15 more in the bag. Players tap wooden tiles to form words, see the next five letters, and score valid words as used tiles are replaced from the bag.

I built it with web technologies. The interface is plain HTML, CSS, and JavaScript, with no frontend framework or game engine. The rules live in a shared JavaScript module. The server entry is written in TypeScript with Hono for its HTTP routes; Vite builds the client and server for Devvit. Keeping the rules separate from the interface let me use the same puzzle generation and scoring logic in the browser's local practice mode and on the server for scored Reddit rounds.

Devvit provided the Reddit-specific pieces. The post has a small inline opening view that calls `requestExpandedMode` to open the full game. In the server, Devvit's context supplies the post's puzzle date and the player's Reddit user ID. I use those values with Devvit Redis to save one timed attempt per signed-in player per day, while the server validates each submitted set of tile IDs. A scheduled Devvit task checks for the new UTC day's post, and the Reddit API creates it as an interactive post. I added a moderator menu action as a way to create or open today's post during testing. That meant I could build the Reddit version without a separate hosted backend.

Playtesting exposed assumptions I had to fix. The first daily-post flow failed when a Redis value reached my JSON parser as an object, so I made the storage reads handle both decoded objects and JSON strings. The Start button later failed because my client sent a GET request to a POST route; that was my own API wiring mistake. I corrected the request method and added a regression test. I also made an unlimited local practice mode because a one-attempt-per-day game is difficult to tune when every design change requires waiting for another daily round. The interface now hides letters until Start, works on desktop and mobile, and ends with a result card that can be copied without revealing words or letters.

## Challenges I faced

The hardest design challenge has been balance. The ratio of vowels to consonants needs to leave room for clever choices without making a rack feel hopeless. The five-letter preview adds a useful planning layer, but it also changes how players value the letters they already have. I am still testing whether the current mix feels right.

I also had to work through the practical side of a daily Reddit game: keeping attempts consistent across reloads, making taps responsive, fitting the controls on different phone sizes, and finding a broad allowed-word list that I could actually bundle and attribute. The **Finish early** action works, but it does not yet feel as satisfying as the rest of the round. That part deserves another design pass.

## What I learned

I learned that a small set of rules can create several levels of decision-making. The rack asks what I can spell now; the preview asks what I will be able to spell next; the scoring asks whether a quick word is worth giving up a potential longer one. I also learned how much the surrounding details matter in a daily game: the timer, the feel of tapping tiles, clear feedback, and a result people can share without spoiling the puzzle. The overall idea is fun to play, and playtesting is showing me where it still needs tuning.
