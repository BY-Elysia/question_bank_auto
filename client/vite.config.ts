import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'precompress-assets',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const app = Object.values(context.bundle ?? {}).find(item => item.type === 'chunk' && item.name === 'App');
        if (!app) return [];
        return [{ tag: 'script', injectTo: 'head', children:
          `if(location.hash.startsWith('#/workspace/')){const l=document.createElement('link');l.rel='modulepreload';l.href=${JSON.stringify('/' + app.fileName)};document.head.appendChild(l);}` }];
      },
    },
    async closeBundle() {
      const directory = fileURLToPath(new URL('./dist/assets', import.meta.url));
      for (const name of await fs.readdir(directory)) {
        if (!/\.(js|css)$/.test(name)) continue;
        const file = path.join(directory, name);
        await fs.writeFile(file + '.br', brotliCompressSync(await fs.readFile(file), {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }));
      }
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:5002' } },
});
