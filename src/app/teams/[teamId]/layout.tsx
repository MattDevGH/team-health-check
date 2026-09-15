/**
 * Layout for the team segment.
 * Requirements: Manager Experience 1.1, 1.7; Feeling Responsive 1.1, 2.1
 *
 * Everything under /teams/[teamId] — dashboard, settings, audit log — is
 * authenticated, so the navigation shell is mounted here. Mounting by segment
 * rather than by a runtime check inside the shell means an unauthenticated
 * route cannot render it by accident: it is not in this tree.
 *
 * A Server Component, so the member's team and roles are resolved before the
 * HTML is sent. The shell used to fetch them after hydration, which cost a
 * round trip on every page and made the menu arrive in two pieces.
 *
 * The shell owns the page's single `main` landmark; pages inside it render
 * their content without one.
 */

import { AppShell } from '@/components/app-shell';
import { currentShellContext } from '@/lib/auth/shell-context.server';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const context = await currentShellContext();

  return <AppShell context={context}>{children}</AppShell>;
}
