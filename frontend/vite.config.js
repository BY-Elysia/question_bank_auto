import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
      '/output_images': 'http://127.0.0.1:5000',
      '/read_results': 'http://127.0.0.1:5000',
    },
  },
})
