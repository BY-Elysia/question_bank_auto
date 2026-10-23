/** Stream implementations will be supplied with the business adapters. */
export interface DownloadContent {
  content: AsyncIterable<Uint8Array>;
  mediaType: string;
  fileName: string;
}

export type EventStream<T> = AsyncIterable<T>;
