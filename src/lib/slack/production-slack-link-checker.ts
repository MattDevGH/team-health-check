/**
 * Production SlackLinkChecker backed by SlackIdentityLinkRepository.
 * Requirement 8.4: Queries the SlackIdentityLink table to determine link status.
 */
import type { SlackLinkChecker } from '@/lib/services/notification.service';
import type { SlackIdentityLinkRepository } from '@/lib/repositories/types';

export interface ProductionSlackLinkCheckerDeps {
  slackIdentityLinkRepo: SlackIdentityLinkRepository;
}

export function createProductionSlackLinkChecker(
  deps: ProductionSlackLinkCheckerDeps
): SlackLinkChecker {
  return {
    async hasSlackLink(memberId: string): Promise<boolean> {
      const link = await deps.slackIdentityLinkRepo.findByMemberId(memberId);
      return link !== null;
    },
  };
}
