/**
 * Tests for POST /api/slack/commands
 * Validates: Requirements 2.2, 5.14, 5.15, 5.16, 7.4
 *
 * - /healthcheck connect generates a pairing code (2.2)
 * - /healthcheck responds with prompts for current session (5.15, 7.4)
 * - No active session returns informative ephemeral message (5.16, 7.4)
 * - Unlinked Slack user returns pairing instructions (7.4)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createInMemoryRepositories } from '@/lib/repositories';
import type { Repositories } from '@/lib/repositories';
import { createContainer } from '@/lib/container';
import { ForbiddenError } from '@/lib/errors';
import type { Container } from '@/lib/container';

// Mock the verify-signature module to bypass HMAC checks in tests
vi.mock('@/lib/slack/verify-signature', () => ({
  verifySlackSignature: vi.fn(),
}));

function makeSlackCommandRequest(params: Record<string, string>): Request {
  const body = new URLSearchParams(params).toString();
  return new Request('http://localhost/api/slack/commands', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-slack-signature': 'v0=test-signature',
    },
    body,
  });
}

describe('POST /api/slack/commands', () => {
  let repos: Repositories;
  let container: Container;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);

    // Dynamically import and inject the container built over in-memory repositories
    const routeModule = await import('./route');
    routeModule._setContainer(container);
  });

  describe('/healthcheck connect', () => {
    it('generates a pairing code and returns ephemeral response', async () => {
      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: 'connect',
        user_id: 'U12345',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toContain('pairing code');
      // Code should be 6 uppercase alphanumeric chars
      const codeMatch = body.text.match(/[A-Z0-9]{6}/);
      expect(codeMatch).not.toBeNull();
      expect(body.text).toContain('10 minutes');
    });
  });

  describe('/healthcheck (default — show prompt)', () => {
    it('returns actionable health check prompt blocks when linked member has open session', async () => {
      // Set up: create team, member, open session, and link Slack identity
      const team = await repos.team.create({ name: 'Prompt Team' });
      const member = await repos.teamMember.create({
        teamId: team.id,
        name: 'Alice',
        email: 'alice@example.com',
      });
      const session = await repos.session.create({ teamId: team.id, status: 'open' });
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'ULINKED1',
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'ULINKED1',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      // Fallback text for clients that cannot render blocks
      expect(body.text).toContain('health check');
      expect(body.text).toContain('session');
      expect(body.text).not.toContain('No active health check session');

      // Interactive score buttons for each outstanding question (Requirement 5.15)
      const actionBlocks = body.blocks.filter(
        (block: { type: string }) => block.type === 'actions',
      );
      expect(actionBlocks).toHaveLength(5);
      expect(actionBlocks[0].elements).toHaveLength(5);

      // Browser fallback carries the member's real session link (Requirement 5.5)
      const link = await repos.sessionLink.findByMemberAndSession(member.id, session.id);
      expect(link).not.toBeNull();
      const serialised = JSON.stringify(body.blocks);
      expect(serialised).toContain(`/session/${link?.token}`);
    });

    it('limits a micro-pulse member to their weighted outstanding question', async () => {
      const team = await repos.team.create({ name: 'Pulse Team' });
      const created = await repos.teamMember.create({
        teamId: team.id,
        name: 'Casey',
        email: 'casey@example.com',
      });
      const member = await repos.teamMember.update(created.id, {
        cadencePreference: 'micro_pulse',
      });
      await repos.session.create({ teamId: team.id, status: 'open' });
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'UPULSE1',
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'UPULSE1',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      const actionBlocks = body.blocks.filter(
        (block: { type: string }) => block.type === 'actions',
      );
      expect(actionBlocks).toHaveLength(1);
    });

    it('tells a fully answered member they are done and links to their responses', async () => {
      const team = await repos.team.create({ name: 'Done Team' });
      const member = await repos.teamMember.create({
        teamId: team.id,
        name: 'Dana',
        email: 'dana@example.com',
      });
      const session = await repos.session.create({ teamId: team.id, status: 'open' });
      await repos.sessionLink.create({
        token: 'done-token',
        memberId: member.id,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      for (const question of await repos.question.findAll()) {
        await repos.response.upsert({
          memberId: member.id,
          sessionId: session.id,
          questionId: question.id,
          score: 4,
        });
      }
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'UDONE1',
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'UDONE1',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toContain('already answered');
      expect(body.text).toContain('/session/done-token');
      expect(body.blocks).toBeUndefined();
    });

    it('returns "no active session" message when linked member has no open session', async () => {
      // Set up: create team, member, NO open session, and link Slack identity
      const team = await repos.team.create({ name: 'No Session Team' });
      const member = await repos.teamMember.create({
        teamId: team.id,
        name: 'Bob',
        email: 'bob@example.com',
      });
      // No session created — or only closed sessions
      await repos.session.create({ teamId: team.id, status: 'closed' });
      await repos.slackIdentityLink.create({
        memberId: member.id,
        slackUserId: 'ULINKED2',
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'ULINKED2',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toContain('No active health check session');
    });

    it('returns pairing instructions when Slack user is not linked', async () => {
      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'UUNLINKED1',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      // Should contain instructions for pairing
      expect(body.text).toContain('/healthcheck connect');
      // Should NOT say "no active session" — it's a different scenario
      expect(body.text).not.toContain('No active health check session');
    });
  });

  describe('unknown command', () => {
    it('returns unknown command message for unrecognized commands', async () => {
      const req = makeSlackCommandRequest({
        command: '/something-else',
        text: '',
        user_id: 'U12345',
      });

      const { POST } = await import('./route');
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.response_type).toBe('ephemeral');
      expect(body.text).toBe('Unknown command.');
    });
  });

  describe('signature verification failure', () => {
    it('returns 403 when signature is invalid', async () => {
      const { verifySlackSignature } = await import('@/lib/slack/verify-signature');
      const mockVerify = vi.mocked(verifySlackSignature);
      const { ForbiddenError } = await import('@/lib/errors');
      mockVerify.mockImplementationOnce(() => {
        throw new ForbiddenError('Invalid Slack signature');
      });

      const req = makeSlackCommandRequest({
        command: '/healthcheck',
        text: '',
        user_id: 'U12345',
      });

      const { POST } = await import('./route');
      const res = await POST(req);

      expect(res.status).toBe(403);
    });
  });
});

describe('/healthcheck signin', () => {
  /*
   * Requirements: Slack Sign In 1.1, 1.3, 1.5, 1.6, NFR 1.1, NFR 1.2
   *
   * Today there is one way into this application, and it is an email that a
   * colleague may never receive: without a verified sending domain Resend
   * delivers only to the account owner and drops the rest silently, while
   * `requestMagicLink` returns void for every input so nobody can probe which
   * addresses exist. The two together mean a teammate sees "check your email"
   * and waits for ever.
   *
   * A slash command arrives with a verified Slack signature, which is proof of
   * identity at least as good as possession of an inbox. Slack cannot set a
   * cookie, so it hands back the same thing email does: a single-use link.
   */

  let repos: Repositories;
  let container: Container;

  beforeEach(async () => {
    repos = createInMemoryRepositories();
    container = createContainer(repos);
    const routeModule = await import('./route');
    routeModule._setContainer(container);
  });

  /** A member whose Slack account is already linked. */
  async function linkedMember(slackUserId = 'U_SIGNIN') {
    const team = await repos.team.create({ name: 'Signin Team' });
    const member = await repos.teamMember.create({
      teamId: team.id,
      name: 'Linked',
      email: 'linked@signin.test',
    });
    await repos.slackIdentityLink.create({ memberId: member.id, slackUserId });
    return member;
  }

  function signinRequest(slackUserId: string) {
    return makeSlackCommandRequest({
      command: '/healthcheck',
      text: 'signin',
      user_id: slackUserId,
    });
  }

  it('hands a linked member a sign-in link', async () => {
    await linkedMember();
    const { POST } = await import('./route');

    const body = await (await POST(signinRequest('U_SIGNIN'))).json();

    expect(body.text).toMatch(/\/auth\/magic\/[A-Za-z0-9_-]+/);
  });

  it('keeps the reply to the person who asked', async () => {
    // A sign-in link posted to a channel is a credential in a channel. The
    // link is asserted alongside, so this cannot pass on some other handler's
    // ephemeral reply
    await linkedMember();
    const { POST } = await import('./route');

    const body = await (await POST(signinRequest('U_SIGNIN'))).json();

    expect(body.response_type).toBe('ephemeral');
    expect(body.text).toMatch(/\/auth\/magic\//);
  });

  it('issues a link that actually signs that member in', async () => {
    /*
     * The outcome, not the shape of the string. A reply containing a
     * plausible URL proves nothing if the token behind it was never
     * persisted, or was bound to the wrong member.
     */
    const member = await linkedMember();
    const { POST } = await import('./route');

    const body = await (await POST(signinRequest('U_SIGNIN'))).json();
    const token = /\/auth\/magic\/([A-Za-z0-9_-]+)/.exec(body.text)?.[1] ?? '';

    await expect(container.auth.verifyMagicLink(token)).resolves.toMatchObject({
      status: 'authenticated',
      memberId: member.id,
    });
  });

  it('reuses the magic-link lifecycle rather than minting a parallel one', async () => {
    // A second token type would be a second expiry, a second claim, and a
    // second place for single-use to be got wrong
    await linkedMember();
    const { POST } = await import('./route');

    const body = await (await POST(signinRequest('U_SIGNIN'))).json();
    const token = /\/auth\/magic\/([A-Za-z0-9_-]+)/.exec(body.text)?.[1] ?? '';

    expect(await repos.magicLink.findByToken(token)).not.toBeNull();
  });

  it('tells an unlinked Slack user what to do', async () => {
    /*
     * Asserted on wording only the sign-in branch produces. `signin` used to
     * fall through to the default prompt handler, whose unlinked message also
     * mentions `connect` — so a looser assertion passed before any of this was
     * built.
     */
    const { POST } = await import('./route');

    const body = await (await POST(signinRequest('U_STRANGER'))).json();

    expect(body.response_type).toBe('ephemeral');
    expect(body.text).toMatch(/sign(ing)? (you )?in|sign-in/i);
    expect(body.text).toMatch(/connect/i);
  });

  it('says nothing about whether that person is on any team', async () => {
    /*
     * Requirement 1.5, and the same anti-enumeration promise the magic-link
     * route makes. A workspace member is not a team member, and the reply must
     * not let somebody use this command to find out who is.
     */
    const member = await linkedMember('U_LINKED');
    const { POST } = await import('./route');

    const stranger = await (await POST(signinRequest('U_STRANGER'))).json();

    expect(stranger.text).not.toContain(member.email);
    expect(stranger.text).not.toContain('Signin Team');
    expect(stranger.text).not.toMatch(/exists|not a member of|no account/i);
  });

  it('issues nothing to an unlinked Slack user', async () => {
    /*
     * The reply is guidance; the absence of a credential is the guarantee.
     *
     * This asserted `findByToken('anything')` was null, which is true whatever
     * the code does — it passed against a version that issued a token to
     * everybody. Both halves are observable state now: nothing minted, and
     * nothing in the reply.
     */
    const minted: string[] = [];
    const create = repos.magicLink.create.bind(repos.magicLink);
    repos.magicLink.create = async data => {
      minted.push(data.token);
      return create(data);
    };
    const { POST } = await import('./route');

    const body = await (await POST(signinRequest('U_STRANGER'))).json();

    expect(minted).toEqual([]);
    expect(body.text).not.toMatch(/\/auth\/magic\//);
  });

  it('does no identity work at all when the signature does not verify', async () => {
    /*
     * NFR 1.1. The signature is the entire basis of the identity claim, so it
     * is checked before anything reads a Slack user id — asserted by the
     * absence of a token rather than by the order of two calls.
     */
    await linkedMember();
    let identityWasRead = false;
    repos.slackIdentityLink.findBySlackUserId = async () => {
      identityWasRead = true;
      return null;
    };
    const { verifySlackSignature } = await import('@/lib/slack/verify-signature');
    vi.mocked(verifySlackSignature).mockImplementationOnce(() => {
      throw new ForbiddenError('Invalid Slack signature');
    });
    const { POST } = await import('./route');

    const res = await POST(signinRequest('U_SIGNIN'));

    expect(res.status).toBe(403);
    expect(identityWasRead, 'the Slack user id was read before its signature was trusted').toBe(
      false,
    );
  });
});
