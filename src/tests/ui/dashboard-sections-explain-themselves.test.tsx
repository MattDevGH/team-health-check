/**
 * The two parts of the dashboard that still said nothing.
 *
 * Requirements: Explaining Itself 6.1, 6.2, 6.4; Manager Experience 3.10
 *
 * From the production pass on 2026-09-19. None of this is a failure of what
 * phase 5 asked for — the messages that milestone built showed correctly
 * throughout. It is what their success made visible: everything nearby now
 * explains itself, which leaves the parts that do not standing out.
 *
 * "Question Themes stands out as lacking an explanation now everything else has
 * one", and, of the control that opens a check: "a one-liner explanation would
 * be good alongside 'open a health check' just for absolute clarity about what
 * it does and what happens next, for new Delivery Managers using the app."
 *
 * The third finding is not an explanation at all. The theme rows were built as
 * an accordion — one open at a time — and comparing two themes is the thing a
 * manager does with that section, so the arrangement forbids the use.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuestionDetailView } from '@/app/teams/[teamId]/dashboard/question-detail-view';

const QUESTIONS = [
  { id: 'q-delivering-value', title: 'Delivering Value', description: 'How we deliver' },
  { id: 'q-team-collaboration', title: 'Team Collaboration', description: 'How we work' },
];

const SESSIONS = [
  {
    sessionId: 'session-1',
    closedAt: '2026-09-11T17:00:00.000Z',
    averages: [
      {
        questionId: 'q-delivering-value',
        averageScore: 4,
        responseCount: 5,
        improvingCount: 3,
        stableCount: 1,
        decliningCount: 1,
      },
      {
        questionId: 'q-team-collaboration',
        averageScore: 3,
        responseCount: 5,
        improvingCount: 1,
        stableCount: 3,
        decliningCount: 1,
      },
    ],
  },
];

function renderThemes() {
  return render(
    <QuestionDetailView
      sessions={SESSIONS}
      questions={QUESTIONS}
      anonymousMode={false}
      schedulerLastRanAt={new Date('2026-09-11T17:01:00.000Z').toISOString()}
    />,
  );
}

/** The section, located the way a reader's assistive technology finds it. */
function themesSection() {
  return screen.getByRole('region', { name: /question themes/i });
}

/** What a screen reader hears for the section, via `aria-describedby`. */
function descriptionOf(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('the Question themes section says what it is', () => {
  it('says what the list is', async () => {
    // Requirement 6.1. It sits under an explained chart and beside an explained
    // panel, and said nothing at all about what it lists
    renderThemes();

    expect(descriptionOf(themesSection())).toMatch(/theme|question/i);
  });

  it('says what expanding one shows', async () => {
    // Requirement 6.1, the second half. A row that expands should say what is
    // behind it before somebody spends a click finding out
    renderThemes();

    expect(descriptionOf(themesSection())).toMatch(/score|response|each check|over time/i);
  });

  it('describes itself through the section, not merely above it', async () => {
    // Requirement 6.4, which is 4.5 applied outside settings: an explanation a
    // screen reader does not reach with the thing is for sighted readers only
    renderThemes();

    expect(themesSection()).toHaveAttribute('aria-describedby');
  });
});

describe('the theme rows open independently', () => {
  it('leaves one open when another is opened', async () => {
    /*
     * Manager Experience 3.10. The rows were an accordion, and nothing ever
     * asked for that — comparing two themes is what this section is for, and
     * an accordion is the one arrangement that forbids it.
     */
    const user = userEvent.setup();
    renderThemes();

    const section = themesSection();
    const first = within(section).getByRole('button', { name: /delivering value/i });
    const second = within(section).getByRole('button', { name: /team collaboration/i });

    await user.click(first);
    await user.click(second);

    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('still closes the one that is clicked again', async () => {
    // Independent means independent in both directions, and a row that could
    // only ever open would be a worse accordion
    const user = userEvent.setup();
    renderThemes();

    const section = themesSection();
    const first = within(section).getByRole('button', { name: /delivering value/i });

    await user.click(first);
    await user.click(first);

    expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not close its neighbour when one is closed', async () => {
    const user = userEvent.setup();
    renderThemes();

    const section = themesSection();
    const first = within(section).getByRole('button', { name: /delivering value/i });
    const second = within(section).getByRole('button', { name: /team collaboration/i });

    await user.click(first);
    await user.click(second);
    await user.click(first);

    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts with every row closed', async () => {
    // The section is a summary first. Opening everything by default would bury
    // the list this milestone just finished explaining
    renderThemes();

    const section = themesSection();
    for (const name of [/delivering value/i, /team collaboration/i]) {
      expect(within(section).getByRole('button', { name })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
  });
});
