import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the frontend talks to the Express backend through this proxy,
// so VITE_API_BASE_URL can stay empty and every request is same-origin.
export default defineConfig({
  plugins: [react()],
  // Pin the entry explicitly. Without it, a dev-server restart (triggered by an
  // .env change) can fail to re-resolve index.html, leaving a stale dependency
  // cache that breaks the JSX runtime with "React is not defined".
  optimizeDeps: { entries: 'index.html' },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
