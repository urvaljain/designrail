import { defineConfig } from "@playwright/test";

const PORT = 3100;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://evident:evident@127.0.0.1:5432/evident_e2e";

/** End-to-end tests run against a production build (`npm run build` first) and a dedicated database. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "off" },
  webServer: {
    command: "sh tests/e2e/prepare.sh",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), DATABASE_URL, APP_URL: `http://127.0.0.1:${PORT}`, LLM_PROVIDER: "none", ENABLE_DEMO_SOURCE: "true", JOB_SOURCES: "" },
  },
});
