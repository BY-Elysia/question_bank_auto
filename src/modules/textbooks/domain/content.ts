import { z } from 'zod';
export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const Box = z
  .tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ])
  .refine((b) => b[2] > b[0] && b[3] > b[1], 'Expected normalized [left, top, right, bottom]');
export const Source = z.strictObject({ page: z.number().int().positive(), box: Box });
export const Answer = z.strictObject({
  text: z.string(),
  explanation: z.string(),
  origin: z.enum(['source', 'ai_generated', 'human']),
  review: z.enum(['pending', 'accepted']),
  sources: z.array(Source),
});
export const Option = z.strictObject({ id: z.string().min(1), text: z.string() });
export const QuestionType = z.enum([
  'single_choice',
  'multiple_choice',
  'fill_blank',
  'short_answer',
  'proof',
  'calculation',
  'code',
  'judge',
  'group',
]);
export const Leaf = z.strictObject({
  label: z.string(),
  type: QuestionType,
  prompt: z.string(),
  options: z.array(Option),
  answer: Answer.nullable(),
});
export const Question = Leaf.extend({ children: z.array(Leaf) });
export const Kind = z.enum([
  'heading',
  'paragraph',
  'formula',
  'figure',
  'table',
  'example',
  'question',
  'answer',
]);
export const Payload = z.strictObject({
  text: z.string(),
  question: Question.nullable(),
  table: z.array(z.array(z.string())).nullable(),
  caption: z.string().nullable(),
});
export const Content = Payload.extend({
  id: Id,
  key: Id,
  kind: Kind,
  sectionId: Id.nullable(),
  sources: z.array(Source).min(1),
});
export const Section = z.strictObject({
  id: Id,
  parentId: Id.nullable(),
  title: z.string().min(1),
  level: z.number().int().min(1).max(8),
  source: Source,
});
export const Issue = z.strictObject({
  code: z.string(),
  message: z.string(),
  page: z.number().int().positive().nullable(),
  contentId: Id.nullable(),
  severity: z.enum(['warning', 'error']),
});
export const Page = z.strictObject({
  number: z.number().int().positive(),
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  status: z.enum(['uploaded', 'ready', 'processed']),
  blank: z.boolean(),
});
export const Document = z.strictObject({
  sections: z.array(Section),
  contents: z.array(Content),
  issues: z.array(Issue),
  processedPages: z.array(z.number().int().positive()),
});
export type Content = z.infer<typeof Content>;
export type Document = z.infer<typeof Document>;
export type Issue = z.infer<typeof Issue>;
export type Question = z.infer<typeof Question>;
export type Leaf = z.infer<typeof Leaf>;
export type Source = z.infer<typeof Source>;
