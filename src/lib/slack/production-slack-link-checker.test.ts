/**
 * Tests for the production Slack link checker.
 * Validates: Requirements 8.4
 */
import { describe, it, expect } from 'vitest';
import { InMemorySlackIdentityLinkRepository } from '@/lib/repositories/in-memory/slack-identity-link.repository';
import { createProductionSlackLinkChecker } from './production-slack-link-checker';

describe('createProductionSlackLinkChecker', () => {
  it('returns true when member has a SlackIdentityLink', async () => {
    const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();
    await slackIdentityLinkRepo.create({ memberId: 'member-1', slackUserId: 'U12345' });

    const checker = createProductionSlackLinkChecker({ slackIdentityLinkRepo });
    const result = await checker.hasSlackLink('member-1');

    expect(result).toBe(true);
  });

  it('returns false when member does not have a SlackIdentityLink', async () => {
    const slackIdentityLinkRepo = new InMemorySlackIdentityLinkRepository();

    const checker = createProductionSlackLinkChecker({ slackIdentityLinkRepo });
    const result = await checker.hasSlackLink('member-without-link');

    expect(result).toBe(false);
  });
});
