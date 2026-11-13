// Scores always lead. Daily rounds use fewer words to break a score tie;
// all-time totals and otherwise identical daily rounds share a rank.
export function rankRows(entries, limit = 10) {
  const sorted = [...entries].sort((a, b) =>
    b.score - a.score ||
    (a.wordCount ?? Infinity) - (b.wordCount ?? Infinity) ||
    a.member.localeCompare(b.member));
  let rank = 0;
  return sorted.slice(0, limit).map((entry, index) => {
    if (!index || entry.score !== sorted[index - 1].score ||
      entry.wordCount !== sorted[index - 1].wordCount) rank = index + 1;
    return { ...entry, rank };
  });
}
