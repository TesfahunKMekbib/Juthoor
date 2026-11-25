// DEVELOPMENT ONLY. `npm run seed:dev` upserts the activity types of FR-007 so the demo has a catalogue.
// No admin catalogue exists yet (FR-007/008 out of scope); values are configuration drafted for owner review (Q-E5).
// No participants collection is needed: the dev participant has no user document (ADR-0010).
import { fileURLToPath } from 'node:url';
import mongoose, { type Model } from 'mongoose';
import { ActivityType, ActivityTypeSchema } from '../../apps/activity-service/src/activity/activity-type.schema.js';

type SeedType = Pick<
  ActivityType,
  'code' | 'category' | 'name' | 'description' | 'formFields' | 'amount' | 'photoRules' | 'goodSeasonMonths'
>;

const bi = (en: string, ar: string) => ({ en, ar });
const photoRules = (minPhotos: number, maxPhotos: number, neededKinds: string[]) => ({
  minPhotos,
  maxPhotos,
  neededKinds,
  maxSizeMB: 8,
});
const meter = (key: string, en: string, ar: string, unitEn: string) => ({
  key,
  label: bi(`${en} (${unitEn})`, `${ar} (${unitEn})`),
  type: 'number' as const,
  options: [] as string[],
  required: true,
});

/**
 * The six FR-007 categories with their FR-011 fields. No Transport or Other (Q-A4b). The participant enters the
 * amount; water and energy additionally require the before/after meter readings as numbers (Q-E5).
 */
export const SEED_ACTIVITY_TYPES: SeedType[] = [
  {
    code: 'TREE_PLANTING',
    category: 'planting',
    name: bi('Tree planting', 'زراعة الأشجار'),
    description: bi('Plant native trees or seedlings.', 'زراعة أشجار أو شتلات محلية.'),
    formFields: [
      {
        key: 'species',
        label: bi('Plant species', 'نوع النبات'),
        type: 'text',
        options: [],
        required: true,
      },
    ],
    amount: { unit: 'trees', min: 1, max: 50 },
    photoRules: photoRules(1, 4, ['photo']),
    goodSeasonMonths: [10, 11, 12, 1, 2, 3],
  },
  {
    code: 'RECYCLING',
    category: 'recycling',
    name: bi('Recycling', 'إعادة التدوير'),
    description: bi('Take sorted materials to a recycling point.', 'تسليم مواد مفروزة إلى نقطة إعادة تدوير.'),
    formFields: [
      {
        key: 'material',
        label: bi('Material', 'نوع المادة'),
        type: 'choice',
        options: ['Plastic', 'Paper', 'Glass', 'Metal', 'Electronics'],
        required: true,
      },
    ],
    amount: { unit: 'kg', min: 0.5, max: 200 },
    photoRules: photoRules(2, 4, ['photo', 'receipt']),
    goodSeasonMonths: [],
  },
  {
    code: 'WASTE_REDUCTION',
    category: 'waste',
    name: bi('Waste reduction', 'تقليل النفايات'),
    description: bi('Avoid, reuse or compost waste.', 'تجنب النفايات أو إعادة استخدامها أو تحويلها إلى سماد.'),
    formFields: [
      {
        key: 'method',
        label: bi('Method', 'الطريقة'),
        type: 'choice',
        options: ['Reusable containers', 'Composting', 'Avoided single-use items', 'Repair or reuse'],
        required: true,
      },
    ],
    amount: { unit: 'kg', min: 0.5, max: 100 },
    photoRules: photoRules(1, 4, ['photo']),
    goodSeasonMonths: [],
  },
  {
    code: 'WATER_CONSERVATION',
    category: 'water',
    name: bi('Water conservation', 'ترشيد المياه'),
    description: bi(
      'Reduce water use; record the meter before and after.',
      'تقليل استهلاك المياه مع تسجيل قراءة العداد قبل وبعد.',
    ),
    formFields: [
      meter('meterBefore', 'Meter reading before', 'قراءة العداد قبل', 'L'),
      meter('meterAfter', 'Meter reading after', 'قراءة العداد بعد', 'L'),
    ],
    amount: { unit: 'liters', min: 1, max: 5000 },
    photoRules: photoRules(2, 4, ['before', 'after']),
    goodSeasonMonths: [],
  },
  {
    code: 'ENERGY_CONSERVATION',
    category: 'energy',
    name: bi('Energy conservation', 'ترشيد الطاقة'),
    description: bi(
      'Reduce electricity use; record the meter before and after.',
      'تقليل استهلاك الكهرباء مع تسجيل قراءة العداد قبل وبعد.',
    ),
    formFields: [
      meter('meterBefore', 'Meter reading before', 'قراءة العداد قبل', 'kWh'),
      meter('meterAfter', 'Meter reading after', 'قراءة العداد بعد', 'kWh'),
    ],
    amount: { unit: 'kWh', min: 1, max: 1000 },
    photoRules: photoRules(2, 4, ['before', 'after']),
    goodSeasonMonths: [],
  },
  {
    code: 'CLEANUP',
    category: 'cleanup',
    name: bi('Cleanup', 'حملة نظافة'),
    description: bi('Collect litter from a public area.', 'جمع المخلفات من منطقة عامة.'),
    formFields: [
      {
        key: 'areaCovered',
        label: bi('Area covered (m²)', 'المساحة المغطاة (م²)'),
        type: 'number',
        options: [],
        required: true,
      },
    ],
    amount: { unit: 'bags', min: 1, max: 100 },
    photoRules: photoRules(2, 6, ['before', 'after']),
    goodSeasonMonths: [10, 11, 12, 1, 2, 3],
  },
];

/** Returns why the seed must not run, or null when it may (development only). */
export function seedRefusal(env: Record<string, string | undefined>): string | null {
  return env.NODE_ENV === 'development' ? null : 'seed:dev refuses to run unless NODE_ENV=development.';
}

/** Upserts the types by `code`, published; safe to run repeatedly. Returns how many were written. */
export async function seedActivityTypes(model: Pick<Model<ActivityType>, 'updateOne'>): Promise<number> {
  for (const t of SEED_ACTIVITY_TYPES) {
    await model.updateOne(
      { code: t.code },
      { $set: { ...t, status: 'published' }, $setOnInsert: { version: 1 } },
      { upsert: true },
    );
  }
  return SEED_ACTIVITY_TYPES.length;
}

async function main(): Promise<void> {
  const refusal = seedRefusal(process.env);
  if (refusal) {
    console.error(refusal);
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/juthoor');
  try {
    const model = mongoose.model(ActivityType.name, ActivityTypeSchema);
    console.warn(`Seeded ${await seedActivityTypes(model)} activity types.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(`Seed failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
