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
  const destinations: Destination[] = [];

  if (context?.team) {
    destinations.push(
      { href: `/teams/${context.team.id}/dashboard`, label: 'Dashboard' },
      { href: `/teams/${context.team.id}/settings`, label: 'Settings' },
    );

    if (context.roles.includes(DELIVERY_MANAGER)) {
      destinations.push({ href: `/teams/${context.team.id}/audit-log`, label: 'Audit log' });
    }
  }

  destinations.push({ href: '/me', label: 'Profile' });

  return destinations;
}
