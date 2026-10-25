import type { Readable } from 'node:stream';
import type { Book } from '../domain/book.js';
export interface BinaryAsset {
  body: Readable;
  contentType: string;
  filename: string;
}
export interface TextbookAssets {
  prepare(id: string, pdf: Buffer): Promise<Book['pages']>;
  prepareImages(id: string, images: Buffer[]): Promise<Book['pages']>;
  copyPages(id: string, sourceId: string, pages: number[]): Promise<Book['pages']>;
  source(id: string): Promise<BinaryAsset>;
  remove(id: string): Promise<void>;
}
export interface PageImagePort {
  ensure(id: string, page: number, signal?: AbortSignal): Promise<void>;
  read(id: string, page: number, signal?: AbortSignal): Promise<BinaryAsset>;
  dataUrl(id: string, page: number, signal?: AbortSignal): Promise<string>;
}
export interface ArchivePort {
  create(id: string, document: unknown, pages: number[]): Promise<BinaryAsset>;
}
/** Low-level renderer port; only asset adapters depend on physical paths. */
export interface PdfPort {
  inspect(pdf: string): Promise<Book['pages']>;
  page(
    pdf: string,
    directory: string,
    number: number,
    signal?: AbortSignal,
  ): Promise<{ width: number; height: number }>;
}
