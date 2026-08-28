/**
 * Layout for the profile segment.
 * Requirements: Manager Experience 1.1, 1.7
 *
 * See the team segment layout for why the shell is mounted per segment rather
 * than by a runtime check.
 */

import { AppShell } from '@/components/app-shell';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
