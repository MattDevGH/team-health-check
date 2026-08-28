/**
 * Property Tests for the navigation shell's role gating.
 *
 * Feature: manager-experience, Property 1: Delivery-Manager-only destinations
 *
 * **Validates: Requirement 1.3**
 *
 * For any set of roles returned by GET /api/me, a Delivery-Manager-only
 * destination is offered if and only if that set contains `delivery_manager`.
 *
 * The example-based tests cover the two roles this product assigns today. This
 * property covers the ones it does not: unknown roles, roles whose names
 * contain "delivery_manager" as a substring, duplicates, and the empty set. A
 * gate written as a substring match or a truthiness check on the array passes
 * every example test in the suite and fails here.
 */

import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const MANAGER = 'delivery_manager';

/**
 * Role names, weighted towards the ones that can actually break the gate:
 * the real role, the other real role, and near-misses that a substring or
 * case-insensitive comparison would wrongly accept.
 */
const roleArb = fc.oneof(
  fc.constant(MANAGER),
  fc.constant('contributor'),
  fc.constant('delivery_manager_deputy'),
  fc.constant('deputy_delivery_manager'),
  fc.constant('DELIVERY_MANAGER'),
  fc.stringMatching(/^[a-z_]{3,15}$/),
);

describe('Property 1: Delivery-Manager-only destinations', () => {
  it('offers the audit log if and only if the roles contain delivery_manager', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(roleArb, { maxLength: 6 }), async (roles) => {
        server.resetHandlers();
        server.use(
          http.get('/api/me', () =>
            HttpResponse.json({
              id: 'member-1',
              teamId: 'team-1',
              name: 'Alice',
              slackLink: null,
              team: { id: 'team-1', name: 'Platform Squad' },
              roles,
            }),
          ),
        );

        try {
          render(
            <AppShell>
              <h1>Page content</h1>
            </AppShell>,
          );

          // Anchor on a destination every member gets, so an absence is
          // asserted against a rendered shell rather than an empty document
          await screen.findByRole('link', { name: /dashboard/i });

          const auditLog = screen.queryByRole('link', { name: /audit log/i });
          expect(auditLog !== null).toBe(roles.includes(MANAGER));
        } finally {
          cleanup();
        }
      }),
    );
  });
});
