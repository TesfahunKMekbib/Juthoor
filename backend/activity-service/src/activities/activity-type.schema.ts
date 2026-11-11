import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** Text in both app languages. */
@Schema({ _id: false })
export class Bilingual {
  @Prop({ type: String, required: true }) en: string;
  @Prop({ type: String, required: true }) ar: string;
}
const BilingualSchema = SchemaFactory.createForClass(Bilingual);

/** One extra question on the activity form, e.g. "Species". */
@Schema({ _id: false })
export class FormField {
  @Prop({ type: String, required: true }) key: string; // answers are saved under this name
  @Prop({ type: BilingualSchema, required: true }) label: Bilingual;
  @Prop({ type: String, required: true, enum: ['text', 'number', 'choice'] }) type: 'text' | 'number' | 'choice';
  @Prop({ type: [String], default: [] }) options: string[]; // only for "choice"
  @Prop({ type: Boolean, default: false }) required: boolean;
}
const FormFieldSchema = SchemaFactory.createForClass(FormField);

/** What is counted, its unit, and the allowed range. */
@Schema({ _id: false })
export class AmountRule {
  @Prop({ type: String, required: true }) unit: string; // trees | kg | liters | kWh | bags
  @Prop({ type: Number, required: true }) min: number;
  @Prop({ type: Number, required: true }) max: number;
}
const AmountRuleSchema = SchemaFactory.createForClass(AmountRule);

/** How many photos are needed and which kinds. */
@Schema({ _id: false })
export class PhotoRules {
  @Prop({ type: Number, required: true }) minPhotos: number;
  @Prop({ type: Number, required: true }) maxPhotos: number;
  @Prop({ type: [String], default: [] }) neededKinds: string[]; // e.g. ["before", "after"]
  @Prop({ type: Number, default: 8 }) maxSizeMB: number;
}
const PhotoRulesSchema = SchemaFactory.createForClass(PhotoRules);

export const ACTIVITY_CATEGORIES = ['planting', 'recycling', 'waste', 'water', 'energy', 'cleanup'] as const;

/** A kind of activity people can log, and the rules for it. */
@Schema({ collection: 'activityTypes', timestamps: true })
export class ActivityType {
  @Prop({ type: String, required: true, unique: true }) code: string; // e.g. "TREE_PLANTING"
  @Prop({ type: String, required: true, enum: ACTIVITY_CATEGORIES }) category: string;
  @Prop({ type: BilingualSchema, required: true }) name: Bilingual;
  @Prop({ type: BilingualSchema, required: true }) description: Bilingual;
  @Prop({ type: [FormFieldSchema], default: [] }) formFields: FormField[];
  @Prop({ type: AmountRuleSchema, required: true }) amount: AmountRule;
  @Prop({ type: PhotoRulesSchema, required: true }) photoRules: PhotoRules;
  @Prop({ type: [Number], default: [] }) goodSeasonMonths: number[];
  @Prop({ type: String, required: true, enum: ['draft', 'published', 'archived'], default: 'draft' }) status: string;
  @Prop({ type: Number, required: true, default: 1 }) version: number;
}

export type ActivityTypeDocument = HydratedDocument<ActivityType>;
export const ActivityTypeSchema = SchemaFactory.createForClass(ActivityType);
