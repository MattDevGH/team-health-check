import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInMemoryRepositories } from '@/lib/repositories';
import { createNotificationService } from '@/lib/services/notification.service';
import type { NotificationSink, SlackLinkChecker } from '@/lib/services/notification.service';
import type { HealthCheckSession } from '@/lib/repositories/entities';

/**
 * Arbitrary for a member ID (cuid-like string).
 */
const memberIdArb = fc.stringMatching(/^m-[a-z0-9]{6,12}$/);

/**
 * Arbitrary for a team of 3-15 members with a random subset marked as "linked".
 * Returns { memberIds: string[], linkedSet: Set<string> }
 */
const teamWithLinkedMembersArb = fc
  .integer({ min: 3, max: 15 })
  .chain((teamSize) =>
    fc
      .array(memberIdArb, { minLength: teamSize, maxLength: teamSize })
      .chain((memberIds) => {
        // Deduplicate
        const uniqueMembers = [...new Set(memberIds)];
        // Generate a boolean mask indicating which are linked
        return fc
          .array(fc.boolean(), {
            minLength: uniqueMembers.length,
            maxLength: uniqueMembers.length,
          })
          .map((linkMask) => {
            const linkedSet = new Set<string>();
            linkMask.forEach((isLinked, i) => {
              if (isLinked) linkedSet.add(uniqueMembers[i]);
            });
            return { memberIds: uniqueMembers, linkedSet };
          });
      })
  )
  .filter(({ memberIds }) => memberIds.length >= 3);

describe('Slack Prompt Properties', () => {
  /**
   * **Validates: Requirements 2.8, 5.13**
   *
   * Property 8: Only linked members receive Slack prompts
   *
   * For any team with a mix of Slack-linked and unlinked members, when prompts
   * are sent for an open session, the set of prompt recipients SHALL be exactly
   * the subset of members with valid Slack identity links.
   */
  describe('Property 8: Only linked members receive Slack prompts', () => {
    it('sendSlackPrompt returns true for linked members and false for unlinked members', async () => {
      await fc.assert(
        fc.asyncProperty(teamWithLinkedMembersArb, async ({ memberIds, linkedSet }) => {
          const repos = createInMemoryRepositories();

          // Track sent notifications
          const sentTo: string[] = [];
          const notificationSink: NotificationSink = {
            send: async (memberId: string, _type: string, _payload: unknown) => {
              sentTo.push(memberId);
            },
          };

          // SlackLinkChecker returns true only for linked members
          const slackLinkChecker: SlackLinkChecker = {
            hasSlackLink: async (memberId: string) => linkedSet.has(memberId),
          };

          const notificationService = createNotificationService({
            teamRepo: repos.team,
            teamMemberRepo: repos.teamMember,
            responseRepo: repos.response,
            questionRepo: repos.question,
            availabilityRepo: repos.availability,
            sessionRepo: repos.session,
            notificationSink,
            slackLinkChecker,
          });

          // Create a session fixture
          const session: HealthCheckSession = {
            id: 'session-1',
            teamId: 'team-1',
            status: 'open',
            scheduledOpenAt: null,
            scheduledCloseAt: null,
            actualOpenAt: new Date(),
            actualCloseAt: null,
            createdAt: new Date(),
          };

          // Call sendSlackPrompt for every member and collect results
          const results = new Map<string, boolean>();
          for (const memberId of memberIds) {
            const sent = await notificationService.sendSlackPrompt(memberId, session);
            results.set(memberId, sent);
          }

          // Verify: returns true for exactly the linked subset
          for (const memberId of memberIds) {
            const expected = linkedSet.has(memberId);
            expect(results.get(memberId)).toBe(expected);
          }

          // Verify: the notification sink received messages for exactly the linked members
          const sentSet = new Set(sentTo);
          expect(sentSet).toEqual(linkedSet);
        }),
        { numRuns: 100 }
      );
    });

    it('notification sink receives no messages for fully unlinked teams', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(memberIdArb, { minLength: 3, maxLength: 10 }).map((ids) => [...new Set(ids)]).filter((ids) => ids.length >= 3),
          async (memberIds) => {
            const repos = createInMemoryRepositories();

            const sentTo: string[] = [];
            const notificationSink: NotificationSink = {
              send: async (memberId: string) => {
                sentTo.push(memberId);
              },
            };

            // No members are linked
            const slackLinkChecker: SlackLinkChecker = {
              hasSlackLink: async () => false,
            };

            const notificationService = createNotificationService({
              teamRepo: repos.team,
              teamMemberRepo: repos.teamMember,
              responseRepo: repos.response,
              questionRepo: repos.question,
              availabilityRepo: repos.availability,
              sessionRepo: repos.session,
              notificationSink,
              slackLinkChecker,
            });

            const session: HealthCheckSession = {
              id: 'session-2',
              teamId: 'team-1',
              status: 'open',
              scheduledOpenAt: null,
              scheduledCloseAt: null,
              actualOpenAt: new Date(),
              actualCloseAt: null,
              createdAt: new Date(),
            };

            for (const memberId of memberIds) {
              const sent = await notificationService.sendSlackPrompt(memberId, session);
              expect(sent).toBe(false);
            }

            // No notifications should have been sent
            expect(sentTo).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
