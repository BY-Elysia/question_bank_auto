import type { LibraryQuestion } from '../../domain/library-question.js';
import type { PageInfo } from '../../../../shared/contracts/page-info.js';

/** QuestionPage contract. */
export type QuestionPage = {
  items: LibraryQuestion[];
  page: PageInfo;
};
