import fs from 'node:fs/promises';
import { z } from 'zod';
import type { SkillCatalog } from '../ports/skill-catalog.js';
const Package = z.object({
  id: z.string(),
  version: z.string().min(1),
  modelRole: z.enum(['vision', 'reasoning']),
});
export class FileSkillCatalog implements SkillCatalog {
  constructor(private root = new URL('../skills/', import.meta.url)) {}
  async get(id: string) {
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(id)) throw new Error('Invalid skill ID');
    const base = new URL(`${id}/`, this.root);
    const definition = Package.parse(
      JSON.parse(await fs.readFile(new URL('definition.json', base), 'utf8')),
    );
    const instructions = await fs.readFile(new URL('SKILL.md', base), 'utf8');
    if (definition.id !== id || !instructions.includes(`name: ${id}\n`))
      throw new Error('Invalid skill package');
    return { ...definition, instructions };
  }
}
