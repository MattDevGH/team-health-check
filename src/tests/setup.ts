import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

// Start the mock server before all tests in a file
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers and clean up the DOM after each test
afterEach(() => {
  server.resetHandlers();
  cleanup();
});

// Shut down the mock server after all tests in a file
afterAll(() => server.close());
