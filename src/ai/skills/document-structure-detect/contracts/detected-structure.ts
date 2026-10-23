import type { CropBox } from '../../../../modules/assets/domain/crop-box.js';
import type { StructureNode } from '../../../../modules/documents/domain/structure-node.js';

/** DetectedStructure contract. */
export type DetectedStructure = {
  nodes: StructureNode[];
  switches: {
    /** Format: uuid */
    assetId: string;
    /** Format: uuid */
    nodeId: string;
    region?: CropBox;
  }[];
};
