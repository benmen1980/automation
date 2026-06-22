import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api and /webhooks to the backend (default
// http://localhost:3000) so the dashboard can be run with just
// VITE_API_URL unset and same-origin relative fetches during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
      '/webhooks': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
      '/health': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
    },
  },
});
