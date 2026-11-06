import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'precompress-assets',
      transformIndexHtml: {
        order: 'post',
        handler(_html, context) {
          const app = Object.values(context.bundle ?? {}).find(
            (item) => item.type === 'chunk' && item.name === 'App',
          );
          if (!app) return [];
          const review = Object.values(context.bundle ?? {}).find(
            (item) => item.type === 'chunk' && item.name === 'Review',
          );
          const richText = Object.values(context.bundle ?? {}).find(
            (item) => item.type === 'chunk' && item.name === 'RichText',
          );
          const styles = Object.keys(context.bundle ?? {}).filter((name) =>
            /(Review|RichText).*\.css$/.test(name),
          );
          const fonts = Object.keys(context.bundle ?? {}).filter((name) =>
            /KaTeX_(Main-Regular|Math-Italic|AMS-Regular).*\.woff2$/.test(name),
          );
          return [
            {
              tag: 'script',
              injectTo: 'head-prepend',
              children: `(()=>{const m=location.hash.match(/^#\\/workspace\\/([a-zA-Z0-9-]+)$/);const add=(rel,href,as)=>{const l=document.createElement('link');l.rel=rel;l.href=href;if(as)l.as=as;if(as==='font'){l.type='font/woff2';l.crossOrigin='anonymous';}document.head.appendChild(l);};add('modulepreload',${JSON.stringify('/' + app.fileName)});if(!m)return;fetch('/api/workspaces/'+m[1]+'/readiness').then(r=>r.ok?r.json():null).then(v=>{if(!v?.reviewReady)return;add('modulepreload',${JSON.stringify('/' + review?.fileName)});add('modulepreload',${JSON.stringify('/' + richText?.fileName)});${JSON.stringify(styles)}.forEach(s=>add('stylesheet','/'+s));${JSON.stringify(fonts)}.forEach(s=>add('preload','/'+s,'font'));}).catch(()=>{});})()`,
            },
          ];
        },
      },
      async closeBundle() {
        const directory = fileURLToPath(new URL('./dist/assets', import.meta.url));
        for (const name of await fs.readdir(directory)) {
          if (!/\.(js|css)$/.test(name)) continue;
          const file = path.join(directory, name);
          await fs.writeFile(
            file + '.br',
            brotliCompressSync(await fs.readFile(file), {
              params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
            }),
          );
        }
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:5002' } },
});
