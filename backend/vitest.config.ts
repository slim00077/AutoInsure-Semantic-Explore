import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false, // les tests partagent un même triple store de test
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      SEMANTIC_URL: "http://127.0.0.1:8101",
      LOG_LEVEL: "error",
      DATA_DIR: "../data/.test-backend",
    },
  },
});
