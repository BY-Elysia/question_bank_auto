import fs from 'node:fs/promises';
await fs.rm(new URL('../dist/app/', import.meta.url), { recursive: true, force: true });
