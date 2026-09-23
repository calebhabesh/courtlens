import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    headless: true,
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined
  },
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      port: 4100,
      reuseExistingServer: false
    },
    {
      command:
        "COURTLOAD_API_INTERNAL_URL=http://localhost:4100 NEXT_PUBLIC_COURTLOAD_API_URL=http://localhost:4100 npm run dev -- -p 3100",
      port: 3100,
      reuseExistingServer: false
    }
  ]
});
