/**
 * Auth Helper for route handlers.
 * Validates session cookies against the UserSession repository.
 *
 * Uses factory pattern for dependency injection — services depend on
 * repository interfaces, never on Prisma directly.
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.8
 */
import { NextRequest } from 'next/server';

import type { UserSessionRepository } from '@/lib/repositories/types';

export interface AuthContext {
  memberId: string;
}

export interface GetAuthContextDeps {
  userSessionRepo: UserSessionRepository;
}

/**
 * Factory: creates a getAuthContext function that extracts and validates
 * the session cookie from an incoming request.
 *
 * Returns the authenticated context or null if invalid/missing.
 */
export function createGetAuthContext(deps: GetAuthContextDeps) {
  return async function getAuthContext(request: NextRequest): Promise<AuthContext | null> {
    const sessionToken = request.cookies.get('session')?.value;
    if (!sessionToken) return null;

    const session = await deps.userSessionRepo.findByToken(sessionToken);
    if (!session) return null;
    if (session.expiresAt < new Date()) return null;

    return { memberId: session.memberId };
  };
}

export interface WithAuthDeps {
  getAuthContext: (request: NextRequest) => Promise<AuthContext | null>;
}

/**
 * Factory: creates a withAuth higher-order function that enforces
 * authentication on a route handler. Injects AuthContext into the handler
 * or returns 401.
 */
export function createWithAuth(deps: WithAuthDeps) {
  return function withAuth(
    handler: (
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
      auth: AuthContext,
    ) => Promise<Response>,
  ) {
    return async (
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
    ): Promise<Response> => {
      const auth = await deps.getAuthContext(request);
      if (!auth) {
        return Response.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 },
        );
      }
      return handler(request, context, auth);
    };
  };
}
