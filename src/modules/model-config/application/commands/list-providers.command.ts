import type { ProviderCatalog } from '../dto/provider-catalog.js';

/** 列出获授权供应商及模型. Runtime validation is not implemented yet. */
export interface ListProvidersInput {}

export type ListProvidersResult = ProviderCatalog;
