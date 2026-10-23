import type { SourceEvidence } from '../../assets/domain/source-evidence.js';

/** StructureNode contract. */
export type StructureNode = {
  /** Format: uuid */
  id: string;
  parentId: string | null;
  /** @enum {string} */
  kind: 'chapter' | 'section' | 'exam_section' | 'subsection';
  title: string;
  order: number;
  evidence: SourceEvidence[];
};
