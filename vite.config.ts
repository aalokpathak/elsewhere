import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the build portable: it works from a domain root
// (Cloudflare Pages) and from a GitHub Pages project sub-path alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // three.js changes rarely; a separate chunk caches well across deploys.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
