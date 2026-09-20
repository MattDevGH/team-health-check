import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /*
   * Path aliases resolved by Vite itself rather than by `vite-tsconfig-paths`.
   *
   * Vite 8 does this natively, and every test run printed a notice saying so.
   * Adopted as part of the Vitest 5 upgrade: one fewer dependency in the path
   * that resolves `@/` for 2,222 tests, and one fewer line of noise above every
   * result.
   */
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",       // simulates a browser DOM in Node
    globals: true,              // no need to import describe/it/expect in every file
    setupFiles: ["./src/tests/setup.ts"], // runs before every test file
    exclude: ["node_modules", "e2e"],     // Playwright tests run separately via `npm run test:e2e`
  },
});
