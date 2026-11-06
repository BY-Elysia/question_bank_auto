import { request } from '@/shared/api/http';
export async function insertQuestion(
  id: string,
  anchor: string,
  position: 'before' | 'after',
  revision: number,
  file: File,
) {
  const body = new FormData();
  body.append('images', file);
  return request(
    `/workspaces/${id}/questions/${anchor}/image?position=${position}&revision=${revision}`,
    { method: 'POST', body },
  );
}
