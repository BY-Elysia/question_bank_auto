import type { MediaReference } from '../../assets/domain/media-reference.js';

/** TextBlock contract. */
export type TextBlock = {
  text: string;
  media: MediaReference[];
};
