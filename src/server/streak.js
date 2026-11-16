const utcDay = time => new Date(time).toISOString().slice(0, 10);
export const previousDay = day => utcDay(Date.parse(`${day}T00:00:00Z`) - 86400000);

export const unlocksCenturyBadge = (profile, previousScore, nextScore) =>
  !profile?.centuryBadge && previousScore < 100 && nextScore >= 100;

export const LIFETIME_BADGE_POINTS = 20_000;
export const unlocksLifetimeBadge = (profile, previousTotal, earnedPoints) =>
  !profile?.bottomlessBagBadge && previousTotal < LIFETIME_BADGE_POINTS &&
  previousTotal + earnedPoints >= LIFETIME_BADGE_POINTS;

export function currentStreak(profile, day) {
  return profile && (profile.lastDay === day || profile.lastDay === previousDay(day)) ? profile.current : 0;
}

export function nextProfile(profile, day) {
  const current = profile?.lastDay === previousDay(day) ? profile.current + 1 : 1;
  return { ...profile, lastDay: day, current, best: Math.max(current, profile?.best || 0) };
}
