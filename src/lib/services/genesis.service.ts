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
  const {
    pendingGenesisRepo,
    teamRepo,
    teamMemberRepo,
    teamMemberRoleRepo,
    userSessionRepo,
    auditLogRepo,
  } = deps;

  /**
   * Atomically claims a PendingGenesis token and creates the full
   * team structure: Team → TeamMember → delivery_manager role → UserSession.
   *
   * The CAS pattern on claimToken ensures that concurrent calls to the
   * same token will result in exactly one successful creation.
   */
  async function executeGenesis(input: GenesisInput): Promise<GenesisResult> {
    // 1. Atomically claim the token (CAS)
    const genesis = await pendingGenesisRepo.claimToken(input.token);

    if (!genesis) {
      // Distinguish between "token not found" and "used/expired"
      const existing = await pendingGenesisRepo.findByToken(input.token);
      if (!existing) {
        throw new NotFoundError('Genesis token not found');
      }
      throw new ConflictError('Genesis token is already used or expired');
    }

    // 2. Create Team with the submitted details
    const team = await teamRepo.create({
      name: input.teamName,
      description: input.description,
    });

    // 3. Create TeamMember with the email from the genesis record
    const member = await teamMemberRepo.create({
      teamId: team.id,
      name: genesis.email.split('@')[0],
      email: genesis.email,
    });

    // 4. Assign delivery_manager role
    await teamMemberRoleRepo.assign({
      memberId: member.id,
      teamId: team.id,
      role: 'delivery_manager',
    });

    /*
     * 5. Record that the team was created.
     *
     * Two routes create teams. `POST /api/teams` persists team, member, role
     * and audit in one transaction; this one wrote everything but the audit,
     * so a log that exists to answer "how did this team come to be configured
     * this way?" began mid-story — missing the entry explaining how the team
     * came to exist at all and who became its manager.
     *
     * Found by reading a production database after creating a real team, not
     * by any test. Genesis is the route every first user arrives through.
     *
     * The same shape as the authenticated route writes, deliberately: one
     * event with two shapes depending on which door was used is worse than
     * one shape.
     *
     * Known limitation, stated rather than implied: this is not atomic with
     * the writes above, because genesis creates its rows individually rather
     * than through an aggregate. A crash here leaves a team with no creation
     * entry — the same exposure the role and session writes already carry.
     * Making genesis atomic is a worthwhile change and a separate one.
     */
    await auditLogRepo.create({
      teamId: team.id,
      changeType: 'team_created',
      previousValue: '',
      newValue: JSON.stringify({ name: input.teamName, description: input.description }),
      userId: member.id,
    });

    // 6. Create UserSession with crypto-random token, 7-day expiry
    const sessionToken = randomBytes(32).toString('hex');
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    await userSessionRepo.create({
      memberId: member.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + sevenDays),
    });

    return {
      teamId: team.id,
      memberId: member.id,
      sessionToken,
    };
  }

  return { executeGenesis };
}
