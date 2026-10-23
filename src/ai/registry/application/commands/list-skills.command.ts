import type { SkillCatalog } from '../dto/skill-catalog.js';

/** 列出核心 Skill 定义. Runtime validation is not implemented yet. */
export interface ListSkillsInput {}

export type ListSkillsResult = SkillCatalog;
