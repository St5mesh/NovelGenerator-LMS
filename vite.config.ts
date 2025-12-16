import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.LM_STUDIO_URL': JSON.stringify(env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1'),
        'process.env.LM_STUDIO_MODEL': JSON.stringify(env.LM_STUDIO_MODEL || 'llama-3.1-instruct-13b')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
