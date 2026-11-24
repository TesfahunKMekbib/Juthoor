import { pointInMultiPolygon, pointInPolygon, pointInRing, type Position } from './point-in-polygon.js';

const square = (a: number, b: number): Position[] => [
  [a, a],
  [b, a],
  [b, b],
  [a, b],
  [a, a],
];

describe('point in polygon (FR-020)', () => {
  it('detects inside and outside a ring', () => {
    expect(pointInRing(5, 5, square(0, 10))).toBe(true);
    expect(pointInRing(11, 5, square(0, 10))).toBe(false);
  });

  it('excludes holes', () => {
    const rings = [square(0, 10), square(4, 6)];
    expect(pointInPolygon(2, 2, rings)).toBe(true);
    expect(pointInPolygon(5, 5, rings)).toBe(false);
  });

  it('handles empty polygons and multipolygons', () => {
    expect(pointInPolygon(1, 1, [])).toBe(false);
    const multi = [[square(0, 2)], [square(10, 12)]];
    expect(pointInMultiPolygon(11, 11, multi)).toBe(true);
    expect(pointInMultiPolygon(5, 5, multi)).toBe(false);
  });
});
