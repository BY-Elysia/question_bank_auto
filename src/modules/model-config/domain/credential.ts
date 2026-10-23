/** 响应不包含 secret、明文 API Key 或可还原的密钥片段。 */
export type Credential = {
  /** Format: uuid */
  id: string;
  providerId: string;
  name: string;
  revision: number;
  /** @enum {string} */
  status: 'active' | 'revoked';
  /** Format: date-time */
  createdAt: string;
  /** Format: date-time */
  updatedAt: string;
};
