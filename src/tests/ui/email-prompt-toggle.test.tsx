/**
 * The control a member uses to choose whether prompts arrive by email.
 *
 * Requirements: Reaching Your Health Check 4.1, 4.2, 4.4, 4.5, NFR 3.1
 * Properties: 6, 7
 *
 * Requirement 4.5 exists because "Email notifications" as a label says nothing
 * about whether signing in is included — and this application sends its access
 * links by email, so a member who reads it as "stop emailing me" and is right
 * would lock themselves out. The reminders toggle already learned this lesson
 * the expensive way: it governed two of four messages and said so nowhere.
 *
 * The state shown is the *effective* one, not the stored one. Null means the
 * member has not chosen, and a switch rendered off for somebody who is in fact
 * being emailed would be a lie told by an accessible control.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '../mocks/server';
import ProfilePage from '@/app/me/page';

expect.extend(toHaveNoViolations);

/** Mirrors what `GET /api/me` actually returns, including the new field. */
const MOCK_PROFILE = {
  id: 'member-1',
  teamId: 'team-1',
  name: 'Alice',
  email: 'alice@example.com',
  cadencePreference: 'session',
  remindersEnabled: true,
  emailPromptsEnabled: null as boolean | null,
  currentStreak: 5,
  bestStreak: 8,
  slackLink: null as { slackUserId: string } | null,
  team: { id: 'team-1', name: 'Platform Squad', privacyMode: 'anonymous' },
  roles: ['team_member'],
};

/** Every PATCH body the page sent, so the request can be asserted. */
let patched: Array<Record<string, unknown>>;

function mockProfileApi(overrides: Partial<typeof MOCK_PROFILE> = {}) {
  const profile = { ...MOCK_PROFILE, ...overrides };
  server.use(
    http.get('/api/me', () => HttpResponse.json(profile)),
    http.get('/api/me/streak', () => HttpResponse.json({ currentStreak: 5, bestStreak: 8 })),
    http.patch('/api/me/preferences', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patched.push(body);
      return HttpResponse.json({ ...profile, ...body });
    }),
  );
}

/** What a screen reader would hear for this control, via `aria-describedby`. */
function descriptionOf(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

async function renderProfile() {
  render(<ProfilePage />);
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: /profile/i })).toBeInTheDocument();
  });
}

function emailSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: /email/i });
}

beforeEach(() => {
  patched = [];
});

describe('what the control shows', () => {
  it('is on for a member with no Slack link and no choice', async () => {
    // Requirement 4.3, Property 7. The state shown has to be what actually
    // happens, and for this member email is the only way they hear anything
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    await renderProfile();

    expect(emailSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('is off for a member with Slack linked and no choice', async () => {
    // Requirement 5.2
    mockProfileApi({ slackLink: { slackUserId: 'U123' }, emailPromptsEnabled: null });
    await renderProfile();

    expect(emailSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('shows on for a member who asked for it despite having Slack', async () => {
    // Property 6, one direction of it: the choice beats the default
    mockProfileApi({ slackLink: { slackUserId: 'U123' }, emailPromptsEnabled: true });
    await renderProfile();

    expect(emailSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('shows off for a member who turned it off despite having no Slack', async () => {
    // The other direction. Between them, no reading of the default produces
    // both of these
    mockProfileApi({ slackLink: null, emailPromptsEnabled: false });
    await renderProfile();

    expect(emailSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('says it is following a default when nothing has been chosen', async () => {
    /*
     * The difference between "off because you said so" and "off because Slack
     * can reach you" is the whole reason the field is nullable, and a member
     * who cannot see which one they are in cannot predict what unlinking
     * Slack will do to them.
     */
    mockProfileApi({ slackLink: { slackUserId: 'U123' }, emailPromptsEnabled: null });
    await renderProfile();

    expect(descriptionOf(emailSwitch())).toMatch(/because .*Slack|you have not chosen/i);
  });
});

describe('what the control says it does', () => {
  beforeEach(() => mockProfileApi());

  it('names what it governs: the prompt when a check opens', async () => {
    // Requirement 4.5
    await renderProfile();

    expect(descriptionOf(emailSwitch())).toMatch(/when a check opens/i);
  });

  it('says signing in is not affected', async () => {
    /*
     * Requirement 4.2, and the reason the requirement exists. Access links
     * arrive by email, so a member who read this as "stop emailing me" and was
     * right would have locked themselves out of the application.
     */
    await renderProfile();

    expect(descriptionOf(emailSwitch())).toMatch(/sign(ing)? in|access link/i);
  });

  it('distinguishes itself from the reminders toggle', async () => {
    /*
     * Requirement 4.4. Two switches about email notifications, one governing
     * *which* messages are sent and the other *how* they arrive. A member
     * reading either in isolation would reasonably expect it to cover both.
     */
    await renderProfile();

    expect(descriptionOf(emailSwitch())).toMatch(/how .*arrive|not which|reminders/i);
  });

  it('describes itself through the control, not merely beside it', async () => {
    // NFR 3.1: an explanation a screen reader does not reach with the control
    // is an explanation for sighted readers only
    await renderProfile();

    expect(emailSwitch()).toHaveAttribute('aria-describedby');
  });
});

describe('changing it', () => {
  it('saves an explicit choice, never a null', async () => {
    /*
     * Touching the control is choosing. Sending null would leave the member
     * back on the default, which is the one thing the click cannot have meant.
     */
    mockProfileApi({ slackLink: { slackUserId: 'U123' }, emailPromptsEnabled: null });
    await renderProfile();

    await userEvent.click(emailSwitch());

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toEqual({ emailPromptsEnabled: true });
  });

  it('turns off a member who was on by default', async () => {
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    await renderProfile();

    await userEvent.click(emailSwitch());

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toEqual({ emailPromptsEnabled: false });
  });

  it('shows the new state once it is saved', async () => {
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    await renderProfile();

    await userEvent.click(emailSwitch());

    await waitFor(() => expect(emailSwitch()).toHaveAttribute('aria-checked', 'false'));
  });

  it('does not touch the reminders setting', async () => {
    // Requirement 4.4, asserted on the request rather than on the label. Two
    // adjacent switches writing to one endpoint is how one quietly resets the
    // other
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    await renderProfile();

    await userEvent.click(emailSwitch());

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).not.toHaveProperty('remindersEnabled');
    expect(screen.getByRole('switch', { name: /reminders/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('is operable from the keyboard alone', async () => {
    // NFR 3.1. A switch reachable only by pointer is a setting some members
    // cannot change
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    await renderProfile();

    emailSwitch().focus();
    expect(emailSwitch()).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(patched).toHaveLength(1));
  });

  it('is reachable by tabbing, in the order it is read', async () => {
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    await renderProfile();

    const reminders = screen.getByRole('switch', { name: /reminders/i });
    reminders.focus();
    await userEvent.tab();

    expect(emailSwitch()).toHaveFocus();
  });
});

describe('accessibility', () => {
  it('has no axe violations with the control on', async () => {
    mockProfileApi({ slackLink: null, emailPromptsEnabled: null });
    const { container } = render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /profile/i })).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations with it off', async () => {
    mockProfileApi({ slackLink: { slackUserId: 'U123' }, emailPromptsEnabled: false });
    const { container } = render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /profile/i })).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
