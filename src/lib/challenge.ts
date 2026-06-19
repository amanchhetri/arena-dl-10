export const LEVEL_THRESHOLDS = [0, 100, 200, 400, 700, 1000, 1500, 2000, 3000, 4500] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (xp >= LEVEL_THRESHOLDS[i]!) level = i + 1;
    else break;
  }
  return level;
}

export function xpToNextLevel(xp: number): { current: number; next: number; ratio: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) {
    const cap = LEVEL_THRESHOLDS[MAX_LEVEL - 1]!;
    return { current: cap, next: cap, ratio: 1 };
  }
  const current = LEVEL_THRESHOLDS[level - 1]!;
  const next = LEVEL_THRESHOLDS[level]!;
  const ratio = (xp - current) / (next - current);
  return { current: xp, next, ratio };
}
