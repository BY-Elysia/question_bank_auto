import type { CredentialList } from '../dto/credential-list.js';

/** 列出凭证元信息. Runtime validation is not implemented yet. */
export interface ListCredentialsInput {}

export type ListCredentialsResult = CredentialList;
