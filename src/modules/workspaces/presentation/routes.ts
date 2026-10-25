export const workspaceRoutes = [
  ['delete', '/api/workspaces/{id}', 'deleteWorkspace', null, null, 204],
  ['get', '/api/workspaces', 'listWorkspaces', null, 'WorkspaceList', 200],
  ['post', '/api/workspaces/pdf', 'uploadWorkspacePdf', 'PDF', 'Workspace', 202],
  ['post', '/api/workspaces/images', 'uploadWorkspaceImages', 'ImageUpload', 'Workspace', 201],
  ['get', '/api/workspaces/{id}', 'getWorkspace', null, 'WorkspaceViewResponse', 200],
  [
    'post',
    '/api/workspaces/{id}/extract',
    'extractWorkspace',
    'ExtractionSettings',
    'Workspace',
    202,
  ],
  ['post', '/api/workspaces/{id}/resume', 'resumeWorkspace', null, 'Workspace', 202],
  ['post', '/api/workspaces/{id}/cancel', 'cancelWorkspace', null, 'Workspace', 200],
] as const;
