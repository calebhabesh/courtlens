import type { BrowserContext } from "@playwright/test";

/** Accounts plan: Ask needs an account; Ask specs start signed in to the mock's demo session. */
export async function signInForAsk(context: BrowserContext, baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100") {
  await context.addCookies([{ name: "courtlens-session", value: "mock.u-demo.ask", url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}
