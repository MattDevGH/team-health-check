/**
 * Genesis service — atomic team creation from a pending genesis token.
 * Requirements: 7.9, 19.4
 *
 * Orchestrates the full flow: claim token (CAS), create team,
 * create member, assign delivery_manager role, create user session.
 */

import { randomBytes } from 'crypto';

import { NotFoundError, ConflictError } from '@/lib/errors';
import type {
  PendingGenesisRepository,
  TeamRepository,
  TeamMemberRepository,
  TeamMemberRoleRepository,
  UserSessionRepository,
  AuditLogRepository,
} from '@/lib/repositories/types';

export interface GenesisServiceDeps {
  pendingGenesisRepo: PendingGenesisRepository;
  teamRepo: TeamRepository;
  teamMemberRepo: TeamMemberRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
  userSessionRepo: UserSessionRepository;
  auditLogRepo: AuditLogRepository;
}

export interface GenesisInput {
  token: string;
  teamName: string;
  description?: string;
}

export interface GenesisResult {
  teamId: string;
  memberId: string;
  sessionToken: string;
}

/**
 * Factory function for creating the genesis service.
 */
export function createGenesisService(deps: GenesisServiceDeps) {
  const { pendingGenesisRepo, teamRepo } = deps;

  /**
   * Atomically claims a PendingGenesis token and creates the full
   * team structure: Team → TeamMember → delivery_manager role → UserSession.
   *
   * The CAS pattern on claimToken ensures that concurrent calls to the
   * same token will result in exactly one successful creation.
   */
  /**
   * Requirements: NFR 3.5, NFR 3.6; 7.9, 19.4
   *
   * One write, covering the token claim and everything it produces: the team,
   * the member, their delivery-manager role, the audit entry and the browser
   * session.
   *
   * This used to spend the token and then make five more writes. A failure
   * anywhere after the claim left somebody holding a used link and no team,
   * with no way to try again — and genesis is the door every first user
   * arrives through. The claim happens inside the transaction now, so a
   * failure gives the link back.
   *
   * The compare-and-set is unchanged in spirit: two simultaneous claims of the
   * same token still resolve to exactly one team.
   */
  async function executeGenesis(input: GenesisInput): Promise<GenesisResult> {
    /*
     * Read before claiming, because the address is what the member is created
     * from and the claim no longer hands the record back. A token that
     * disappears between this read and the claim is handled below.
     */
    const pending = await pendingGenesisRepo.findByToken(input.token);
    if (!pending) {
      throw new NotFoundError('Genesis token not found');
    }

    const memberId = randomBytes(16).toString('hex');
    const sessionToken = randomBytes(32).toString('hex');
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const created = await teamRepo.createFromGenesis({
      token: input.token,
      memberId,
      memberName: pending.email.split('@')[0],
      email: pending.email,
      team: { name: input.teamName, description: input.description },
      /*
       * The same shape the authenticated route writes, deliberately: one
       * event with two shapes depending on which door was used is worse than
       * one shape.
       *
       * Missing entirely until 2026-09-18, so a log that exists to answer
       * "how did this team come to be configured this way?" began mid-story.
       * Found by reading a production database, not by any test.
       */
      audit: {
        changeType: 'team_created',
        previousValue: '',
        newValue: JSON.stringify({ name: input.teamName, description: input.description }),
        userId: memberId,
      },
      session: { token: sessionToken, expiresAt: new Date(Date.now() + sevenDays) },
    });

    if (!created) {
      // It existed a moment ago, so it was spent or expired in between
      throw new ConflictError('Genesis token is already used or expired');
    }

    return { teamId: created.team.id, memberId, sessionToken };
  }

  return { executeGenesis };
}
