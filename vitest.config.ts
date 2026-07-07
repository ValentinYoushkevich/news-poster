import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['dotenv/config'],
    fileParallelism: false,
    hookTimeout: 30000,
  },
})
