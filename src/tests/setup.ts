/**
 * Setup for tests that render something.
 *
 * Requirements: Feeling Responsive 5.x
 *
 * The node half is imported rather than repeated: this file is the DOM
 * additions and nothing else, so the two setups cannot drift into disagreeing
 * about how requests are mocked.
 */

import './setup-node';

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmounting between tests, so a component left on the page cannot be found by
// the next test and pass it
afterEach(() => {
  cleanup();
});
