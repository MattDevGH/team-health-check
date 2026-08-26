import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./mocks/server";

/**
 * Auto-mock the production container module so all route handler tests
 * use in-memory repositories instead of the real Prisma/SQLite backend.
 * The mock is defined in src/lib/__mocks__/container-production.ts
 */
vi.mock('@/lib/container-production');

// Start the mock server before all tests in a file
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers and clean up the DOM after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
});

// Shut down the mock server after all tests in a file
afterAll(() => server.close());
