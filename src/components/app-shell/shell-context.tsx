'use client';

/**
 * The signed-in member's context, shared with the pages inside the shell.
 *
 * Requirements: Feeling Responsive 1.2, 1.3
 *
 * A layout cannot pass props to the page it wraps, so the resolved context
 * reaches pages through a context rather than an argument. The alternative was
 * the page fetching `/api/me` for itself, which is what it did — five database
 * queries to answer a question the layout had already answered.
 *
 * **The default is null, and that is load-bearing.** A page rendered outside
 * this provider — in a test, or under a layout that does not mount the shell —
 * reads no context and offers no role-gated controls, which is exactly what it
 * did when its own fetch failed. Requirement 1.3 exists because the duplicate
 * fetch was defended on the grounds that a page should stand on its own, and
 * that defence was sound.
 */

import { createContext, useContext } from 'react';

import type { ShellContext } from './destinations';

const MemberContext = createContext<ShellContext | null>(null);

export function ShellContextProvider({
  context,
  children,
}: {
  context: ShellContext | null;
  children: React.ReactNode;
}) {
  return <MemberContext.Provider value={context}>{children}</MemberContext.Provider>;
}

/**
 * The member's team and roles, or null where they are not known.
 *
 * Null is not an error. It means this page is rendering without a shell around
 * it, and a page that cannot read roles simply offers no controls behind them.
 */
export function useShellContext(): ShellContext | null {
  return useContext(MemberContext);
}

/** Whether the signed-in member may use Delivery-Manager-only controls. */
export function useCanManage(): boolean {
  const context = useShellContext();
  return context?.roles.includes('delivery_manager') ?? false;
}
