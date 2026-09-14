/**
 * Resolves the signed-in member's own health check.
 *
 * Requirements: Reaching Your Health Check 1.6, 2.1, 2.3
 * Properties: 1, 2
 *
 * On 2026-09-14 production opened a check on schedule, generated a session link
 * per member, and nobody could reach it. `/session/[token]` works; nothing in
 * the authenticated interface pointed at it, so a signed-in delivery manager
 * could watch participation and close the check but not answer it.
 *
 * The signature is the design. This takes a member id and returns *that*
 * member's link — there is no parameter in which to ask for anyone else's,
 * because a session link authenticates whoever holds it. Surfacing links for a
 * manager to hand out was rejected during the Slack sign-in spec for that
 * reason: a manager holding a member's link can submit as them, which for a tool
 * built on candid feedback is close to fatal.
 */

import type {
  SessionLinkRepository,
  SessionRepository,
  TeamMemberRepository,
} from '@/lib/repositories/types';

export interface MyHealthCheckServiceDeps {
  sessionRepo: SessionRepository;
  sessionLinkRepo: SessionLinkRepository;
  teamMemberRepo: TeamMemberRepository;
}

/**
 * Why a member cannot answer right now, or the link that lets them.
 *
 * Separate cases rather than a nullable token, so the caller has to say
 * something useful for each. "Nothing is open" and "you have no link for the
 * check that is open" need different words, and a page that collapsed them
 * would tell a member nothing is happening when something is.
 */
export type MyHealthCheck =
  | { kind: 'open'; sessionId: string; token: string }
  | { kind: 'none_open' }
  | { kind: 'no_link'; sessionId: string }
  | { kind: 'no_member' };

export function createMyHealthCheckService(deps: MyHealthCheckServiceDeps) {
  const { sessionRepo, sessionLinkRepo, teamMemberRepo } = deps;

  /**
   * The check this member can answer, if there is one.
   *
   * The team comes from the member record rather than from the caller, so a
   * request cannot reach into another team's open session.
   */
  async function resolve(memberId: string): Promise<MyHealthCheck> {
    const member = await teamMemberRepo.findById(memberId);
    if (!member) return { kind: 'no_member' };

    const session = await sessionRepo.findOpenByTeamId(member.teamId);
    if (!session) return { kind: 'none_open' };

    /*
     * A member added after the check opened has no link for it. Handing them
     * somebody else's would let them answer as that person — silently, and in
     * anonymous mode untraceably — so this reports the gap instead.
     */
    const link = await sessionLinkRepo.findByMemberAndSession(memberId, session.id);
    if (!link) return { kind: 'no_link', sessionId: session.id };

    return { kind: 'open', sessionId: session.id, token: link.token };
  }

  return { resolve };
}
