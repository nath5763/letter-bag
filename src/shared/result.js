export function resultCard(game, { practice = false, anonymous = false, postUrl = '' } = {}) {
  const gameNumber = /^\d{4}-\d{2}-\d{2}$/.test(game.seed) ? game.seed.replaceAll('-', '') : null;
  const label = practice ? 'Practice result' : anonymous ? 'Unsaved result' : 'Daily result';
  const wordCount = game.words.length;
  const longest = game.words.reduce((length, entry) => Math.max(length, entry.word.length), 0);
  const title = practice ? 'Daily Letter Bag · Practice' : `Daily Letter Bag #${gameNumber || game.seed}`;
  const text = [
    title,
    `Score: ${game.score}`,
    `Words: ${wordCount}`,
    `Longest word: ${longest} letters`,
    ...(practice ? ['Practice round'] : anonymous ? ['Unsaved round'] : []),
    ...(postUrl ? [postUrl] : [])
  ].join('\n');
  return { gameNumber, label, wordCount, longest, text, title };
}
