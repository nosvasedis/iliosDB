import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
