import { levelFromXp, xpToNextLevel, LEVEL_THRESHOLDS } from '../challenge';

describe('LEVEL_THRESHOLDS', () => {
  it('has 10 entries matching Doc C §6', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 100, 200, 400, 700, 1000, 1500, 2000, 3000, 4500]);
  });
});

describe('levelFromXp', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [399, 3],
    [400, 4],
    [4499, 9],
    [4500, 10],
    [99999, 10],
  ])('xp=%i → level=%i', (xp, expected) => {
    expect(levelFromXp(xp)).toBe(expected);
  });
});

describe('xpToNextLevel', () => {
  it('reports 0..1 ratio toward next level', () => {
    const r = xpToNextLevel(150);
    expect(r.current).toBe(150);
    expect(r.next).toBe(200);
    expect(r.ratio).toBeCloseTo(0.5, 2);
  });

  it('returns ratio 1 when at max level', () => {
    const r = xpToNextLevel(5000);
    expect(r.ratio).toBe(1);
  });
});
