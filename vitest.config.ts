import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: 'mongodb://placeholder/test',
      JWT_ACCESS_SECRET: 'test-access-secret-min-32-chars-xxxxxxxxxxxx',
      JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars-xxxxxxxxxxx',
      APP_TIMEZONE: 'Asia/Dhaka',
    },
  },
});
