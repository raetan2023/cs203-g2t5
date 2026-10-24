import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate build: the production entry and configuration remain unchanged.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, open: '/oris.html' },
  build: { outDir: 'dist-oris', rollupOptions: { input: 'oris.html' } },
});
