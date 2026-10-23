import fs from 'node:fs/promises';

// Keep runtime output free of modules removed or renamed since the last build.
await fs.rm(new URL('../dist/app/', import.meta.url), { recursive: true, force: true });
