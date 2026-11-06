import { z } from 'zod';
import { Document, Content } from '../domain/content.js';
export const ReplaceDocument = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  document: Document,
});
export const EditContent = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  content: Content,
});
export const Decision = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(['accept', 'reject']),
});
export const Restore = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});

const BankText = z.object({ text: z.string(), media: z.array(z.never()) });
const BankAnswer = BankText.extend({ explanation: z.string().optional() }).nullable();
const BankLeaf = z.object({
  questionId: z.string(),
  chapterId: z.string().nullable(),
  nodeType: z.literal('LEAF'),
  questionType: z.string(),
  title: z.string(),
  prompt: BankText,
  defaultScore: z.number(),
  rubric: z.array(z.never()),
  standardAnswer: BankAnswer,
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  allowPartial: z.boolean().optional(),
});
export const QuestionBankExport = z.object({
  version: z.literal('v1.1'),
  courseId: z.string(),
  documentType: z.literal('textbook'),
  textbook: z.object({
    textbookId: z.string(),
    title: z.string(),
    publisher: z.string(),
    subject: z.string(),
    hasAnswer: z.boolean(),
    answerHandlingMode: z.string().optional(),
  }),
  chapters: z.array(
    z.object({
      chapterId: z.string(),
      parentId: z.string().nullable(),
      title: z.string(),
      orderNo: z.number().int(),
    }),
  ),
  questions: z.array(
    z.union([
      BankLeaf,
      z.object({
        questionId: z.string(),
        chapterId: z.string().nullable(),
        nodeType: z.literal('GROUP'),
        questionType: z.string(),
        title: z.string(),
        stem: BankText,
        standardAnswer: BankAnswer.optional(),
        children: z.array(BankLeaf.extend({ orderNo: z.number().int() })),
      }),
    ]),
  ),
});
