export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + url, options);
  if (!response.ok) {
    let detail = '请求失败';
    try {
      const problem = await response.json();
      detail = typeof problem.detail === 'string' ? problem.detail : JSON.stringify(problem.detail);
    } catch {}
    throw new ApiError(
      response.status,
      response.status === 409 ? '当前状态已变化，请刷新后重试。' + detail : detail,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export function write<T>(url: string, body?: unknown, method = 'POST') {
  return request<T>(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}
