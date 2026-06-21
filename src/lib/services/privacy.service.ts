/**
 * Privacy mode management service.
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.8
 */

import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { TeamRepository, AuditLogRepository } from '@/lib/repositories/types';

export type PrivacyMode = 'anonymous' | 'attributed';

export interface PrivacyServiceDeps {
  teamRepo: TeamRepository;
  auditLogRepo: AuditLogRepository;
}

export interface PrivacyService {
  getMode(teamId: string): Promise<PrivacyMode>;
  switchMode(teamId: string, newMode: PrivacyMode, userId: string, confirmed: boolean): Promise<void>;
}

/**
 * Factory function for creating the privacy service.
 */
export function createPrivacyService(deps: PrivacyServiceDeps): PrivacyService {
  const { teamRepo, auditLogRepo } = deps;

  async function getMode(teamId: string): Promise<PrivacyMode> {
    const team = await teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }
    return (team.privacyMode ?? 'anonymous') as PrivacyMode;
  }

  async function switchMode(
    teamId: string,
    newMode: PrivacyMode,
    userId: string,
    confirmed: boolean
  ): Promise<void> {
    const team = await teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const currentMode = (team.privacyMode ?? 'anonymous') as PrivacyMode;

    // No-op if mode is already the same
    if (currentMode === newMode) {
      return;
    }

    // Switching to attributed requires explicit confirmation (Req 14.4)
    if (newMode === 'attributed' && !confirmed) {
      throw new ForbiddenError(
        'Switching to attributed mode requires explicit confirmation'
      );
    }

    // Update the team privacy mode
    await teamRepo.update(teamId, { privacyMode: newMode });

    // Log audit entry (Req 14.4 — record timestamp of mode change)
    await auditLogRepo.create({
      teamId,
      changeType: 'privacy_mode_changed',
      previousValue: currentMode,
      newValue: newMode,
      userId,
    });
  }

  return { getMode, switchMode };
}
