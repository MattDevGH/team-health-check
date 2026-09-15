/**
 * Layout for the profile segment.
 * Requirements: Manager Experience 1.1, 1.7; Feeling Responsive 1.1, 2.1
 *
 * See the team segment layout for why the shell is mounted per segment rather
 * than by a runtime check, and why this resolves the member on the server.
 */

import { AppShell } from '@/components/app-shell';
import { currentShellContext } from '@/lib/auth/shell-context.server';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const context = await currentShellContext();

  return <AppShell context={context}>{children}</AppShell>;
}
