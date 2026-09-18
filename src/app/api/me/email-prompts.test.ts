/**
 * The email-prompt preference, over the API a member's profile page talks to.
 *
 * Requirements: Reaching Your Health Check 4.1, 4.2, 4.3
 * Properties: 6, 7
 *
 * A separate file from `route.test.ts` because this is one field's whole
 * story — read, written, cleared — and it reads better together than scattered
 * through 800 lines of unrelated `/api/me` behaviour.
 *
 * The field is **nullable on purpose**: null is "I have not chosen", and the
 * effective answer is derived from whether Slack is linked. That is the part
 * with a defect waiting in it. A column defaulting to `false` would read back
 * as a member who had turned email off, and nothing downstream could tell the
 * difference between that and a member who never touched it.
 *
 * The profile page once rendered a `privacyMode` the API never sent, which is
 * why the read is asserted here and not only in the page's own tests.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

import { GET, _repos as meRepos } from './route';
import { PATCH, _repos as prefsRepos } from './preferences/route';

function request(method: string, opts: { cookie?: string; body?: unknown } = {}): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.cookie) headers.set('cookie', `session=${opts.cookie}`);
  const init: { method: string; headers: Headers; body?: string } = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return new NextRequest('http://localhost/api/me', init);
}

/** A member with a live session cookie, in both route modules' shared repos. */
async function signedIn(name: string): Promise<{ memberId: string; token: string }> {
  const member = await meRepos.teamMember.create({
    teamId: 'team-1',
    name,
    email: `${name.toLowerCase()}@prompts.test`,
  });
  const token = `email-prompt-session-${name}-${Math.random()}`;
  await meRepos.userSession.create({
    memberId: member.id,
    token,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { memberId: member.id, token };
}

describe('GET /api/me reports the preference', () => {
  it('sends null for a member who has not chosen', async () => {
    /*
     * Not `false`, and not omitted. The page has to tell "off" from "unset" to
     * show what will actually happen, and a missing key would leave it
     * guessing — the shape of the `privacyMode` defect.
     */
    const { token } = await signedIn('Unchosen');

    const body = await (await GET(request('GET', { cookie: token }))).json();

    expect(body).toHaveProperty('emailPromptsEnabled');
    expect(body.emailPromptsEnabled).toBeNull();
  });

  it('sends back what the member chose', async () => {
    const { token } = await signedIn('Chose');
    await PATCH(request('PATCH', { cookie: token, body: { emailPromptsEnabled: true } }));

    const body = await (await GET(request('GET', { cookie: token }))).json();

    expect(body.emailPromptsEnabled).toBe(true);
  });

  it('sends the Slack link alongside it, since the default depends on it', async () => {
    // Property 6 needs both halves to be readable by whoever renders the
    // control: the choice, and what happens when there is none
    const { memberId, token } = await signedIn('Linked');
    await meRepos.slackIdentityLink.create({ memberId, slackUserId: 'U_PROMPTS' });

    const body = await (await GET(request('GET', { cookie: token }))).json();

    expect(body.slackLink).toEqual({ slackUserId: 'U_PROMPTS' });
    expect(body.emailPromptsEnabled).toBeNull();
  });
});

describe('PATCH /api/me/preferences writes the preference', () => {
  it('turns email prompts on', async () => {
    const { token } = await signedIn('TurnsOn');

    const res = await PATCH(request('PATCH', { cookie: token, body: { emailPromptsEnabled: true } }));

    expect(res.status).toBe(200);
    expect((await res.json()).emailPromptsEnabled).toBe(true);
  });

  it('turns them off', async () => {
    // Requirement 4.1 works in both directions, or it is a default wearing a
    // switch
    const { token } = await signedIn('TurnsOff');

    const res = await PATCH(request('PATCH', { cookie: token, body: { emailPromptsEnabled: false } }));

    expect((await res.json()).emailPromptsEnabled).toBe(false);
  });

  it('lets a member go back to having no preference', async () => {
    /*
     * Requirement 4.3. Sending null is not the same as sending false: it
     * returns the member to "whatever suits how I am set up", which is the
     * only state that keeps following their Slack link as it changes.
     */
    const { token } = await signedIn('Reverts');
    await PATCH(request('PATCH', { cookie: token, body: { emailPromptsEnabled: false } }));

    const res = await PATCH(
      request('PATCH', { cookie: token, body: { emailPromptsEnabled: null } }),
    );

    expect((await res.json()).emailPromptsEnabled).toBeNull();
  });

  it('refuses anything that is not a boolean or null', async () => {
    const { token } = await signedIn('Rubbish');

    const res = await PATCH(
      request('PATCH', { cookie: token, body: { emailPromptsEnabled: 'yes' } }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('leaves it alone when the request does not mention it', async () => {
    // A profile page saving the cadence must not silently reset a channel
    // choice it did not send
    const { token } = await signedIn('Untouched');
    await PATCH(request('PATCH', { cookie: token, body: { emailPromptsEnabled: true } }));

    const res = await PATCH(
      request('PATCH', { cookie: token, body: { cadencePreference: 'micro_pulse' } }),
    );

    const body = await res.json();
    expect(body.cadencePreference).toBe('micro_pulse');
    expect(body.emailPromptsEnabled).toBe(true);
  });

  it('changes nobody else’s', async () => {
    const mine = await signedIn('Mine');
    const theirs = await signedIn('Theirs');

    await PATCH(request('PATCH', { cookie: mine.token, body: { emailPromptsEnabled: false } }));

    const other = await prefsRepos.teamMember.findById(theirs.memberId);
    expect(other?.emailPromptsEnabled).toBeNull();
  });
});
