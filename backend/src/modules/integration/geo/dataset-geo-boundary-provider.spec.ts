import { DatasetGeoBoundaryProvider, type BoundaryDataset } from './dataset-geo-boundary-provider.js';

// Synthetic squares only: no real boundary dataset ships this phase (FR-020 deferred, Q-E6).
const square = (x0: number, y0: number, x1: number, y1: number) => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ],
];

const dataset: BoundaryDataset = {
  features: [
    { emirate: 'Dubai', type: 'Polygon', coordinates: square(55, 25, 56, 26) },
    { emirate: 'Abu Dhabi', type: 'MultiPolygon', coordinates: [square(53, 23, 54, 24), square(54.5, 23, 55, 24)] },
  ],
};
const provider = new DatasetGeoBoundaryProvider(dataset);

describe('DatasetGeoBoundaryProvider with a supplied dataset (FR-020, dormant until next phase)', () => {
  it('finds the emirate of a point inside a Polygon feature', () => expect(provider.locate(25.5, 55.5)).toBe('Dubai'));

  it('finds the emirate in any part of a MultiPolygon feature', () => {
    expect(provider.locate(23.5, 53.5)).toBe('Abu Dhabi');
    expect(provider.locate(23.5, 54.75)).toBe('Abu Dhabi');
  });

  it.each([
    ['between the parts', 23.5, 54.25],
    ['north of every shape', 27, 55.5],
    ['null island', 0, 0],
  ])('%s -> outsideUae', (_n, lat, lng) => expect(provider.locate(lat, lng)).toBe('outsideUae'));

  it('treats non-finite or out-of-range coordinates as outsideUae', () => {
    expect(provider.locate(NaN, 54)).toBe('outsideUae');
    expect(provider.locate(24, Infinity)).toBe('outsideUae');
    expect(provider.locate(91, 54)).toBe('outsideUae');
    expect(provider.locate(24, 181)).toBe('outsideUae');
  });

  it('answers outsideUae for an empty dataset', () =>
    expect(new DatasetGeoBoundaryProvider({ features: [] }).locate(25.5, 55.5)).toBe('outsideUae'));
});
