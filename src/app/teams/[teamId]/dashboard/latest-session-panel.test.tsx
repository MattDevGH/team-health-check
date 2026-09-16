/**
 * Tests for the Latest Session panel.
 * Requirements: Manager Experience 3.5, 3.6
 *
 * TDD: Red phase.
 *
 * The panel this replaces listed response counts under a heading promising the
 * latest session — a manager could see that six people answered and not what
 * they said.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

import { LatestSessionPanel } from './latest-session-panel';

const TWO_SESSIONS = [
  {
    sessionId: 's1',
    closedAt: '2026-08-01T17:00:00.000Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 3.5, responseCount: 6 },
      { questionId: 'q-team-collaboration', averageScore: 4.0, responseCount: 6 },
      { questionId: 'q-ease-of-delivery', averageScore: 3.0, responseCount: 6 },
    ],
  },
  {
    sessionId: 's2',
    closedAt: '2026-08-08T17:00:00.000Z',
    averages: [
      { questionId: 'q-delivering-value', averageScore: 3.9, responseCount: 6 },
      { questionId: 'q-team-collaboration', averageScore: 3.6, responseCount: 6 },
      { questionId: 'q-ease-of-delivery', averageScore: 3.0, responseCount: 5 },
    ],
  },
];

function row(name: RegExp | string) {
  return within(screen.getByRole('row', { name }));
}

describe('LatestSessionPanel', () => {
  it('says which session it is describing', () => {
    render(<LatestSessionPanel sessions={TWO_SESSIONS} anonymousMode={false} />);

    expect(screen.getByRole('region', { name: /latest session/i })).toHaveTextContent(
      /8 august 2026/i,
    );
  });

  it('gives each question its score and how many answered', () => {
    render(<LatestSessionPanel sessions={TWO_SESSIONS} anonymousMode={false} />);

    const delivering = row(/delivering value/i);
    expect(delivering.getByText('3.9')).toBeInTheDocument();
    expect(delivering.getByText(/6 responses/i)).toBeInTheDocument();
  });

  it('states the direction of change in words, not by symbol alone', () => {
    render(<LatestSessionPanel sessions={TWO_SESSIONS} anonymousMode={false} />);

    // An arrow or a colour would leave a screen reader user with a bare number
    expect(row(/delivering value/i).getByText(/0\.4 higher/i)).toBeInTheDocument();
    expect(row(/team collaboration/i).getByText(/0\.4 lower/i)).toBeInTheDocument();
    expect(row(/ease of delivery/i).getByText(/unchanged/i)).toBeInTheDocument();
  });

  it('says so plainly when there is nothing to compare against', () => {
    render(<LatestSessionPanel sessions={[TWO_SESSIONS[1]]} anonymousMode={false} />);

    expect(row(/delivering value/i).getByText(/first check/i)).toBeInTheDocument();
  });

  it('says a value is hidden rather than leaving it blank', () => {
    const sparse = [
      {
        sessionId: 's3',
        closedAt: '2026-08-15T17:00:00.000Z',
        averages: [{ questionId: 'q-delivering-value', averageScore: 4.5, responseCount: 2 }],
      },
    ];

    render(<LatestSessionPanel sessions={sparse} anonymousMode={true} />);

    const delivering = row(/delivering value/i);
    expect(delivering.getByText(/hidden until 3 people have answered/i)).toBeInTheDocument();
    // The score itself must not leak: two people's answers are identifiable
    expect(delivering.queryByText('4.5')).not.toBeInTheDocument();
  });

  it('shows values normally when the team is not anonymous', () => {
    const sparse = [
      {
        sessionId: 's3',
        closedAt: '2026-08-15T17:00:00.000Z',
        averages: [{ questionId: 'q-delivering-value', averageScore: 4.5, responseCount: 2 }],
      },
    ];

    render(<LatestSessionPanel sessions={sparse} anonymousMode={false} />);

    expect(row(/delivering value/i).getByText('4.5')).toBeInTheDocument();
  });

  it('renders nothing when no session has closed', () => {
    const { container } = render(<LatestSessionPanel sessions={[]} anonymousMode={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Dashboard Refinement 4.1, 4.2, 4.4.
   *
   * A question theme with no responses used to be absent from this table
   * entirely, because the rows came from the aggregates. A manager could not
   * tell a theme nobody answered from one that was never asked.
   */
  describe('question themes with no responses', () => {
    const QUESTIONS = [
      { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well…?' },
      { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe…?' },
    ];

    const oneAnswered = [
      {
        sessionId: 's1',
        closedAt: '2026-08-08T17:00:00.000Z',
        averages: [{ questionId: 'q-delivering-value', averageScore: 3.9, responseCount: 6 }],
      },
    ];

    it('lists a theme the session recorded nothing for', () => {
      render(
        <LatestSessionPanel sessions={oneAnswered} questions={QUESTIONS} anonymousMode={false} />,
      );

      expect(screen.getByRole('row', { name: /psychological safety/i })).toBeInTheDocument();
    });

    it('says the theme went unanswered rather than leaving it blank', () => {
      render(
        <LatestSessionPanel sessions={oneAnswered} questions={QUESTIONS} anonymousMode={false} />,
      );

      expect(row(/psychological safety/i).getByText(/no responses/i)).toBeInTheDocument();
    });

    it('does not confuse unanswered with hidden for anonymity', () => {
      // Different facts: one means nobody answered, the other means people did
      // and there were too few to show. They must not share wording.
      render(
        <LatestSessionPanel
          sessions={[
            {
              sessionId: 's1',
              closedAt: '2026-08-08T17:00:00.000Z',
              averages: [
                { questionId: 'q-delivering-value', averageScore: 4.5, responseCount: 2 },
              ],
            },
          ]}
          questions={QUESTIONS}
          anonymousMode={true}
        />,
      );

      expect(row(/delivering value/i).getByText(/hidden until/i)).toBeInTheDocument();
      expect(row(/psychological safety/i).getByText(/no responses/i)).toBeInTheDocument();
      expect(row(/psychological safety/i).queryByText(/hidden until/i)).not.toBeInTheDocument();
    });

    it('falls back to the answered themes when no catalogue is supplied', () => {
      // Keeps the panel usable if the trends response predates the catalogue
      render(<LatestSessionPanel sessions={oneAnswered} anonymousMode={false} />);

      expect(row(/delivering value/i).getByText('3.9')).toBeInTheDocument();
      expect(screen.queryByRole('row', { name: /psychological safety/i })).not.toBeInTheDocument();
    });
  });
});

