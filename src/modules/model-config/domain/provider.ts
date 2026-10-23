import type { ProviderModel } from './provider-model.js';

/** 平台登记的供应商及自部署端点；公开 API 不接受任意 baseUrl。 */
export type Provider = {
  id: string;
  displayName: string;
  models: ProviderModel[];
};
