import { request, write } from '@/shared/api/http';
import type { KnowledgeScope, CatalogWorkspace, CitationView } from '@/shared/contracts';
export const knowledgeApi = {
  workspaces: (signal?: AbortSignal) =>
    request<CatalogWorkspace[]>('/assistant/knowledge/workspaces', { signal }),
  scope: (id: string, signal?: AbortSignal) =>
    request<KnowledgeScope>(`/assistant/conversations/${id}/scope`, { signal }),
  save: (
    id: string,
    workspaceIds: string[],
    focus: KnowledgeScope['focus'] = null,
    allowEdits = false,
  ) =>
    write<KnowledgeScope>(
      `/assistant/conversations/${id}/scope`,
      { workspaceIds, focus, allowEdits },
      'PUT',
    ),
  citation: (id: string, evidence: string, signal?: AbortSignal) =>
    request<CitationView>(`/assistant/conversations/${id}/citations/${evidence}`, { signal }),
  image: (id: string, evidence: string, page: number) =>
    `/api/assistant/conversations/${id}/citations/${evidence}/pages/${page}/image`,
};
