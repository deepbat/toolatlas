import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ToolAtlas is published to https://deepbat.github.io/toolatlas/
// Override with BASE_PATH=/ when serving from a domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/toolatlas/',
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // The on-demand Office painter pulls in pdfkit and its shaping stack;
        // keeping fontkit in its own chunk holds every chunk under the 600 kB
        // budget while both load in parallel when a conversion starts.
        manualChunks(id: string) {
          if (/node_modules\/(fontkit|unicode-trie|dfa|brotli)\//.test(id)) return 'fontkit';
          return undefined;
        },
      },
    },
  },
});
