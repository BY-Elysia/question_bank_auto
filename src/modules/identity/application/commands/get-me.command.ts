import type { User } from '../../domain/user.js';

/** 获取当前用户. Runtime validation is not implemented yet. */
export interface GetMeInput {}

export type GetMeResult = User;
