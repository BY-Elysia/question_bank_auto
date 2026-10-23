import type { AssetsCropImageCall } from '../../tools/assets-crop-image/contracts/assets-crop-image-call.js';
import type { AssetsReadPageCall } from '../../tools/assets-read-page/contracts/assets-read-page-call.js';
import type { DocumentsReadQuestionCall } from '../../tools/documents-read-question/contracts/documents-read-question-call.js';
import type { LibraryListNodesCall } from '../../tools/library-list-nodes/contracts/library-list-nodes-call.js';
import type { LibraryListSourcesCall } from '../../tools/library-list-sources/contracts/library-list-sources-call.js';
import type { LibrarySearchQuestionsCall } from '../../tools/library-search-questions/contracts/library-search-questions-call.js';

/** ToolCall contract. */
export type ToolCall =
  | AssetsReadPageCall
  | AssetsCropImageCall
  | LibraryListSourcesCall
  | LibraryListNodesCall
  | LibrarySearchQuestionsCall
  | DocumentsReadQuestionCall;
