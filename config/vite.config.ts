import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig({
  root: path.join(projectRoot, 'src/renderer'),
  publicDir: path.join(projectRoot, 'assets/public'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.join(projectRoot, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [projectRoot] },
  },
});
