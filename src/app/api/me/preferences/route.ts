/**
 * PATCH /api/me/preferences — Update cadence preference and/or reminders
 *
 * Requirements: 15.1, 15.2
 * Thin route handler: validate input, update member preferences.
 */

import { withErrorHandling } from '@/lib/api-utils';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';

const repos = createInMemoryRepositories();
const container = createContainer(repos);

export { repos as _repos, container as _container };

const VALID_CADENCES = ['session', 'micro_pulse'] as const;

export const PATCH = withErrorHandling(async (request: Request) => {
  const memberId = request.headers.get('x-member-id');
  if (!memberId) {
    throw new ValidationError([
      { field: 'x-member-id', message: 'Missing member ID header', code: 'MISSING_HEADER' },
    ]);
  }

  const member = await repos.teamMember.findById(memberId);
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

  const updated = await repos.teamMember.update(memberId, updates);
  return Response.json(updated);
});
