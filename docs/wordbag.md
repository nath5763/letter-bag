# Add Letter Bag to dailytracker.cc

**Status:** Working implementation handoff. The DailyTracker application stack and account model have not been inspected.

## Goal and boundaries

**Confirmed:** Add a playable copy of Daily Letter Bag as a daily game on dailytracker.cc. Keep the 90-second word-building loop, illustrated bag and wooden tiles, masked letters before Start, and a spoiler-free result card. The website should feel like a game within the existing DailyTracker product.

**Constraint:** Do not add a dailytracker.cc promotion or link to the Reddit Devvit game's UI or copied result. Reddit's [Devvit Rules](https://developers.reddit.com/docs/devvit_rules) prohibit apps from promoting another version of the same game on an external platform. The website implementation can be planned independently; any cross-platform promotion in the Reddit app would need Reddit's written approval.

**Proposed:** Keep website attempts, scores, and accounts separate from Reddit's Devvit Redis state for the first release. There is no Reddit account linking or score sync in this plan.

## Reuse from this repository

| Component | Source | Website action |
| --- | --- | --- |
| Puzzle generation, timer, scoring, and word validation | [engine.js](../src/shared/engine.js) | Reuse as the rules engine on the website server. Keep the client display in sync with the server's state. |
| Allowed words | [words.js](../src/shared/words.js) | Reuse the same bundled lexicon so acceptance matches the Reddit game. Include the applicable [dictionary notices](../data/SCOWL-NOTICE.txt). This is a broad SCOWL-derived list, not the licensed official Scrabble list. |
| Spoiler-free result data | [result.js](../src/shared/result.js) | Adapt the title and copied URL to the DailyTracker game page. Do not include played words or letter order in shared text. |
| Gameplay UI | [game.js](../src/client/game.js), [style.css](../src/client/style.css) | Port the view and interactions into the site's component system. Replace the practice/Reddit transport with the site's API. |
| Illustrated bag and frame | [assets](../src/client/assets/letter-bag.webp) | Reuse the production art. The [3:2 PNG](../src/client/assets/letter-bag-3x2.png) is available for a listing or preview image. |

The Reddit [server](../src/server/index.ts) is a reference for one-attempt storage and UTC rotation, not a website backend to deploy unchanged. The [splash.js](../src/client/splash.js) entry point calls Devvit's expanded-mode API and must be replaced with normal website navigation.

## Player experience

1. Show Letter Bag in the DailyTracker game list and route the player to its game page. Use the site's navigation, accessibility, and account conventions.
2. Before Start, show the rules through **How to play** and mask rack and preview letters. Show the game date/number and the 90-second limit.
3. On Start, begin the timed attempt and reveal a 15-tile rack. Show the next five letters from a 15-tile bag.
4. Tapping rack tiles forms a word above the rack. Tapping a chosen letter removes it; Back removes the last letter; Clear removes the whole selection. Play word submits at least three letters.
5. A valid word scores `1 + n(n + 1) / 2` points for `n` letters. For example, three letters score 7. A word can score only once per round. Invalid or repeated words do not consume tiles. Used tiles leave the rack and replacement tiles come from the bag in order.
6. End the round when the timer expires, the player selects **Finish early**, or fewer than three tiles remain. Show score, word count, longest word length, and a **Copy result** button. The copied summary may link to the DailyTracker game page but must reveal no letters or played words.
7. Preserve the current touch-friendly mobile controls. Verify the game at approximately 490×1020 and 451×770 screenshot sizes, remembering that browser or app chrome reduces the actual CSS viewport. The result history may scroll when needed; the controls must remain reachable.

## Daily puzzle and attempt ownership

**Proposed (DLB-WEB-D1):** Use the UTC calendar date as the website's daily game number, matching the Reddit game's date convention. Derive a website-specific seed such as `site:YYYY-MM-DD` so playing on one platform cannot reveal the other platform's letters. Keep the date/game number separate from the seed: the current `resultCard` derives its game number only when the seed is a plain `YYYY-MM-DD` string.

**Proposed (DLB-WEB-D2):** Use the website's existing signed-in user ID and persist one scored attempt per user per UTC date. Starting consumes that day's attempt. A returning player sees the same saved in-progress or finished round. Guest play, if offered, should be labeled unsaved and should not appear on scored leaderboards or streaks.

**Proposed:** The website server owns `startedAt`, `endedAt`, tile order, accepted words, and score. Never trust a client-submitted score or word string. The client submits tile IDs; the server calls `submitWord`. Store round changes atomically so two simultaneous requests cannot spend the same tiles twice. Return a masked public state before Start and the visible state after Start. Expire an attempt by server time, including after a page reload.

An example API contract to adapt to the site's existing backend conventions:

| Action | Example route | Result |
| --- | --- | --- |
| Load today's state | `GET /api/games/letter-bag/today` | Date, game number, whether an attempt exists, and a masked or current public game state. |
| Start | `POST /api/games/letter-bag/today/start` | Creates the single timed attempt or returns the existing attempt. |
| Play word | `POST /api/games/letter-bag/today/words` with `{ "ids": [1, 2, 3] }` | Accepted word, points, and updated public game state, or a rule error. |
| Finish | `POST /api/games/letter-bag/today/finish` | Final public state and result. |

Keep internal game state off public responses before Start. The existing [`publicGame`](../src/shared/engine.js) helper masks the rack and first five bag tiles; adapt it if the website exposes a different state shape.

## DailyTracker integration steps

1. Add the game route and listing using the site's existing game-card and daily-completion patterns.
2. Bring over the shared engine and dictionary, including source notices. Make the game server authoritative for scored rounds.
3. Implement daily date/seed selection and persistence in the site's backend. Decide how its existing user, guest, streak, and completion systems should represent this game.
4. Port the gameplay UI and assets. Replace Devvit-specific navigation and transport; retain the current accessible button labels and reduced-motion behavior.
5. Add a DailyTracker-specific result formatter and copy action. Include the site game URL only in the website's copied result.
6. Test date rollover, reload during a round, duplicate starts, concurrent word submissions, expired submissions, guest behavior, keyboard use, and the two mobile size classes.

## Acceptance checks

- All players on the website get the same ordered letters for a given website date; another date produces a different puzzle.
- Letters are hidden until Start, and a refresh before Start does not expose them.
- A signed-in player cannot start a second scored round for the same date, including after refresh or in another tab.
- Server-side timing and scoring match the existing engine. Invalid words leave the rack, bag, and score unchanged.
- The DailyTracker completion state reflects the finished result once, without changing a Reddit result.
- The copied result contains game number, score, word count, longest length, and an optional website game URL, with no puzzle spoilers. It does not open an operating-system share sheet.
- The controls are usable at both the shorter and taller mobile sizes; the page does not clip tiles, buttons, or result details.

## Open decisions

- **DLB-WEB-Q1:** Should the website use distinct daily letters (**proposed**) or the exact same letters as Reddit? Shared letters let a player preview a Reddit challenge elsewhere.
- **DLB-WEB-Q2:** Does DailyTracker use UTC or a user-selected timezone for its other daily games? Changing this game's reset clock would change its game number and persistence key.
- **DLB-WEB-Q3:** Which existing DailyTracker account, guest, streak, and leaderboard conventions should Letter Bag join? No new account system is specified here.
