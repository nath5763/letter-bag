# Daily Letter Bag

A 90-second word game built as a Reddit Devvit Web interactive post. Everyone playing a dated post gets the same ordered 30 letters. The standard puzzle has 12 vowels and 18 consonants, split near 6 vowels and 9 consonants in both the opening rack and bag. Select tiles to make words; used letters refill from the bag. The Reddit slice saves one attempt per signed-in player per UTC day, without a public leaderboard yet.

## Play locally

Node 20 or newer can run the practice server without installing packages:

```sh
node scripts/practice.mjs --seed=demo --seconds=90 --rack=15 --bag=15
```

Open http://127.0.0.1:4173/. The `--seed`, `--seconds` (5â€“600), `--rack` (3â€“30), and `--bag` (0â€“60) arguments are optional. Use **Replay seed** to play the same letters or **New puzzle** to generate another. The local mode has no daily lock.

Before starting, open **How to play** for the rules. The table uses illustrated letter tiles, a draw-bag animation, and a sage-green playmat with coral branch accents; reduced-motion settings turn off decorative movement. During play, the timer, score, bag count, forming word, rack, and five-letter preview stay visible.

After installing dependencies, `npm run practice -- --seed=demo` is equivalent.

## Playtest on Reddit

1. Install Node 24.18.0 or newer, then run `npm install` and `npm run build`.
2. Sign in with `npx devvit login`, then run `npm run dev` to create a playtest post in your development subreddit.
3. On installation, the app creates that day's dated post. A Devvit scheduled check runs every minute and creates one post for each new UTC day. The moderator menu item **Create today's Letter Bag** recovers or opens today's post without creating a duplicate.

The post stores its UTC date in `postData`; player state and each day's post ID live in installation-scoped Devvit Redis. Earlier posts show saved results but do not accept new starts. A round begun before midnight can finish within its original 90 seconds. Missed days are not backfilled. An undated playtest post cannot accept a scored attempt; use the moderator menu to create a dated post.

Completed rounds show a shareable result card with the date-based game number (`YYYYMMDD`), score, word count, and longest word length. **Share result** opens Reddit's share sheet; **Copy result** copies spoiler-free text and the current post link. Practice and logged-out results are labeled separately.

The bundled lexicon in `src/shared/words.js` contains 148,507 entries generated from the locally installed SCOWL-derived Hunspell English dictionaries (US, GB, CA, and AU). It includes inflected forms such as `cavities` and `okras`, and excludes entries that are not plain lowercase alphabetic words or are marked `NOSUGGEST`. It is a broad English game dictionary, **not** the licensed official Scrabble word list. Source details and required copyright notices are in `data/`; the regeneration script is `scripts/build-wordlist.py`. No external requests are made by the game client.

The game rules are in `Daily_Letter_Bag_Game_Rules_v2.md`. The public leaderboard and dailytracker.cc connection are later milestones.

