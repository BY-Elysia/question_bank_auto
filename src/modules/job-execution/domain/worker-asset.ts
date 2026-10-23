import type { Asset } from '../../assets/domain/asset.js';

/** 服务端生成的 /workspace 相对路径，仅含规范化安全路径段；禁止绝对路径、..、符号链接逃逸。调用方不能指定路径。 */
export type WorkerAsset = {
  asset: Asset;
  relativePath: string;
};
