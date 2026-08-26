/**
 * PATCH /api/me/preferences — Update cadence preference and/or reminders
 *
 * Requirements: 15.1, 15.2, 2.1, 2.4
 * Thin route handler: validate input, update member preferences.
 * Uses getAuthContext for cookie-based authentication (no x-member-id header).
 */

import { NextRequest } from 'next/server';

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { repos } from '@/lib/container-production';
import { createGetAuthContext } from '@/lib/auth/with-auth';

// Test seam: allows route tests to seed data via repos
export { repos as _repos };

// Wire auth at module level using production repos
const getAuthContext = createGetAuthContext({ userSessionRepo: repos.userSession });

const VALID_CADENCES = ['session', 'micro_pulse'] as const;

export const PATCH = withErrorHandling(async (request: Request) => {
  const auth = await getAuthContext(request as NextRequest);
  if (!auth) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const member = await repos.teamMember.findById(auth.memberId);
  if (!member) {
    throw new NotFoundError('Member not found');
  }

  const body = await request.json();
  const updates: Partial<{ cadencePreference: string; remindersEnabled: boolean }> = {};

  if (body.cadencePreference !== undefined) {
    if (!VALID_CADENCES.includes(body.cadencePreference)) {
      throw new ValidationError([
        {
          field: 'cadencePreference',
          message: `Cadence must be one of: ${VALID_CADENCES.join(', ')}`,
          code: 'INVALID_CADENCE',
        },
      ]);
    }
    updates.cadencePreference = body.cadencePreference;
  }

  if (body.remindersEnabled !== undefined) {
    if (typeof body.remindersEnabled !== 'boolean') {
      throw new ValidationError([
        {
          field: 'remindersEnabled',
          message: 'remindersEnabled must be a boolean',
          code: 'INVALID_TYPE',
        },
      ]);
    }
    updates.remindersEnabled = body.remindersEnabled;
  }

  const updated = await repos.teamMember.update(auth.memberId, updates);
  return Response.json(updated);
});
