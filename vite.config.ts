import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /oxy8/. Dev and preview use the same path: http://localhost:5173/oxy8/
export default defineConfig({
  base: '/oxy8/',
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
