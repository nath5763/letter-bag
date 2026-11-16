# Daily Letter Bag

A daily word game built as a Reddit Devvit Web interactive post. Everyone playing a dated post gets the same ordered 30 letters. The standard puzzle has 12 vowels and 18 consonants, split near 6 vowels and 9 consonants in both the opening rack and bag. Select tiles to make words; used letters refill from the bag. There is no time limit. Longer words score progressively more, and Q/Z earn 2 bonus points each while J/X/K/V earn 1. The game saves one attempt per signed-in player per UTC day and ranks daily scores by points, then fewer words. A signed-in player permanently earns the Bookworm badge upon reaching 100 points in a daily round, and the Bottomless Bag badge upon reaching 20,000 lifetime points from completed daily rounds.

## Play locally

Node 20 or newer can run the practice server without installing packages:

```sh
node scripts/practice.mjs --seed=demo --rack=15 --bag=15
```

Open http://127.0.0.1:4173/. The `--seed`, `--rack` (3-30), and `--bag` (0-60) arguments are optional. Use **Replay seed** to play the same letters or **New puzzle** to generate another. The local mode has no daily lock.

Before starting, open **How to play** for the rules. The table uses illustrated letter tiles, a draw-bag animation, and a sage-green playmat with coral branch accents; reduced-motion settings turn off decorative movement. During play, the score, bag count, forming word, rack, and five-letter preview stay visible.

After installing dependencies, `npm run practice -- --seed=demo` is equivalent.

## Playtest on Reddit

1. Install Node 24.18.0 or newer, then run `npm install` and `npm run build`.
2. Sign in with `npx devvit login`, then run `npm run dev` to create a playtest post in your development subreddit.
3. On installation, the app creates that day's dated post. A Devvit scheduled check runs every minute and creates one post for each new UTC day. The moderator menu item **Create today's Letter Bag** recovers or opens today's post without creating a duplicate.

The post stores its UTC date in `postData`; player state and each day's post ID live in installation-scoped Devvit Redis. Earlier posts show saved results but do not accept new starts. A round begun before midnight can continue until the player finishes or has fewer than three letters left. Missed days are not backfilled. An undated playtest post cannot accept a scored attempt; use the moderator menu to create a dated post.

Completed rounds show a shareable result card with the date-based game number (`YYYYMMDD`), score, word count, and longest word length. **Share result** opens Reddit's share sheet; **Copy result** copies spoiler-free text and the current post link. Practice and logged-out results are labeled separately.

The bundled lexicon in `src/shared/words.js` contains 184,576 entries generated from the locally installed SCOWL-derived Hunspell English dictionaries (US, GB, CA, and AU). It includes inflected forms such as `cavities` and `okras`, and accepts capitalized dictionary entries such as `Venus` by storing them in lowercase. Entries that are not plain alphabetic words or are marked `NOSUGGEST` are excluded. It is a broad English game dictionary, **not** the licensed official Scrabble word list. Source details and required copyright notices are in `data/`; the regeneration script is `scripts/build-wordlist.py`. No external requests are made by the game client.

The original game rules are in `Daily_Letter_Bag_Game_Rules_v2.md`. The dailytracker.cc connection is a later milestone.

