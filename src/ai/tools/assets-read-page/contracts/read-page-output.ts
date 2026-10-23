import type { Asset } from '../../../../modules/assets/domain/asset.js';

/** contentHandle 仅供当前任务模型网关使用，不是磁盘路径或跨用户公共 URL。 */
export type ReadPageOutput = {
  asset: Asset;
  contentHandle: string;
  /** Format: date-time */
  expiresAt: string;
};
