import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { randomUUID } from 'node:crypto';

const buildId = randomUUID();

export default defineConfig({
  define: { __ILIOS_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), {
    name: 'ilios-version',
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ buildId }));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
    },
  }],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('@tanstack/react-query') ||
            id.includes('@tanstack/react-query-persist-client') ||
            id.includes('@tanstack/query-sync-storage-persister')
          ) {
            return 'react_vendor';
          }
          if (id.includes('/recharts/')) return 'charts_vendor';
          if (id.includes('/pdfjs-dist/')) return 'pdf_vendor';
          if (id.includes('/html2canvas/') || id.includes('/jsbarcode/') || id.includes('/qrcode/')) return 'print_vendor';
          if (id.includes('@supabase/supabase-js') || id.includes('/appwrite/') || id.includes('@google/genai')) {
            return 'backend_vendor';
          }
        }
      }
    }
  }
});
