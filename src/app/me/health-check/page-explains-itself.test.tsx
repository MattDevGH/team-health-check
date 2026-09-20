/**
 * The health check page says what a health check is.
 *
 * Requirements: Explaining Itself 6.3, 6.4; Reaching Your Health Check 1.2
 *
 * This route was built as a deliberate pause before the form — a moment to see
 * what is about to be asked, rather than landing in it having clicked
 * "Health check" in the navigation. Twice in production it read instead as a
 * step that achieved nothing, because the pause had nothing in it: a button,
 * then the same button again.
 *
 * "The mid-step with the 'answer your health check' button still feels
 * redundant — we should either consider what else of value could be displayed
 * at this point, or increase the priority of re-architecting to remove this
 * step. Perhaps some kind of copy could go here explaining about what a health
 * check is, why it is valuable, the themes that will be asked about and why?"
 *
 * The decision on 2026-09-20 was to give the pause its content and revisit
 * removing it if that does not fix it. So this asserts the content exists and
 * survives — because content is the only reason the extra click is defensible,
 * and a page that loses it quietly goes back to being a step that achieved
 * nothing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import MyHealthCheckPage from './page';

expect.extend(toHaveNoViolations);

/** A check is open and this member has a link for it. */
function mockOpen() {
  server.use(
    http.get('/api/me/health-check', () =>
      HttpResponse.json({ kind: 'open', token: 'tok-abc' }),
    ),
  );
}

/** Nothing is collecting. */
function mockNothingOpen() {
  server.use(
    http.get('/api/me/health-check', () => HttpResponse.json({ kind: 'none_open' })),
  );
}

/**
 * The explanation, located by its accessible name.
 *
 * Not `main`: the /me layout supplies that landmark, and a page test renders
 * the page component alone. Asserting against a region the page owns also says
 * the content is a named part of the page rather than loose text.
 */
function about(): HTMLElement {
  return screen.getByRole('region', { name: /about (the )?health check/i });
}

async function renderPage() {
  render(<MyHealthCheckPage />);
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  mockOpen();
});

describe('what the page tells a member before they answer', () => {
  it('says what a health check is', async () => {
    await renderPage();

    expect(about()).toHaveTextContent(/five (short )?questions|same five/i);
  });

  it('says why answering is worth doing', async () => {
    /*
     * Requirement 6.3. "Answer the health check" is an instruction; a member
     * deciding whether to spend two minutes on it needs a reason, and the
     * reason is what the team does with the answers.
     */
    await renderPage();

    expect(about()).toHaveTextContent(/over time|trend|team|pattern/i);
  });

  it('names the themes that will be asked about', async () => {
    // The specific request: "the themes that will be asked about and why".
    // Naming them is also what makes the pause worth having — it is the last
    // moment before the form where a member can see the shape of it
    await renderPage();

    const rendered = about();
    for (const theme of [
      /delivering value/i,
      /team collaboration/i,
      /ease of delivery/i,
      /learning/i,
      /psychological safety/i,
    ]) {
      expect(rendered).toHaveTextContent(theme);
    }
  });

  it('says answers can be changed until the check closes', async () => {
    // The fact most likely to change how carefully somebody answers, and it
    // belongs before the form rather than in the confirmation afterwards
    await renderPage();

    expect(about()).toHaveTextContent(/change|until it closes/i);
  });

  it('still offers the way in', async () => {
    // Content instead of the button would be a different failure
    await renderPage();

    expect(screen.getByRole('link', { name: /answer the health check/i })).toHaveAttribute(
      'href',
      '/session/tok-abc',
    );
  });
});

describe('when there is nothing to answer', () => {
  it('still explains what a health check is', async () => {
    /*
     * The page is reached from the navigation at any time, so most visits find
     * nothing open. Explaining only when there is something to do would mean
     * the explanation is missing from every visit where somebody had time to
     * read it.
     */
    mockNothingOpen();
    await renderPage();

    expect(about()).toHaveTextContent(/five (short )?questions|same five/i);
  });

  it('offers no way in, because there is nowhere to go', async () => {
    mockNothingOpen();
    await renderPage();

    expect(screen.queryByRole('link', { name: /answer the health check/i })).toBeNull();
    expect(screen.getByText(/no health check is open/i)).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has no violations with the explanation on the page', async () => {
    // NFR 1. New content on an existing page is a new state for an audit
    const { container } = render(<MyHealthCheckPage />);
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('puts the themes in a named list rather than a paragraph of commas', async () => {
    /*
     * Five named things are a list, and a screen reader announces how many
     * there are — which is the number somebody deciding whether to start
     * actually wants.
     *
     * The name is asserted as present rather than as particular words: what
     * matters is that the list is introduced, and pinning the heading text
     * here would make this a copy of the implementation.
     */
    await renderPage();

    const list = within(about()).getByRole('list');
    expect(list).toHaveAccessibleName();
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });
});
