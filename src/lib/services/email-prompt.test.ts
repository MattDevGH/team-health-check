/**
 * An email that asks for answers, rather than one that signs you in.
 *
 * Requirements: Reaching Your Health Check 3.1, 3.3
 *
 * `EmailService` had exactly one method. The scheduler called `sendSlackPrompt`
 * and nothing else, so a team without Slack was never told a check had opened —
 * email was the only way *in* to the application and Slack the only way to hear
 * there was anything to do, each a single point of failure in the opposite
 * direction.
 *
 * A second method rather than a `type` flag on the first, so the two templates
 * cannot drift into being the same one. That is not hypothetical here: a
 * closing reminder that rendered identically to an opening prompt passed a
 * "was the sink called" test for an entire milestone, and the requirement
 * behind it was never built.
 */

import { describe, expect, it } from 'vitest';

import { createResendEmailService, InMemoryEmailService, type EmailPayload } from './email.service';

const BASE_URL = 'https://team-health-check.example';
const CLOSES_AT = new Date('2026-09-18T17:00:00.000Z');

/** Captures the payload a real send would have made, without a network call. */
function captured() {
  const sent: EmailPayload[] = [];
  const service = createResendEmailService({
    apiKey: 'unused',
    senderAddress: 'Team Health Check <noreply@example.invalid>',
    sendFn: async payload => {
      sent.push(payload);
    },
  });
  return { sent, service };
}

describe('a health check prompt by email', () => {
  it('carries the member’s own session link', async () => {
    // Requirement 3.1. Without the link the message is an announcement rather
    // than a way to answer, which is the whole gap this closes
    const { sent, service } = captured();

    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-123', BASE_URL, CLOSES_AT);

    expect(sent[0].html).toContain(`${BASE_URL}/session/tok-123`);
  });

  it('says when the check closes, so the reader knows whether to act now', async () => {
    const { sent, service } = captured();

    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-123', BASE_URL, CLOSES_AT);

    expect(sent[0].html).toMatch(/18 September 2026/);
  });

  it('still works when nothing says when it closes', async () => {
    // A session opened by hand has no scheduled close, and a prompt that threw
    // would mean opening one by hand silently stopped telling anybody
    const { sent, service } = captured();

    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-123', BASE_URL, null);

    expect(sent[0].html).toContain(`${BASE_URL}/session/tok-123`);
    expect(sent[0].html).not.toMatch(/invalid date|NaN/i);
  });

  it('is not the magic link wearing a different subject', async () => {
    /*
     * Requirement 3.3. One signs you in, the other asks for your answers, and
     * a reader who cannot tell them apart will click the wrong one — or worse,
     * ignore the one that mattered.
     *
     * Asserted on the body and the subject, not on a sender being called.
     */
    const { sent, service } = captured();

    await service.sendMagicLink('member@example.invalid', 'tok-sign-in', BASE_URL);
    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-answer', BASE_URL, CLOSES_AT);

    const [signIn, prompt] = sent;
    expect(prompt.subject).not.toBe(signIn.subject);
    expect(prompt.html).not.toBe(signIn.html);
  });

  it('points at the session, never at a sign-in link', async () => {
    // The two carry different credentials. A prompt containing a magic link
    // would be a sign-in token sent for a different reason
    const { sent, service } = captured();

    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-123', BASE_URL, CLOSES_AT);

    expect(sent[0].html).not.toContain('/auth/magic/');
  });

  it('says what it is in the subject, since that is all some readers see', async () => {
    const { sent, service } = captured();

    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-123', BASE_URL, CLOSES_AT);

    expect(sent[0].subject).toMatch(/health check/i);
    expect(sent[0].subject).not.toMatch(/access link|sign in/i);
  });

  it('goes to the address it was given, from the configured sender', async () => {
    const { sent, service } = captured();

    await service.sendHealthCheckPrompt('member@example.invalid', 'tok-123', BASE_URL, CLOSES_AT);

    expect(sent[0]).toMatchObject({
      to: 'member@example.invalid',
      from: 'Team Health Check <noreply@example.invalid>',
    });
  });
});

describe('the in-memory service', () => {
  it('records a prompt separately from a magic link', async () => {
    /*
     * The fake is a claim about the real service. Recording both in one list
     * would let a test assert "an email was sent" and pass when the wrong one
     * was — which is the exact shape of the reminder defect this spec cites.
     */
    const email = new InMemoryEmailService();

    await email.sendMagicLink('member@example.invalid', 'tok-sign-in', BASE_URL);
    await email.sendHealthCheckPrompt('member@example.invalid', 'tok-answer', BASE_URL, CLOSES_AT);

    expect(email.sentEmails).toHaveLength(1);
    expect(email.sentPrompts).toHaveLength(1);
    expect(email.sentPrompts[0]).toMatchObject({
      to: 'member@example.invalid',
      token: 'tok-answer',
    });
  });
});
