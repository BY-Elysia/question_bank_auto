import { PayloadTooLargeException } from '@nestjs/common';
import type { Readable } from 'node:stream';
const total = Symbol('uploadedBytes');
// Bound the entire multipart request, including chunked uploads, before buffering it all.
export const imageUploadStorage = {
  _handleFile(
    request: { [total]?: number },
    file: { stream: Readable },
    callback: (error: Error | null, result?: { buffer: Buffer; size: number }) => void,
  ) {
    const chunks: Buffer[] = [];
    let size = 0,
      done = false;
    const finish = (error: Error | null, result?: { buffer: Buffer; size: number }) => {
      if (!done) {
        done = true;
        callback(error, result);
      }
    };
    file.stream.on('data', (chunk: Buffer) => {
      if (done) return;
      request[total] = (request[total] ?? 0) + chunk.length;
      if (request[total]! > 100 * 1024 * 1024) {
        chunks.length = 0;
        finish(new PayloadTooLargeException('Total image upload must not exceed 100 MB'));
        file.stream.resume();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    file.stream.once('error', (error) => finish(error));
    file.stream.once('end', () => finish(null, { buffer: Buffer.concat(chunks), size }));
  },
  _removeFile(_request: unknown, file: { buffer?: Buffer }, callback: (error: null) => void) {
    delete file.buffer;
    callback(null);
  },
};
