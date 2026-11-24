import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
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

/** Loads the bundled geoBoundaries ADM1 copy (data/ATTRIBUTION.md). */
export function loadBundledDataset(): BoundaryDataset {
  return JSON.parse(readFileSync(new URL('./data/uae-adm1.json', import.meta.url), 'utf8')) as BoundaryDataset;
}

/** Point-in-polygon lookup over a boundary dataset (FR-020). Pure, no I/O after construction. */
@Injectable()
export class DatasetGeoBoundaryProvider implements GeoBoundaryProvider {
  private readonly shapes: { emirate: LocateResult; polygons: PolygonRings[] }[];

  constructor(dataset: BoundaryDataset = loadBundledDataset()) {
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
