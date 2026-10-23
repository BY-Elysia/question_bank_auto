import type { ToolCatalog } from '../dto/tool-catalog.js';

/** 列出可用 Tool 定义. Runtime validation is not implemented yet. */
export interface ListToolsInput {}

export type ListToolsResult = ToolCatalog;
