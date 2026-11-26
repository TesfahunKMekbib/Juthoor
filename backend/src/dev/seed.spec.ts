import { jest } from '@jest/globals';
import { SEED_ACTIVITY_TYPES, seedActivityTypes, seedRefusal } from './seed.js';

describe('seed:dev (FR-007, FR-011, Q-A4b, Q-E5)', () => {
  it('refuses to run unless NODE_ENV=development', () => {
    expect(seedRefusal({ NODE_ENV: 'development' })).toBeNull();
    for (const env of [undefined, 'production', 'test', 'staging'])
      expect(seedRefusal({ NODE_ENV: env })).toMatch(/NODE_ENV=development/);
  });

  it('seeds the six FR-007 categories plus OTHER, never Transport (Q-A4b, CR-001)', () => {
    expect(SEED_ACTIVITY_TYPES.map((t) => t.category).sort()).toEqual(
      ['cleanup', 'energy', 'other', 'planting', 'recycling', 'waste', 'water'].sort(),
    );
    expect(JSON.stringify(SEED_ACTIVITY_TYPES)).not.toMatch(/transport/i);
    const o = SEED_ACTIVITY_TYPES.find((t) => t.code === 'OTHER')!;
    expect(o.amount).toMatchObject({ optional: true, unit: 'items', min: 0.01, max: 100000 });
    expect(o.amount.units).toEqual(['items', 'kg', 'bags', 'liters', 'kWh', 'm2', 'other']);
    expect(o.formFields[0]).toMatchObject({ key: 'activityName', required: true, maxLength: 60 });
    expect(o.photoRules).toMatchObject({ minPhotos: 1, maxPhotos: 6, neededKinds: ['photo'] });
  });

  it('carries the FR-011 fields per category', () => {
    const by = Object.fromEntries(SEED_ACTIVITY_TYPES.map((t) => [t.category, t]));
    expect(by.planting.formFields.map((f) => f.key)).toContain('species');
    expect(by.recycling.amount.unit).toBe('kg');
    expect(by.recycling.photoRules.neededKinds).toContain('receipt');
    expect(by.cleanup.amount.unit).toBe('bags');
    expect(by.cleanup.formFields.map((f) => f.key)).toContain('areaCovered');
    expect(by.cleanup.photoRules.neededKinds).toEqual(['before', 'after']);
    for (const c of ['water', 'energy']) {
      const meters = by[c].formFields.filter((f) => f.key.startsWith('meter'));
      expect(meters.map((f) => [f.key, f.type, f.required])).toEqual([
        ['meterBefore', 'number', true],
        ['meterAfter', 'number', true],
      ]);
    }
    expect(by.water.amount.unit).toBe('liters');
    expect(by.energy.amount.unit).toBe('kWh');
  });

  it('has English and Arabic text everywhere, and sane ranges (NFR-016)', () => {
    for (const t of SEED_ACTIVITY_TYPES) {
      for (const text of [t.name, t.description, ...t.formFields.map((f) => f.label)]) {
        expect(text.en.length).toBeGreaterThan(0);
        expect(text.ar.length).toBeGreaterThan(0);
      }
      expect(t.amount.min).toBeLessThan(t.amount.max);
      expect(t.photoRules.minPhotos).toBeLessThanOrEqual(t.photoRules.maxPhotos);
      expect(t.photoRules.neededKinds.length).toBeLessThanOrEqual(t.photoRules.minPhotos);
    }
  });

  it('upserts each type by code as published, repeatably', async () => {
    const updateOne = jest.fn<(...a: unknown[]) => Promise<unknown>>().mockResolvedValue({});
    const n = await seedActivityTypes({ updateOne } as never);
    expect(n).toBe(SEED_ACTIVITY_TYPES.length);
    expect(updateOne).toHaveBeenCalledTimes(n);
    expect(updateOne.mock.calls[0][0]).toEqual({ code: SEED_ACTIVITY_TYPES[0].code });
    expect(updateOne.mock.calls[0][1]).toMatchObject({ $set: { status: 'published' } });
    expect(updateOne.mock.calls[0][2]).toEqual({ upsert: true });
  });
});
