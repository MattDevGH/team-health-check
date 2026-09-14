/**
 * Trend indicators must respect anonymity, as scores do.
 *
 * Requirements: 9.1, 9.2
 *
 * Found on production, 2026-09-14. A team in anonymous mode with one response
 * correctly hid every score behind "fewer than 3 people answered" — and showed
 * `Stable: 1` beside it, which tells any reader exactly what that one person
 * said.
 *
 * A trend indicator is an opinion attached to a person just as much as a score
 * is. Protecting one and not the other makes the protection theatre: in a team
 * of three where two have not answered, `Declining: 1` is attributable by
 * elimination.
 *
 * The same root as the score suppression this project already built —
 * suppression was applied to the aggregate path and the trend path was never
 * brought along.
 *
 * The threshold is applied to the number of *trend indicators*, not to the
 * response count. A trend is optional alongside a score, so those numbers
 * differ, and the identifying quantity here is how many people expressed a
 * trend.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TrendDistribution } from './trend-distribution';

const question = 'q-delivering-value';

/** One person said "stable" and nobody else expressed a trend. */
const singleVoice = [{ questionId: question, improving: 0, stable: 1, declining: 0 }];

/** Three people, which is the threshold. */
const threeVoices = [{ questionId: question, improving: 1, stable: 1, declining: 1 }];

describe('TrendDistribution under anonymity', () => {
  it('hides counts that would identify a single person', () => {
    render(<TrendDistribution distribution={singleVoice} anonymousMode />);

    expect(screen.queryByText(/stable: 1/i)).not.toBeInTheDocument();
  });

  it('says why they are hidden, rather than showing nothing', () => {
    // Silence reads as "nobody answered", which is a different and false claim
    render(<TrendDistribution distribution={singleVoice} anonymousMode />);

    expect(screen.getByText(/fewer than 3/i)).toBeInTheDocument();
  });

  it('still names the question theme, so absence is attributable to the theme', () => {
    render(<TrendDistribution distribution={singleVoice} anonymousMode />);

    expect(screen.getByText(/delivering value/i)).toBeInTheDocument();
  });

  it('shows counts once the threshold is met', () => {
    render(<TrendDistribution distribution={threeVoices} anonymousMode />);

    expect(screen.getByText(/improving: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/stable: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/declining: 1/i)).toBeInTheDocument();
  });

  it('counts the total across all three words, not any one of them', () => {
    // Two improving and one declining is three voices, and none of the three
    // counts individually reaches the threshold
    render(
      <TrendDistribution
        distribution={[{ questionId: question, improving: 2, stable: 0, declining: 1 }]}
        anonymousMode
      />,
    );

    expect(screen.getByText(/improving: 2/i)).toBeInTheDocument();
  });

  it('hides a two-voice question, which is still below the threshold', () => {
    render(
      <TrendDistribution
        distribution={[{ questionId: question, improving: 1, stable: 1, declining: 0 }]}
        anonymousMode
      />,
    );

    expect(screen.queryByText(/improving: 1/i)).not.toBeInTheDocument();
  });

  it('suppresses each question on its own evidence', async () => {
    // Distinct counts, so the assertion cannot be satisfied by the other
    // question. The first version used stable: 1 for both and passed against
    // the visible one.
    render(
      <TrendDistribution
        distribution={[
          { questionId: 'q-delivering-value', improving: 0, stable: 1, declining: 0 },
          { questionId: 'q-team-collaboration', improving: 4, stable: 2, declining: 1 },
        ]}
        anonymousMode
      />,
    );

    expect(screen.getByText(/improving: 4/i)).toBeInTheDocument();
    expect(screen.getAllByText(/hidden — fewer than 3/i)).toHaveLength(1);
  });
});

describe('TrendDistribution in attributed mode', () => {
  it('shows a single voice, because nothing is being promised', () => {
    // Attributed mode tells members their answers are visible. Hiding here
    // would be protecting a privacy the team was never offered.
    render(<TrendDistribution distribution={singleVoice} anonymousMode={false} />);

    expect(screen.getByText(/stable: 1/i)).toBeInTheDocument();
  });

  it('still explains what the counts are', () => {
    render(<TrendDistribution distribution={threeVoices} anonymousMode={false} />);

    expect(screen.getByText(/counts of what people chose/i)).toBeInTheDocument();
  });
});