/**
 * Saying why a value is not there.
 *
 * Requirements: Explaining Itself 1.1, 1.2, 1.3, 1.5
 *
 * Found by closing a check on production and reading the dashboard. It showed
 * nothing for five minutes because materialisation runs on the next tick, then
 * nothing permanently because one response is below the anonymity threshold —
 * two entirely different silences, indistinguishable from each other and from a
 * broken tool.
 */
describe('LatestSessionPanel explains an empty result', () => {
  const closedAt = '2026-09-14T19:20:00.000Z';
  const questions = [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well…' },
  ];

  const session = (over: Partial<{ materialisedAt: string | null; averages: unknown[] }> = {}) => [
    {
      sessionId: 's1',
      closedAt,
      materialisedAt: null,
      averages: [],
      ...over,
    },
  ];

  it('says results are being prepared just after a close', () => {
    render(
      <LatestSessionPanel
        sessions={session() as never}
        anonymousMode
        questions={questions}
        now={new Date('2026-09-14T19:22:00.000Z')}
      />,
    );

    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
  });

  it('says how long, so a reader knows whether to wait', () => {
    render(
      <LatestSessionPanel
        sessions={session() as never}
        anonymousMode
        questions={questions}
        now={new Date('2026-09-14T19:22:00.000Z')}
      />,
    );

    expect(screen.getByText(/minutes/i)).toBeInTheDocument();
  });

  it('says results are overdue rather than blaming the team', () => {
    /*
     * The message that would have surfaced a stopped scheduler. Reporting
     * "nobody answered" here is a false claim about a team, on a tool whose
     * whole purpose is telling you how that team is doing.
     */
    render(
      <LatestSessionPanel
        sessions={session() as never}
        anonymousMode
        questions={questions}
        now={new Date('2026-09-14T21:00:00.000Z')}
      />,
    );

    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    expect(screen.queryByText(/no responses/i)).not.toBeInTheDocument();
  });

  it('says a value is hidden for anonymity, and how many are needed', () => {
    render(
      <LatestSessionPanel
        sessions={session({
          materialisedAt: closedAt,
          averages: [{ questionId: 'q-delivering-value', averageScore: 3, responseCount: 1 }],
        }) as never}
        anonymousMode
        questions={questions}
        now={new Date('2026-09-14T21:00:00.000Z')}
      />,
    );

    expect(screen.getByText(/hidden/i)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('still says nobody answered when materialisation ran and found nothing', () => {
    render(
      <LatestSessionPanel
        sessions={session({ materialisedAt: closedAt }) as never}
        anonymousMode
        questions={questions}
        now={new Date('2026-09-14T21:00:00.000Z')}
      />,
    );

    expect(screen.getByText(/no responses/i)).toBeInTheDocument();
  });

  it('never shows two explanations for the same theme', () => {
    // Property 2: the states are exclusive
    render(
      <LatestSessionPanel
        sessions={session({ materialisedAt: closedAt }) as never}
        anonymousMode
        questions={questions}
        now={new Date('2026-09-14T21:00:00.000Z')}
      />,
    );

    expect(screen.queryByText(/being prepared/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });
});

/**
 * Explaining Itself NFR 2.1.
 *
 * Each explanation is a state the table can be in, and a state nothing has
 * ever audited is a state that can ship broken. The colspan cells in
 * particular are new structure, not new text: a cell spanning three columns
 * in a table with row headers is exactly the sort of thing that reads fine
 * and announces badly.
 *
 * jsdom's axe cannot judge colour contrast. The amber used here is checked by
 * hand and recorded where it is applied.
 */
describe('LatestSessionPanel accessibility in every state', () => {
  const CLOSED = '2026-09-14T17:00:00.000Z';
  const QUESTIONS = [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well…?' },
    { id: 'q-psychological-safety', title: 'Psychological Safety', description: 'How safe…?' },
  ];

  const states = {
    pending: {
      sessions: [{ sessionId: 's1', closedAt: CLOSED, averages: [] }],
      now: new Date('2026-09-14T17:02:00.000Z'),
      anonymousMode: false,
    },
    overdue: {
      sessions: [{ sessionId: 's1', closedAt: CLOSED, averages: [] }],
      now: new Date('2026-09-14T19:00:00.000Z'),
      anonymousMode: false,
    },
    /*
     * Overdue is four states now, not one, and each renders different text.
     * Auditing only the one the old code produced would leave the three added
     * for Remembering What Happened 5 unchecked — the same gap that let the
     * skip link and the sign-out failure go unaudited until somebody reached
     * them deliberately.
     */
    'overdue with the scheduler running': {
      sessions: [{ sessionId: 's1', closedAt: CLOSED, averages: [] }],
      now: new Date('2026-09-14T19:00:00.000Z'),
      anonymousMode: false,
      schedulerLastRanAt: '2026-09-14T18:00:00.000Z',
    },
    'overdue with the scheduler stalled': {
      sessions: [{ sessionId: 's1', closedAt: CLOSED, averages: [] }],
      now: new Date('2026-09-14T19:00:00.000Z'),
      anonymousMode: false,
      schedulerLastRanAt: '2026-09-13T09:00:00.000Z',
    },
    'overdue with the scheduler never run': {
      sessions: [{ sessionId: 's1', closedAt: CLOSED, averages: [] }],
      now: new Date('2026-09-14T19:00:00.000Z'),
      anonymousMode: false,
      schedulerLastRanAt: null,
    },
    unanswered: {
      sessions: [
        {
          sessionId: 's1',
          closedAt: CLOSED,
          materialisedAt: CLOSED,
          averages: [{ questionId: 'q-delivering-value', averageScore: 4, responseCount: 6 }],
        },
      ],
      now: new Date('2026-09-14T19:00:00.000Z'),
      anonymousMode: false,
    },
    suppressed: {
      sessions: [
        {
          sessionId: 's1',
          closedAt: CLOSED,
          materialisedAt: CLOSED,
          averages: [{ questionId: 'q-delivering-value', averageScore: 4, responseCount: 2 }],
        },
      ],
      now: new Date('2026-09-14T19:00:00.000Z'),
      anonymousMode: true,
    },
  };

  for (const [name, props] of Object.entries(states)) {
    it(`has no axe-detectable violations while ${name}`, async () => {
      const { container } = render(<LatestSessionPanel {...props} questions={QUESTIONS} />);

      expect(await axe(container)).toHaveNoViolations();
    });

    it(`keeps every theme addressable by its own row while ${name}`, () => {
      // The explanation replaces three cells with one. A row whose header no
      // longer pairs with anything is a table that reads as a list of names.
      render(<LatestSessionPanel {...props} questions={QUESTIONS} />);

      for (const question of QUESTIONS) {
        expect(screen.getByRole('row', { name: new RegExp(question.title, 'i') }))
          .toBeInTheDocument();
      }
    });
  }
});

describe('what the panel says when results are overdue', () => {
  /*
   * Requirements: Remembering What Happened 5.1, 5.2, 5.3, 5.4
   *
   * "The scheduler may not be running" was a guess from fifteen minutes of
   * silence. With a heartbeat the panel can report instead — and the three
   * cases want different things from the reader: wait, restart the trigger, or
   * go and configure one.
   */
  /*
   * Its own fixtures, because `session` and `questions` above belong to a
   * sibling describe and are not in scope here. Sibling describes share
   * nothing — the same trap that deleted a database out from under an
   * integration test earlier today.
   */
  const closedAt = new Date('2026-09-14T19:00:00.000Z');
  const overdueNow = new Date('2026-09-14T21:00:00.000Z');
  const themes = [
    { id: 'q-delivering-value', title: 'Delivering Value', description: 'How well…' },
  ];
  const closedSession = () => [
    {
      sessionId: 's1',
      closedAt: closedAt.toISOString(),
      materialisedAt: null,
      averages: [],
    },
  ];

  function panel(schedulerLastRanAt?: string | null, now = overdueNow) {
    return render(
      <LatestSessionPanel
        sessions={closedSession() as never}
        anonymousMode
        questions={themes}
        now={now}
        schedulerLastRanAt={schedulerLastRanAt}
      />,
    );
  }

  it('stops naming the scheduler when it has run since the check closed', () => {
    // Sending somebody to restart a trigger that is demonstrably running is
    // worse than saying nothing: it is the wrong half of the system
    panel(new Date(closedAt.getTime() + 60_000).toISOString());

    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
    expect(screen.queryByText(/scheduler/i)).not.toBeInTheDocument();
  });

  it('says when the scheduler last ran, if that was before the close', () => {
    panel(new Date(closedAt.getTime() - 60_000).toISOString());

    expect(screen.getByText(/scheduler has not run since 14 September 2026/i)).toBeInTheDocument();
  });

  it('says it has never run, rather than calling that a delay', () => {
    // A fresh deployment with a misconfigured CRON_SECRET, where "overdue"
    // points at a wait that is never going to end
    panel(null);

    expect(screen.getByText(/scheduler has never run/i)).toBeInTheDocument();
  });

  it('keeps the old wording when the response could not say', () => {
    panel(undefined);

    expect(screen.getByText(/scheduler may not be running/i)).toBeInTheDocument();
  });

  it('says none of it when the results are simply not due yet', () => {
    // A heartbeat must not turn a pending result into an alarm
    panel(null, new Date(closedAt.getTime() + 60_000));

    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
    expect(screen.queryByText(/never run/i)).not.toBeInTheDocument();
  });
});
