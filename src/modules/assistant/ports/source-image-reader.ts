export interface SourceImage {
  data: string;
  mimeType: string;
}
/** Returns a model-ready normal-resolution image; storage and stream encoding belong to the adapter. */
export interface SourceImageReader {
  read(workspaceId: string, page: number, signal?: AbortSignal): Promise<SourceImage>;
}
