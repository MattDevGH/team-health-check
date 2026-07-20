/**
 * Tests for Magic Link Request Page
 *
 * Requirements: 7.1, 7.8
 * - Provides "Request access link" function using only email address
 * - Allows requests from login page without prior authentication
 * - Displays generic success message regardless of email existence (anti-enumeration)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect } from 'vitest';

import { server } from '@/tests/mocks/server';
import LoginPage from './page';

describe('Magic Link Request Page', () => {
  it('renders an email input and submit button', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /request access link/i }),
    ).toBeInTheDocument();
  });

  it('validates email format before submission', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const submitBtn = screen.getByRole('button', { name: /request access link/i });

    await user.type(emailInput, 'not-an-email');
    await user.click(submitBtn);

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it('shows loading state during submission', async () => {
    server.use(
      http.post('/api/auth/magic-link/request', async () => {
        // Delay response to observe loading state
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ message: 'If this email is registered, a link has been sent.' });
      }),
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const submitBtn = screen.getByRole('button', { name: /request access link/i });

    await user.type(emailInput, 'team@example.com');
    await user.click(submitBtn);

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });

  it('displays generic success message after successful submission', async () => {
    server.use(
      http.post('/api/auth/magic-link/request', () => {
        return HttpResponse.json({ message: 'If this email is registered, a link has been sent.' });
      }),
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const submitBtn = screen.getByRole('button', { name: /request access link/i });

    await user.type(emailInput, 'team@example.com');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/if your email is registered/i),
      ).toBeInTheDocument();
    });
  });

  it('displays generic success message even if API returns error', async () => {
    server.use(
      http.post('/api/auth/magic-link/request', () => {
        return HttpResponse.json(
          { errors: [{ field: 'email', message: 'Rate limited', code: 'RATE_LIMIT' }] },
          { status: 429 },
        );
      }),
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const submitBtn = screen.getByRole('button', { name: /request access link/i });

    await user.type(emailInput, 'team@example.com');
    await user.click(submitBtn);

    // Anti-enumeration: always show generic success regardless of server response
    await waitFor(() => {
      expect(
        screen.getByText(/if your email is registered/i),
      ).toBeInTheDocument();
    });
  });

  it('does not submit with empty email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submitBtn = screen.getByRole('button', { name: /request access link/i });
    await user.click(submitBtn);

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });
});
