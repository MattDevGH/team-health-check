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
 * The example-based tests in `app-shell.test.tsx` prove the rendered shell
 * honours this decision. This exercises the decision itself, across the role
 * names nobody writes an example for: unknown roles, names containing
 * "delivery_manager" as a substring, duplicates, and the empty set. A gate
 * written as a substring match or a truthiness check on the array passes every
 * example test in the suite and fails here.
 *
 * It used to drive the whole component and wait on a fetch per run, which made
 * a hundred runs slower than the test timeout once the suite grew. Testing the
 * pure function is both faster and a better fit for what the property claims.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { destinationsFor, DELIVERY_MANAGER } from './destinations';

const TEAM = { id: 'team-1', name: 'Platform Squad' };

/**
 * Role names, weighted towards the ones that can actually break the gate: the
 * real role, the other real role, and near-misses that a substring or
 * case-insensitive comparison would wrongly accept.
 */
const roleArb = fc.oneof(
  fc.constant(DELIVERY_MANAGER),
  fc.constant('contributor'),
  fc.constant('delivery_manager_deputy'),
  fc.constant('deputy_delivery_manager'),
  fc.constant('DELIVERY_MANAGER'),
  fc.stringMatching(/^[a-z_]{3,15}$/),
);

const rolesArb = fc.array(roleArb, { maxLength: 6 });

function labels(roles: string[]): string[] {
  return destinationsFor({ team: TEAM, roles }).map(destination => destination.label);
}

describe('Property 1: Delivery-Manager-only destinations', () => {
  it('offers the audit log if and only if the roles contain delivery_manager', () => {
    fc.assert(
      fc.property(rolesArb, roles => {
        expect(labels(roles).includes('Audit log')).toBe(roles.includes(DELIVERY_MANAGER));
      }),
    );
  });

  it('offers every member the same destinations regardless of role', () => {
    fc.assert(
      fc.property(rolesArb, roles => {
        const offered = labels(roles);

        // Whatever else changes, a member never loses their own dashboard,
        // their team's settings, or their profile
        expect(offered).toEqual(expect.arrayContaining(['Dashboard', 'Settings', 'Profile']));
      }),
    );
  });

  it('offers no team-scoped destination until the team is known', () => {
    fc.assert(
      fc.property(rolesArb, roles => {
        // The in-flight state: a guessed team id produces links that 404
        expect(destinationsFor({ team: null, roles }).map(d => d.label)).toEqual(['Profile']);
      }),
    );
  });

  it('builds every team-scoped link from the team it was given', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^team-[a-z0-9]{4,10}$/), rolesArb, (teamId, roles) => {
        const teamScoped = destinationsFor({ team: { id: teamId, name: 'Any' }, roles }).filter(
          destination => destination.href.startsWith('/teams/'),
        );

        for (const destination of teamScoped) {
          expect(destination.href.startsWith(`/teams/${teamId}/`)).toBe(true);
        }
      }),
    );
  });
});
