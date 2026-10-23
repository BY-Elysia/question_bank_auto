export const jobRoutes = [
  ['post', '/api/textbooks/{id}/jobs', 'createJob', 'JobRequest', 'Job', 202],
  ['get', '/api/textbooks/{id}/jobs', 'listJobs', null, 'JobList', 200],
  ['get', '/api/textbooks/{id}/jobs/{jobId}', 'getJob', null, 'Job', 200],
  ['post', '/api/textbooks/{id}/jobs/{jobId}/cancel', 'cancelJob', null, 'Job', 200],
  ['post', '/api/textbooks/{id}/jobs/{jobId}/resume', 'resumeJob', null, 'Job', 202],
] as const;
