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
} from '@/lib/repositories/types';

export interface GenesisServiceDeps {
  pendingGenesisRepo: PendingGenesisRepository;
  teamRepo: TeamRepository;
  teamMemberRepo: TeamMemberRepository;
  teamMemberRoleRepo: TeamMemberRoleRepository;
  userSessionRepo: UserSessionRepository;
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
  } = deps;

  /**
   * Atomically claims a PendingGenesis token and creates the full
   * team structure: Team → TeamMember → delivery_manager role → UserSession.
   *
   * The CAS pattern on claimToken ensures that concurrent calls to the
   * same token will result in exactly one successful creation.
   */
  async function executeGenesis(token: string): Promise<GenesisResult> {
    // 1. Atomically claim the token (CAS)
    const genesis = await pendingGenesisRepo.claimToken(token);

    if (!genesis) {
      // Distinguish between "token not found" and "used/expired"
      const existing = await pendingGenesisRepo.findByToken(token);
      if (!existing) {
        throw new NotFoundError('Genesis token not found');
      }
      throw new ConflictError('Genesis token is already used or expired');
    }

    // 2. Create Team with default name
    const team = await teamRepo.create({ name: 'My Team' });

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

    // 5. Create UserSession with crypto-random token, 7-day expiry
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
