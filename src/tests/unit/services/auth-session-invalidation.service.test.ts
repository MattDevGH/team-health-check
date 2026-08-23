import { beforeEach, describe, expect, it } from 'vitest';

import { createInMemoryRepositories, type Repositories } from '@/lib/repositories';
import { createAuthService, type AuthService } from '@/lib/services/auth.service';

describe('AuthService.invalidateSession', () => {
  let repos: Repositories;
  let authService: AuthService;

  beforeEach(() => {
    repos = createInMemoryRepositories();
    authService = createAuthService({
      pairingCodeRepo: repos.pairingCode,
      userSessionRepo: repos.userSession,
    });
  });

  it('removes the persisted session identified by its token', async () => {
    await repos.userSession.create({
      memberId: 'member-1',
      token: 'session-token',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await authService.invalidateSession('session-token');

    await expect(repos.userSession.findByToken('session-token')).resolves.toBeNull();
  });

  it('is idempotent for an unknown token', async () => {
    await expect(authService.invalidateSession('unknown-token')).resolves.toBeUndefined();
  });
});
