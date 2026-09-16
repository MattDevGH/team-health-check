/**
 * Which destinations the navigation shell offers.
 * Requirements: Manager Experience 1.1, 1.3
 *
 * Kept apart from the component so the rule can be exercised directly. It was
 * previously reached only by rendering the shell and waiting on a fetch, which
 * made a hundred property runs take longer than the test timeout once the suite
 * grew — a property about a pure decision should not cost a render each time.
 */

/** The role that gates destinations a member would otherwise be refused. */
export const DELIVERY_MANAGER = 'delivery_manager';

export interface Destination {
  href: string;
  label: string;
}

export interface ShellContext {
  team: { id: string; name: string } | null;
  roles: string[];
}

/**
 * The destinations this member can actually reach.
 *
 * A null context is the in-flight state: the team id is not yet known, and a
 * guessed one would produce links that 404. The audit log is the only
 * Delivery-Manager-only read in the API, so it is the only role-gated entry
 * here; every other manager-gated route is a write behind a control on a page
 * both roles can open.
 */
export function destinationsFor(context: ShellContext | null): Destination[] {
  /*
   * The health check comes first, and needs no team id.
   *
   * First because it is the thing the tool is for, and because a
   * contributor’s journey never touches the dashboard — they arrive from a
   * prompt, answer, and leave. When a check opened on 2026-09-14 and no
   * prompt reached anyone, there was nowhere for them to go.
   *
   * Offered even in the in-flight state, unlike every other destination:
   * those wait for the team because a guessed id produces links that 404,
   * and this one has nothing to guess.
   */
  const destinations: Destination[] = [{ href: '/me/health-check', label: 'Health check' }];

  if (context?.team) {
    /*
     * The dashboard, for everybody.
     *
     * Revised during the discussion and rightly: its data is aggregate and
     * anonymised, and a team should be able to read its own results. Hiding it
     * would make transparency depend on a role, which is the opposite of what
     * the tool is for. It already gates its Delivery-Manager controls by role,
     * with a browser test proving a contributor sees no open or close control.
     */
    destinations.push({ href: `/teams/${context.team.id}/dashboard`, label: 'Dashboard' });

    if (context.roles.includes(DELIVERY_MANAGER)) {
      /*
       * Settings and the audit log, for a Delivery Manager only.
       *
       * Settings was offered to everybody while every write behind it is
       * manager-only, so a contributor opened a page of controls that would
       * refuse them — the navigation advertising something it could not
       * deliver. The audit log is the only Delivery-Manager-only *read* in the
       * API.
       *
       * Removing the links is honest, not a boundary. Navigation is not
       * authorisation: a contributor who types either URL sees exactly what
       * they saw before, and the routes are unchanged.
       */
      destinations.push(
        { href: `/teams/${context.team.id}/settings`, label: 'Settings' },
        { href: `/teams/${context.team.id}/audit-log`, label: 'Audit log' },
      );
    }
  }

  destinations.push({ href: '/me', label: 'Profile' });

  return destinations;
}
