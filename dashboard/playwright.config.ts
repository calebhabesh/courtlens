import fs from "node:fs";
import { defineConfig } from "@playwright/test";

// Playwright forces color in its workers and web servers. Inheriting NO_COLOR
// as well makes Node emit a warning for every child process.
delete process.env.NO_COLOR;

const defaultChromiumPath = process.env.PW_CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    browserName: "chromium",
    headless: true,
    launchOptions: defaultChromiumPath
      ? { executablePath: defaultChromiumPath }
      : undefined
  },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : [
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
