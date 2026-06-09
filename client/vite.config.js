import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The client lives in client/, but shared/ sits a level up. We expose it via an
// alias so both browser and server import the exact same modules.
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    // In dev, proxy Socket.IO traffic to the Node server so the client can use
    // a same-origin connection (io() with no URL).
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
