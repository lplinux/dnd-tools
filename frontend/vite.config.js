import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite configuration for dnd-tools frontend.
 *
 * Dev mode  : runs on :5173, proxies /api/* and legacy page routes to Express (:3080)
 * Build mode: outputs to dist/ (Dockerfile copies this into public/app/ in the image)
 *
 * The `@/` alias maps to `src/` so you can write:
 *   import { Button } from '@/components/ui'
 * instead of relative paths.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      // All API calls go to Express
      '/api': { target: 'http://localhost:3080', changeOrigin: true },
      // PDFs are files on the Express host, not routes in the SPA.
      '/pdfs': { target: 'http://localhost:3080', changeOrigin: true },
      // NOTE: /timeline-public, /journey-map-public and /pc-public are NOT
      // proxied. They used to be, for a LegacyIframe bridge that no longer
      // exists — and proxying them actively broke dev deep-linking, since they
      // are React routes (App.jsx) that Vite must serve itself.
    },
  },

  test: {
    // The suite covers pure modules — calendar maths, road-network distances,
    // SRD payload flattening — so no DOM is needed and `node` keeps it fast.
    // Add `environment: 'jsdom'` (and the dependency) if component tests arrive.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },

  build: {
    // Build straight into the folder Express serves (app.js reads
    // public/app/index.html to decide the SPA is present), so that
    //   cd frontend && npm run build && node app.js
    // actually works. Previously this wrote to frontend/dist and nothing
    // outside Docker copied it across, so a local `node app.js` served a
    // stale fallback page and 404'd every React route.
    // public/app/ is gitignored; emptyOutDir is explicit because the target
    // sits outside Vite's root and it would otherwise prompt.
    outDir: path.resolve(__dirname, '../public/app'),
    emptyOutDir: true,
  },
});
