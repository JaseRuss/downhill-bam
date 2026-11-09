import { defineConfig } from 'vite';
export default defineConfig({
  // relative asset paths, so the build works from any folder (e.g. GitHub Pages at /downhill-bam/)
  base: './',
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
});
