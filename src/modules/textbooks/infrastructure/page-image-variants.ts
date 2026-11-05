import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { PageImageVariant } from '../ports/assets.port.js';

/** UI derivatives only: source PNGs remain the model/export source of truth. */
export class PageImageVariants {
  private running = new Map<string, Promise<string>>();

  async file(source: string, variant: PageImageVariant): Promise<string> {
    if (variant === 'original') return source;
    const stat = await fs.stat(source);
    // Version by the source, not by document revision (editing text changes no pixels).
    const target = path.join(
      path.dirname(source),
      'display',
      `${path.basename(source, '.png')}-${stat.size}-${stat.mtimeMs}-${variant}-v1.webp`,
    );
    const existing = this.running.get(target);
    if (existing) return existing;
    const run = this.generate(source, target, variant);
    this.running.set(target, run);
    try {
      return await run;
    } finally {
      this.running.delete(target);
    }
  }

  private async generate(source: string, target: string, variant: PageImageVariant) {
    try {
      await fs.access(target);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const image = sharp(source);
      if (variant === 'preview')
        image.resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true });
      await image
        .webp(variant === 'detail' ? { lossless: true, effort: 4 } : { quality: 90, effort: 4 })
        .toFile(temporary);
      await fs.rename(temporary, target);
      return target;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
}
