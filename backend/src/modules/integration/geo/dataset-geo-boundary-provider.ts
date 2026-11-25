import type { GeoBoundaryProvider, LocateResult } from './geo-boundary-provider.js';
import { pointInMultiPolygon, type PolygonRings } from './point-in-polygon.js';

export interface BoundaryFeature {
  emirate: Exclude<LocateResult, 'outsideUae'>;
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

export interface BoundaryDataset {
  features: BoundaryFeature[];
}

/**
 * Point-in-polygon lookup over a boundary dataset (FR-020). Pure, no I/O.
 * Dormant this phase: GPS-based validation is deferred (owner, 2026-11-25) and no boundary dataset ships
 * with the app. The next phase supplies a licensed dataset and wires this behind GEO_BOUNDARY_PROVIDER.
 */
export class DatasetGeoBoundaryProvider implements GeoBoundaryProvider {
  private readonly shapes: { emirate: LocateResult; polygons: PolygonRings[] }[];

  constructor(dataset: BoundaryDataset) {
    this.shapes = dataset.features.map((f) => ({
      emirate: f.emirate,
      polygons: f.type === 'Polygon' ? [f.coordinates as PolygonRings] : (f.coordinates as PolygonRings[]),
    }));
  }

  locate(lat: number, lng: number): LocateResult {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return 'outsideUae';
    return this.shapes.find((s) => pointInMultiPolygon(lng, lat, s.polygons))?.emirate ?? 'outsideUae';
  }
}
