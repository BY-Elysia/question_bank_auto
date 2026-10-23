import type { AssetsCropImageResult } from '../../tools/assets-crop-image/contracts/assets-crop-image-result.js';
import type { AssetsReadPageResult } from '../../tools/assets-read-page/contracts/assets-read-page-result.js';
import type { DocumentsReadQuestionResult } from '../../tools/documents-read-question/contracts/documents-read-question-result.js';
import type { LibraryListNodesResult } from '../../tools/library-list-nodes/contracts/library-list-nodes-result.js';
import type { LibraryListSourcesResult } from '../../tools/library-list-sources/contracts/library-list-sources-result.js';
import type { LibrarySearchQuestionsResult } from '../../tools/library-search-questions/contracts/library-search-questions-result.js';

/** ToolResult contract. */
export type ToolResult =
  | AssetsReadPageResult
  | AssetsCropImageResult
  | LibraryListSourcesResult
  | LibraryListNodesResult
  | LibrarySearchQuestionsResult
  | DocumentsReadQuestionResult;
