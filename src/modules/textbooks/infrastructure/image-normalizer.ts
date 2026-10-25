import sharp from 'sharp';
import { fail } from '../../../shared/errors.js';
export async function normalizeImage(input: Buffer) {
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const meta = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
      fail(422, 'Use static PNG, JPEG or WebP images');
    const { data, info } = await image
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    fail(422, 'Image cannot be decoded or exceeds the pixel limit');
  }
}
