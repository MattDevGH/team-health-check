/**
 * Contract test: where the navigation shell is mounted.
 * Requirements: Manager Experience 1.1, 1.7
 *
 * Requirement 1.7 is a claim about every route, not only the ones a test
 * happens to visit. Rendering a page component in jsdom never composes its
 * layouts, so a page test asserting "no navigation" would pass whether or not
 * a shell wraps that route in production — a vacuous green.
 *
 * This scans the route tree instead. The shell is mounted by segment layouts,
 * so the set of layouts that reference it *is* the set of routes that get it.
 *
 * Follows the same pattern as the identity-header contract test: assert a
 * property of the sources that a unit test structurally cannot reach.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../app');

/** Every layout.tsx under src/app, as a path relative to src/app. */
function findLayouts(dir: string, prefix = ''): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      found.push(...findLayouts(path.join(dir, entry.name), relative));
    } else if (entry.name === 'layout.tsx') {
      found.push(relative);
    }
  }

  return found;
}

function referencesShell(relativePath: string): boolean {
  const source = readFileSync(path.join(APP_DIR, relativePath), 'utf8');
  return source.includes('AppShell');
}

describe('navigation shell mounting', () => {
  const layouts = findLayouts(APP_DIR);

  it('is mounted by exactly the authenticated segments', () => {
    const mounting = layouts.filter(referencesShell).sort();

    expect(mounting).toEqual(['me/layout.tsx', 'teams/[teamId]/layout.tsx']);
  });

  it('is not mounted by the root layout, which also wraps sign-in and feedback', () => {
    // The root layout wraps /, /auth/*, and /session/[token]. Mounting the
    // shell there would offer team destinations to someone who has not signed
    // in, and to a member answering a health check through a session link.
    expect(referencesShell('layout.tsx')).toBe(false);
  });

  it('leaves the unauthenticated segments without a layout of their own', () => {
    const unauthenticated = layouts.filter(
      (layout) =>
        layout.startsWith('auth/') || layout.startsWith('session/') || layout.startsWith('api/'),
    );

    expect(unauthenticated).toEqual([]);
  });
});
