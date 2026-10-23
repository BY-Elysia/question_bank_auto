import type { ExportMediaEntry } from './export-media-entry.js';
import type { Id } from '../../../../shared/contracts/id.js';

/** 导出 ZIP 的 manifest.json。文档保留稳定 assetId，manifest 映射包内媒体路径，导入时重新登记资产并统一改写 ID。 */
export type ExportManifest = {
  /** @enum {string} */
  schemaVersion: '1.0';
  documentId: Id;
  documentRevision: number;
  /** @enum {string} */
  documentFile: 'question-bank.json';
  media: ExportMediaEntry[];
};
