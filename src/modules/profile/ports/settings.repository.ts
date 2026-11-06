import type { ModelSettings, ModelSettingsSource } from '../../../ai/ports/model-settings.js';
export interface SettingsRepository extends ModelSettingsSource {
  save(value: ModelSettings): Promise<void>;
}
