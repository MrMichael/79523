import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // Keep vitest's own defaults (dist, .git, …): replacing `exclude` wholesale let stray files
    // from a scratch directory get collected and run as tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
} as any)
