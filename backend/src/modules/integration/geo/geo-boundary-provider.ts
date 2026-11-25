/** Injection token for the geo boundary provider (NFR-023). */
export const GEO_BOUNDARY_PROVIDER = Symbol('GEO_BOUNDARY_PROVIDER');

/** Emirate names as in `EMIRATES` (activity.schema.ts), or `outsideUae` (FR-020). */
export type LocateResult =
  'Abu Dhabi' | 'Dubai' | 'Sharjah' | 'Ajman' | 'Umm Al Quwain' | 'Ras Al Khaimah' | 'Fujairah' | 'outsideUae';

export interface GeoBoundaryProvider {
  /** Coordinates are used in memory only; implementations must not log or store them (ADR-0006). */
  locate(lat: number, lng: number): LocateResult;
}
