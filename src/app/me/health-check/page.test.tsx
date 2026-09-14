/**
 * Tests for the member's own health check page.
 *
 * Requirements: Reaching Your Health Check 1.2, 1.3, 1.4, 1.5, 2.3
 *
 * Every state this page can be in says something different, because collapsing
 * them would tell a member nothing is happening when something is. "No check is
 * open" and "a check is open but you are not in it" are not the same news.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import MyHealthCheckPage from './page';

expect.extend(toHaveNoViolations);

function respondWith(body: Record<string, unknown>, status = 200) {
  server.use(http.get('/api/me/health-check', () => HttpResponse.json(body, { status })));
}

describe('My health check page', () => {
  beforeEach(() => {
    respondWith({ kind: 'none_open' });
  });

  it('offers a route to answer when a check is open', async () => {
    respondWith({ kind: 'open', sessionId: 's1', token: 'my-token' });
    render(<MyHealthCheckPage />);

    const link = await screen.findByRole('link', { name: /answer the health check/i });
    expect(link).toHaveAttribute('href', '/session/my-token');
  });

  it('says answers can be changed until it closes', async () => {
    // Requirement 1.4: responses are editable, and a member who thinks they are
    // final will answer more cautiously
    respondWith({ kind: 'open', sessionId: 's1', token: 'my-token' });
    render(<MyHealthCheckPage />);

    await screen.findByRole('link', { name: /answer the health check/i });
    expect(screen.getByText(/change them until it closes/i)).toBeInTheDocument();
  });

  it('does not redirect automatically', async () => {
    // Landing straight in a form gives no moment to realise what is about to be
    // asked, and no way back without the browser button
    respondWith({ kind: 'open', sessionId: 's1', token: 'my-token' });
    render(<MyHealthCheckPage />);

    const link = await screen.findByRole('link', { name: /answer the health check/i });
    expect(link.tagName).toBe('A');
  });

  it('says nothing is open, rather than erroring', async () => {
    render(<MyHealthCheckPage />);

    expect(await screen.findByText(/no health check is open/i)).toBeInTheDocument();
  });

  it('distinguishes "not included" from "nothing open"', async () => {
    /*
     * A member added after the check opened has no link for it. Saying nothing
     * is open would be false, and it is the difference between "relax" and
     * "ask your delivery manager".
     */
    respondWith({ kind: 'no_link', sessionId: 's1' });
    render(<MyHealthCheckPage />);

    const message = await screen.findByText(/not included in it/i);
    expect(message).toBeInTheDocument();
    expect(screen.queryByText(/no health check is open/i)).not.toBeInTheDocument();
  });

  it('never renders a link it was not given', async () => {
    // The whole point of resolving server-side: no token, no link
    respondWith({ kind: 'no_link', sessionId: 's1' });
    render(<MyHealthCheckPage />);

    await screen.findByText(/not included in it/i);
    expect(screen.queryByRole('link', { name: /answer/i })).not.toBeInTheDocument();
  });

  it('reports a failure rather than pretending nothing is open', async () => {
    respondWith({ error: 'boom' }, 500);
    render(<MyHealthCheckPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });

  it('has no axe-detectable violations while a check is open', async () => {
    respondWith({ kind: 'open', sessionId: 's1', token: 'my-token' });
    const { container } = render(<MyHealthCheckPage />);

    await screen.findByRole('link', { name: /answer the health check/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe-detectable violations when nothing is open', async () => {
    const { container } = render(<MyHealthCheckPage />);

    await screen.findByText(/no health check is open/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('does not update after the reader has left', async () => {
    // The homepage shipped this defect: a request resolving after unmount still
    // acted. Same shape, so the same guard, asserted rather than assumed.
    respondWith({ kind: 'open', sessionId: 's1', token: 'my-token' });
    const { unmount } = render(<MyHealthCheckPage />);
    unmount();

    await new Promise(resolve => setTimeout(resolve, 50));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /answer/i })).not.toBeInTheDocument(),
    );
  });
});
