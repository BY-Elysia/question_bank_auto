import { z } from 'zod';
// Preserve the fields from the original textbook form; filesystem paths are never inputs.
export const TextbookMetadata = z
  .strictObject({
    version: z.string().trim().max(100).default('v1.1'),
    courseId: z.string().trim().max(100).default(''),
    textbookId: z.string().trim().max(100).default(''),
    title: z.string().trim().min(1).max(300),
    publisher: z.string().trim().max(300).default(''),
    subject: z.string().trim().min(1).max(100),
    hasAnswer: z.boolean().default(true),
    answerHandlingMode: z.enum(['extract_visible', 'generate_brief', 'leave_empty']).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.hasAnswer &&
      value.answerHandlingMode &&
      value.answerHandlingMode !== 'extract_visible'
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'With source answers, use extract_visible; missing answers can be generated in a later review task',
        path: ['answerHandlingMode'],
      });
  });
export const ExtractionContext = z.strictObject({
  metadata: TextbookMetadata,
  instructions: z.string().max(8000).default(''),
});
