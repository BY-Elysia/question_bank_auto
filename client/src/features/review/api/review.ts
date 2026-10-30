import { write } from '@/shared/api/http';
import type { Content } from '@/shared/contracts';
const url = (id: string) => `/textbooks/${encodeURIComponent(id)}`;
export type ReviewJob = 'verify' | 'repair' | 'answers';
export const reviewApi = {
  start: (
    id: string,
    input: {
      kind: ReviewJob;
      contentIds?: string[];
      instruction?: string;
      cache: 'prefix' | 'off';
    },
  ) => write(url(id) + '/jobs', input),
  command: (id: string, jobId: string, command: 'cancel' | 'resume') =>
    write(url(id) + `/jobs/${encodeURIComponent(jobId)}/${command}`),
  decide: (
    id: string,
    proposalId: string,
    expectedRevision: number,
    decision: 'accept' | 'reject',
  ) =>
    write(url(id) + `/proposals/${encodeURIComponent(proposalId)}/decision`, {
      expectedRevision,
      decision,
    }),
  edit: (id: string, contentId: string, expectedRevision: number, content: Content) =>
    write(
      url(id) + `/contents/${encodeURIComponent(contentId)}`,
      { expectedRevision, content },
      'PATCH',
    ),
};
