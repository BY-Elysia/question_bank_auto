import type { JobCreate as CreateJobBody } from '../src/modules/jobs/application/dto/job-create.js';
import type { Question } from '../src/modules/documents/domain/question.js';
import type { SkillInput } from '../src/ai/runtime/contracts/skill-input.js';
import type { ToolCall } from '../src/ai/runtime/contracts/tool-call.js';

const renderRequest: CreateJobBody = {
  request: { kind: 'pdf-render', sourceAssetIds: [], dpi: 180, format: 'png' },
};
void renderRequest;

function questionOptions(question: Question): string[] {
  if (question.kind === 'choice') return question.options.map((option) => option.id);
  if (question.kind === 'group') return question.children.flatMap(questionOptions);
  return [];
}
void questionOptions;

const invalidTool: ToolCall = {
  // @ts-expect-error Tools are a closed allowlist, not arbitrary shell execution.
  toolId: 'shell.execute',
  input: { assetId: '00000000-0000-4000-8000-000000000001' },
};
void invalidTool;

const boundaryInput: SkillInput = {
  kind: 'question-boundary-detect',
  currentPageAssetId: '00000000-0000-4000-8000-000000000001',
  pendingPageAssetIds: [],
  lookaheadPageAssetId: null,
  currentNodeId: null,
  previousPendingRanges: [],
};
void boundaryInput;
