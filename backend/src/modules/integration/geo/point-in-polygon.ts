/** [lng, lat] position, GeoJSON order. */
export type Position = [number, number];
/** A polygon: first ring is the outer boundary, the rest are holes. */
export type PolygonRings = Position[][];

/** Ray casting against one ring. Points exactly on an edge may fall either way. */
export function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when inside the outer ring and outside every hole. */
export function pointInPolygon(lng: number, lat: number, rings: PolygonRings): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

export function pointInMultiPolygon(lng: number, lat: number, polygons: PolygonRings[]): boolean {
  return polygons.some((p) => pointInPolygon(lng, lat, p));
}
