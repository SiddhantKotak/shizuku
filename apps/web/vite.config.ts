import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      routeFileIgnorePrefix: '-',
      quoteStyle: 'single',
    }),
    react(),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Phaser is huge — only needed on /room
          phaser: ['phaser', 'easystarjs'],
          // PDF.js is also large — only on /reader
          pdf: ['pdfjs-dist'],
          // GSAP into its own chunk
          gsap: ['gsap', '@gsap/react'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['phaser'], // pre-bundling Phaser is slow and unneeded
  },
});
