/**
 * Setup for tests that need no DOM.
 *
 * Requirements: Feeling Responsive 5.x (the suite is a tool people wait on)
 *
 * Everything here is what a route test, a service test or a property test
 * needs: the request mocks, and the production container replaced by in-memory
 * repositories. Nothing here touches a document.
 *
 * `setup.ts` imports this file and adds the DOM half on top, so the node setup
 * is a strict subset by construction rather than by two lists staying in step.
 */

import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { server } from './mocks/server';

/**
 * Auto-mock the production container module so all route handler tests
 * use in-memory repositories instead of the real Prisma/SQLite backend.
 * The mock is defined in src/lib/__mocks__/container-production.ts
 */
vi.mock('@/lib/container-production');

// Start the mock server before all tests in a file
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// An unreset handler leaks one test's stubbed server into the next
afterEach(() => {
  server.resetHandlers();
});

// Shut down the mock server after all tests in a file
afterAll(() => server.close());
