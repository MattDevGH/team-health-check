import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// This creates a mock server that intercepts fetch() calls during tests.
// It runs in Node (not a real HTTP server) — zero network traffic.
export const server = setupServer(...handlers);
