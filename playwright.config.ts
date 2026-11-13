// playwright.config.ts — the ROOT test tree. @playwright/test only.
// smoke: boots the sidecar binary against a live stub target and proves
// the verdict transitions on the wire (down → up → down).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { trace: "on-first-retry" },
  projects: [{ name: "smoke", testMatch: "**/smoke/*.spec.ts" }],
});
