import type { Question } from './content.js';
import { isQuestionCategory } from './exercise-numbering.js';
/** Only captions without a shared premise/answer may be flattened losslessly.
 * Real grouped questions retain their stem, answer and child relationships.
 */
export function independentQuestions(questions: Question[]): Question[] {
  return questions.flatMap((question) => {
    if (
      question.type !== 'group' ||
      !isQuestionCategory(question.prompt) ||
      question.answer ||
      question.options.length ||
      !question.children.length
    )
      return [question];
    return question.children.map((child) => ({ ...child, children: [], sourceLabel: child.label }));
  });
}
