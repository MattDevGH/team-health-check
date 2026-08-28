/**
 * Layout for the team segment.
 * Requirements: Manager Experience 1.1, 1.7
 *
 * Everything under /teams/[teamId] — dashboard, settings, audit log — is
 * authenticated, so the navigation shell is mounted here. Mounting by segment
 * rather than by a runtime check inside the shell means an unauthenticated
 * route cannot render it by accident: it is not in this tree.
 *
 * The shell owns the page's single `main` landmark; pages inside it render
 * their content without one.
 */

import { AppShell } from '@/components/app-shell';

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
