import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { defineConfig } from 'vite';
import { apiRouter } from './src/apiHandlers.js';

export default defineConfig(() => {
  const apiApp = express();
  apiApp.use(cors());
  apiApp.use(express.json());
  apiApp.use(apiRouter);

  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'express-api-middleware',
        configureServer(server) {
          server.middlewares.use(apiApp);
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
