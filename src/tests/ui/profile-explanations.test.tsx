/**
 * A profile page that says what its settings do.
 *
 * Requirements: Explaining Itself 4.1, 4.2, 4.3, 4.4, 4.5, NFR 1.1, NFR 1.2
 *
 * Four controls — cadence, reminders, availability, Slack — and not one of them
 * said what it affected. "Weekly" and "Micro-Pulse" are two words a member is
 * asked to choose between with nothing to choose on.
 *
 * The reminders toggle is the expensive one. Turning it off does not stop the
 * prompt that arrives when a check opens: `sendSlackPrompt` never reads
 * `remindersEnabled`, only `sendClosingReminder` and `sendMidSessionNudge` do.
 * A member who turns it off expecting silence gets a message anyway and
 * concludes the setting is broken.
 *
 * `aria-describedby` rather than proximity, because an explanation a screen
 * reader does not reach with the control is an explanation for sighted readers
 * only — which is NFR 1.2, and the reason these assert the association rather
 * than the presence of the text.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '../mocks/server';
import { PAIRING_CODE_EXPIRY_MS } from '@/lib/services/auth.service';
import ProfilePage from '@/app/me/page';

/** Mirrors what `GET /api/me` actually returns. */
const MOCK_PROFILE = {
  id: 'member-1',
  teamId: 'team-1',
  name: 'Alice',
  email: 'alice@example.com',
  cadencePreference: 'session',
  remindersEnabled: true,
  currentStreak: 5,
  bestStreak: 8,
  slackLink: null,
  team: { id: 'team-1', name: 'Platform Squad', privacyMode: 'anonymous' },
  roles: ['team_member'],
};

function mockProfileApi(profile: Record<string, unknown> = MOCK_PROFILE) {
  server.use(
    http.get('/api/me', () => HttpResponse.json(profile)),
    http.get('/api/me/streak', () => HttpResponse.json({ currentStreak: 5, bestStreak: 8 })),
  );
}

/**
 * The text a screen reader would hear for this control, resolved through
 * `aria-describedby` — not whatever happens to sit next to it on screen.
 */
function descriptionOf(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

expect.extend(toHaveNoViolations);

// axe in jsdom cannot evaluate colour contrast — the new explanation text is
// gray-600 on white, checked separately against the standing bar.

async function renderProfile() {
  render(<ProfilePage />);
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: /profile/i })).toBeInTheDocument();
  });
}

describe('the cadence preference explains itself', () => {
  beforeEach(() => mockProfileApi());

  it('says what weekly asks for', async () => {
    // Requirement 4.1. Weekly means all five questions in one go, which is
    // what the member is actually choosing
    await renderProfile();

    const group = screen.getByRole('group', { name: /cadence/i });

    expect(descriptionOf(group)).toMatch(/all five questions/i);
  });

  it('says what micro-pulse asks for instead', async () => {
    // A few questions spread over the days a check is open, the rest still
    // reachable — not "micro-pulse", which means nothing to anybody
    await renderProfile();

    const group = screen.getByRole('group', { name: /cadence/i });

    expect(descriptionOf(group)).toMatch(/a few .*each day|spread/i);
  });

  it('describes the choice through the control, not merely beside it', async () => {
    // NFR 1.1
    await renderProfile();

    expect(screen.getByRole('group', { name: /cadence/i })).toHaveAttribute('aria-describedby');
  });
});

describe('the reminders toggle explains itself', () => {
  beforeEach(() => mockProfileApi());

  it('names the notifications it governs', async () => {
    // Requirement 4.2
    await renderProfile();

    expect(descriptionOf(screen.getByRole('switch', { name: /reminders/i }))).toMatch(
      /about to close|closing/i,
    );
  });

  it('says it does not stop the prompt when a check opens', async () => {
    /*
     * The one a member is most likely to get wrong, and the code agrees with
     * them being wrong: `sendSlackPrompt` never reads `remindersEnabled`.
     * Turning this off and still being messaged looks like a broken setting
     * unless the setting said so first.
     */
    await renderProfile();

    expect(descriptionOf(screen.getByRole('switch', { name: /reminders/i }))).toMatch(
      /when a check opens/i,
    );
  });

  it('says it does not affect signing in', async () => {
    // Requirement 4.2, explicitly — sign-in emails are not a notification
    // anybody should be able to switch off by accident
    await renderProfile();

    expect(descriptionOf(screen.getByRole('switch', { name: /reminders/i }))).toMatch(
      /sign(ing)? in/i,
    );
  });
});

