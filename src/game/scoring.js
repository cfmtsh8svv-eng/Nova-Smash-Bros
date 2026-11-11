// Leaderboard points for one match:
// placement (1st 100, 2nd 60, 3rd 40, 4th 20) plus 1 point per 10 % damage dealt.
export const PLACEMENT_POINTS = [100, 60, 40, 20];

export function matchPoints(place, damageDealt) {
  const placement = PLACEMENT_POINTS[place - 1] || 0;
  return placement + Math.floor(Math.max(0, damageDealt) / 10);
}
