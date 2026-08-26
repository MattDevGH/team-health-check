import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",       // simulates a browser DOM in Node
    globals: true,              // no need to import describe/it/expect in every file
    setupFiles: ["./src/tests/setup.ts"], // runs before every test file
    exclude: ["node_modules", "e2e"],     // Playwright tests run separately via `npm run test:e2e`
  },
});