describe('availability explains itself', () => {
  beforeEach(() => mockProfileApi());

  it('says what it stops', async () => {
    // Requirement 4.3
    await renderProfile();

    const group = screen.getByRole('group', { name: /away/i });

    expect(descriptionOf(group)).toMatch(/prompt|remind/i);
  });

  it('says a check already open stays answerable', async () => {
    /*
     * Requirement 4.3. Being away gates notifications and nothing else — no
     * response path checks availability — so a member who marks themselves
     * away has not withdrawn from the check, and should know that.
     */
    await renderProfile();

    const group = screen.getByRole('group', { name: /away/i });

    expect(descriptionOf(group)).toMatch(/still (be able to )?answer/i);
  });
});

describe('Slack linking explains itself', () => {
  beforeEach(() => mockProfileApi());

  it('says what linking gets you', async () => {
    // Requirement 4.4. Naming the command says how; this says why
    await renderProfile();

    const input = screen.getByLabelText(/pairing code/i);

    expect(descriptionOf(input)).toMatch(/in slack|without leaving slack|answer/i);
  });

  it('says where the code comes from', async () => {
    await renderProfile();

    expect(descriptionOf(screen.getByLabelText(/pairing code/i))).toMatch(/\/healthcheck connect/i);
  });

  it('says the code does not last', async () => {
    // A code that expired reads as a broken code unless it was said first
    await renderProfile();

    expect(descriptionOf(screen.getByLabelText(/pairing code/i))).toMatch(/expire|minutes/i);
  });

  it('says a lifetime the code actually has', async () => {
    /*
     * The page says "ten minutes" in prose, which nothing else in the system
     * knows about. Copy that quietly stops being true is worse than no copy,
     * so the claim is pinned to the constant that decides it — change
     * `PAIRING_CODE_EXPIRY_MS` and this fails, which is the moment to reword
     * the page.
     */
    await renderProfile();

    expect(PAIRING_CODE_EXPIRY_MS / 60_000).toBe(10);
    expect(descriptionOf(screen.getByLabelText(/pairing code/i))).toMatch(/ten minutes/i);
  });
});

describe('the profile page as a whole', () => {
  it('has no axe-detectable violations with a member who has not linked Slack', async () => {
    // Requirement NFR 2.1. The unlinked branch is the one that gained a
    // described input, and it is the branch a new member sees first
    mockProfileApi();
    const { container } = render(<ProfilePage />);
    await screen.findByRole('heading', { level: 1, name: /profile/i });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with Slack linked either', async () => {
    // A different branch renders here — the unlink control instead of the
    // pairing input — and auditing only one would leave the other unchecked
    mockProfileApi({ ...MOCK_PROFILE, slackLink: { slackUserId: 'U123' } });
    const { container } = render(<ProfilePage />);
    await screen.findByRole('heading', { level: 1, name: /profile/i });

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('an explanation reaches a screen reader with its control', () => {
  beforeEach(() => mockProfileApi());

  it('resolves every aria-describedby on the page to real text', async () => {
    /*
     * NFR 1.2. `aria-describedby` pointing at an id that does not exist is
     * silent: the attribute is there, the test that asserts the attribute
     * passes, and a screen reader announces nothing. So every reference on the
     * page is followed.
     */
    await renderProfile();

    const referencing = Array.from(document.querySelectorAll('[aria-describedby]'));
    expect(referencing.length).toBeGreaterThan(0);

    for (const element of referencing) {
      for (const id of (element.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
        expect(document.getElementById(id)?.textContent?.trim(), `#${id} is empty`).toBeTruthy();
      }
    }
  });
});
