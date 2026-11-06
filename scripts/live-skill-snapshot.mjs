import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileSkillCatalog } from '../dist/app/ai/infrastructure/file-skill-catalog.js';
// Freeze the tested skill version: a concurrent build must not replace/delete its instructions.
export async function liveSkillSnapshot(root) {
  const directory = path.join(root, 'skill-snapshot');
  try {
    await fs.access(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.cp(new URL('../dist/app/ai/skills/', import.meta.url), directory, { recursive: true });
  }
  process.env.MODEL_TRACE ??= '1';
  return new FileSkillCatalog(pathToFileURL(directory + path.sep));
}
