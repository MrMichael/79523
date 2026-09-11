import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    { command: 'npx pnpm --filter @79523/server dev', port: 3000, cwd: '../..', reuseExistingServer: true },
    { command: 'npx pnpm --filter @79523/client dev', port: 5173, cwd: '../..', reuseExistingServer: true },
  ],
})
