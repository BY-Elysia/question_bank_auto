import type { ExtractionSettings } from './workspace.js';
import { fail } from '../../../shared/errors.js';
export function partition(settings: ExtractionSettings, total: number) {
  if (settings.mode === 'sequential') {
    if (settings.chapters.length) fail(400, 'Chapter groups are only valid in chapters mode');
    return [Array.from({ length: total }, (_, i) => i + 1)];
  }
  if (settings.chapters.length < 2) fail(400, 'Parallel chapter mode requires at least two groups');
  const groups = settings.chapters.map((c) => c.pages);
  const selected = groups.flat();
  if (
    selected.length !== total ||
    new Set(selected).size !== total ||
    selected.some((n) => n < 1 || n > total)
  )
    fail(
      400,
      'Assign every image to exactly one chapter; duplicates and missing images are not allowed',
    );
  for (const pages of groups)
    if (pages.some((n, i) => i > 0 && n <= pages[i - 1]!))
      fail(400, 'Images in each chapter must follow workspace page order');
  return groups;
}
