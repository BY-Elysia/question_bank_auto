import type { ModelMessage } from '../gateway/domain/model-message.js';
import type { ModelParameters } from '../../modules/model-config/domain/model-parameters.js';
import type { Usage } from '../../modules/model-config/domain/usage.js';

/** External provider adapter. No implementation or SDK coupling in the skeleton. */
export interface ModelProvider {
  readonly id: string;
  invoke(request: {
    modelId: string;
    credential: string;
    messages: readonly ModelMessage[];
    parameters: ModelParameters;
    outputSchema: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<{ rawResponse: string; usage: Usage; providerRequestId: string | null }>;
}
