import type { PageImagePort } from '../../../textbooks/ports/assets.port.js';
import type { SourceImageReader } from '../../ports/source-image-reader.js';
export class PageSourceImageReader implements SourceImageReader {
  constructor(private images: PageImagePort) {}
  async read(workspaceId: string, page: number, signal?: AbortSignal) {
    const asset = await this.images.read(workspaceId, page, signal, 'preview');
    const chunks: Buffer[] = [];
    for await (const chunk of asset.body) {
      signal?.throwIfAborted();
      chunks.push(Buffer.from(chunk));
    }
    signal?.throwIfAborted();
    return { data: Buffer.concat(chunks).toString('base64'), mimeType: asset.contentType };
  }
}
