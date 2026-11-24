import { DatasetGeoBoundaryProvider } from './dataset-geo-boundary-provider.js';

const provider = new DatasetGeoBoundaryProvider();

describe('DatasetGeoBoundaryProvider with bundled dataset (FR-020)', () => {
  it.each([
    ['Abu Dhabi city', 24.4539, 54.3773, 'Abu Dhabi'],
    ['Dubai Marina', 25.0805, 55.1403, 'Dubai'],
    ['Sharjah', 25.3463, 55.4209, 'Sharjah'],
    ['Fujairah', 25.1288, 56.3265, 'Fujairah'],
    ['Ras Al Khaimah', 25.7895, 55.9432, 'Ras Al Khaimah'],
    ['Ajman', 25.4052, 55.5136, 'Ajman'],
    ['Umm Al Quwain', 25.5647, 55.5552, 'Umm Al Quwain'],
    ['Al Ain (Abu Dhabi inland)', 24.2075, 55.7447, 'Abu Dhabi'],
  ])('%s -> %s', (_n, lat, lng, expected) => {
    expect(provider.locate(lat, lng)).toBe(expected);
  });

  it.each([
    ['Muscat', 23.588, 58.3829],
    ['Doha', 25.2854, 51.531],
    ['Riyadh', 24.7136, 46.6753],
    ['open Gulf water', 26.5, 52.5],
    ['null island', 0, 0],
  ])('%s -> outsideUae', (_n, lat, lng) => {
    expect(provider.locate(lat, lng)).toBe('outsideUae');
  });

  it('treats non-finite or out-of-range coordinates as outsideUae', () => {
    expect(provider.locate(NaN, 54)).toBe('outsideUae');
    expect(provider.locate(24, Infinity)).toBe('outsideUae');
    expect(provider.locate(91, 54)).toBe('outsideUae');
    expect(provider.locate(24, 181)).toBe('outsideUae');
  });

  it('supports Polygon features in a custom dataset', () => {
    const p = new DatasetGeoBoundaryProvider({
      features: [
        {
          emirate: 'Dubai',
          type: 'Polygon',
          coordinates: [
            [
              [55, 25],
              [56, 25],
              [56, 26],
              [55, 26],
              [55, 25],
            ],
          ],
        },
      ],
    });
    expect(p.locate(25.5, 55.5)).toBe('Dubai');
    expect(p.locate(24, 55.5)).toBe('outsideUae');
  });
});
