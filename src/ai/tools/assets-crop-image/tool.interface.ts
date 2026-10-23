import type { CropImageInput } from './contracts/crop-image-input.js';
import type { CropImageOutput } from './contracts/crop-image-output.js';
import type { ToolExecutionContext } from '../../runtime/execution-context.js';

/** Contract only. No prompt, tool execution or orchestration implementation. */
export interface AssetsCropImageTool {
  readonly id: 'assets.crop-image';
  execute(input: CropImageInput, context: ToolExecutionContext): Promise<CropImageOutput>;
}
