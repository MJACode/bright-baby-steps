import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Fixtures across the suite are written as UTC instants and asserted as
    // wall-clock times ("3:40 PM", a 20:00 night boundary), so the runner's own
    // zone has to be fixed or the same suite passes locally and fails in CI.
    // The DST tests set `process.env.TZ` themselves and restore it.
    env: { TZ: "UTC" },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
