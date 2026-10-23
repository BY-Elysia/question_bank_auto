import { z } from 'zod';
import {
  Id,
  Kind,
  Source,
  Section,
  Payload,
  Issue,
} from '../../../modules/textbooks/domain/content.js';
export const Range = z.strictObject({
  key: Id,
  kind: Kind,
  sectionId: Id.nullable(),
  sources: z.array(Source).min(1),
  label: z.string(),
});
export const StructureResult = z.strictObject({
  sections: z.array(Section),
  activeSectionId: Id.nullable(),
});
export const BoundaryResult = z.strictObject({
  complete: z.array(Range),
  pending: z.array(Range),
  blankPages: z.array(z.number().int().positive()),
  reason: z.string(),
});
export const LookaheadResult = z.strictObject({
  tailKey: Id,
  continues: z.boolean(),
  reason: z.string(),
});
export const ExtractResult = z.strictObject({
  items: z.array(z.strictObject({ key: Id, content: Payload })),
  issues: z.array(Issue),
});
export const VerifyResult = z.strictObject({ issues: z.array(Issue) });
export const RepairResult = z.strictObject({ content: Payload.nullable(), issues: z.array(Issue) });
export const AnswerResult = z.strictObject({
  answers: z.array(
    z.strictObject({
      childIndex: z.number().int().nonnegative().nullable(),
      text: z.string().min(1),
      explanation: z.string(),
    }),
  ),
  issues: z.array(Issue),
});
export type Range = z.infer<typeof Range>;
