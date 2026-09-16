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

  it('offers Settings if and only if the roles contain delivery_manager', () => {
    /*
     * Requirement 3.1. The nav offered Settings to everybody while every write
     * behind it is manager-only, so a contributor opened a page of controls
     * that would refuse them — the navigation advertising something it could
     * not deliver.
     *
     * The same shape of gate as the audit log, and the same property: a
     * substring match or a truthiness check on the array passes every example
     * test in the suite and fails here.
     */
    fc.assert(
      fc.property(rolesArb, roles => {
        expect(labels(roles).includes('Settings')).toBe(roles.includes(DELIVERY_MANAGER));
      }),
    );
  });

  it('offers the dashboard whatever the roles are', () => {
    /*
     * Requirement 3.2, and the decision that was revised during the discussion.
     * The dashboard's data is aggregate and anonymised, and a team should be
     * able to read its own results — hiding it would make transparency depend
     * on a role, which is the opposite of what the tool is for.
     *
     * It already gates its Delivery-Manager controls by role, with a browser
     * test proving a contributor sees no open or close controls.
     */
    fc.assert(
      fc.property(rolesArb, roles => {
        expect(labels(roles)).toEqual(expect.arrayContaining(['Dashboard', 'Profile']));
      }),
    );
  });

  it('never leaves a member with nothing they can act on', () => {
    // Two destinations need no role at all: their own health check, which is
    // what the tool is for, and their own profile
    fc.assert(
      fc.property(rolesArb, roles => {
        expect(labels(roles)).toEqual(expect.arrayContaining(['Health check', 'Profile']));
      }),
    );
  });

  it('offers no team-scoped destination until the team is known', () => {
    fc.assert(
      fc.property(rolesArb, roles => {
        // The in-flight state: a guessed team id produces links that 404.
        //
        // Asserts the absence of team-scoped links rather than an exact list,
        // which is what the name claims. The exact-list form broke when a
        // destination needing no team id was added — and it was right to be
        // added, so the property was over-specified rather than the change
        // wrong.
        const hrefs = destinationsFor({ team: null, roles }).map(d => d.href);

        expect(hrefs.filter(href => href.startsWith('/teams/'))).toEqual([]);
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

/**
 * The health check is a destination in its own right.
 *
 * Requirements: Reaching Your Health Check 1.2, 1.5
 *
 * A contributor's journey never touches the dashboard: they arrive from a
 * prompt, answer, and leave. When production opened a check on 2026-09-14 and
 * no prompt could reach anyone, there was nowhere for them to go — and nowhere
 * for the delivery manager either.
 *
 * Unlike every other destination this one needs no team id, so it survives the
 * in-flight state where a guessed id would produce links that 404.
 */
describe('the health check destination', () => {
  const team = { id: 'team-1', name: 'Platform' };

  it('is offered to a contributor', () => {
    const hrefs = destinationsFor({ team, roles: [] }).map(d => d.href);

    expect(hrefs).toContain('/me/health-check');
  });

  it('is offered to a delivery manager too', () => {
    const hrefs = destinationsFor({ team, roles: [DELIVERY_MANAGER] }).map(d => d.href);

    expect(hrefs).toContain('/me/health-check');
  });

  it('is offered before the team is known, since it needs no team id', () => {
    // The loading state. Every other destination waits because a guessed team
    // id 404s; this one has nothing to guess.
    const hrefs = destinationsFor(null).map(d => d.href);

    expect(hrefs).toContain('/me/health-check');
  });

  it('is the first thing offered, because it is the thing the tool is for', () => {
    const [first] = destinationsFor({ team, roles: [DELIVERY_MANAGER] });

    expect(first.href).toBe('/me/health-check');
  });

  it('is named for what it does rather than where it goes', () => {
    const entry = destinationsFor({ team, roles: [] }).find(d => d.href === '/me/health-check');

    expect(entry?.label).toMatch(/health check/i);
  });
});
