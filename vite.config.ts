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
  },
});
