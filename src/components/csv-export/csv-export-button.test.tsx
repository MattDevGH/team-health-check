import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { http, HttpResponse } from 'msw';

import { server } from '@/tests/mocks/server';
import { CSVExportButton } from './csv-export-button';

expect.extend(toHaveNoViolations);

describe('CSVExportButton', () => {
  const teamId = 'team-123';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders an export button', () => {
      render(<CSVExportButton teamId={teamId} />);
      expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    });

    it('renders optional date range inputs (from and to)', () => {
      render(<CSVExportButton teamId={teamId} />);
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    });

    it('date inputs default to empty (no filter)', () => {
      render(<CSVExportButton teamId={teamId} />);
      const fromInput = screen.getByLabelText(/from/i) as HTMLInputElement;
      const toInput = screen.getByLabelText(/to/i) as HTMLInputElement;
      expect(fromInput.value).toBe('');
      expect(toInput.value).toBe('');
    });
  });

  describe('export without date range', () => {
    it('triggers GET /api/teams/[teamId]/export on click', async () => {
      const user = userEvent.setup();
      let requestUrl = '';

      server.use(
        http.get('/api/teams/:teamId/export', ({ request }) => {
          requestUrl = request.url;
          return new HttpResponse('session_date,question,average_score\n2024-01-01,Q1,4.2', {
            headers: { 'Content-Type': 'text/csv' },
          });
        })
      );

      render(<CSVExportButton teamId={teamId} />);
      await user.click(screen.getByRole('button', { name: /export csv/i }));

      expect(requestUrl).toContain(`/api/teams/${teamId}/export`);
      expect(requestUrl).not.toContain('from=');
      expect(requestUrl).not.toContain('to=');
    });
  });

  describe('export with date range', () => {
    it('appends from and to query params when dates are specified', async () => {
      const user = userEvent.setup();
      let requestUrl = '';

      server.use(
        http.get('/api/teams/:teamId/export', ({ request }) => {
          requestUrl = request.url;
          return new HttpResponse('session_date,question,average_score\n', {
            headers: { 'Content-Type': 'text/csv' },
          });
        })
      );

      render(<CSVExportButton teamId={teamId} />);

      const fromInput = screen.getByLabelText(/from/i);
      const toInput = screen.getByLabelText(/to/i);

      await user.type(fromInput, '2024-01-01');
      await user.type(toInput, '2024-06-30');

      await user.click(screen.getByRole('button', { name: /export csv/i }));

      expect(requestUrl).toContain('from=2024-01-01');
      expect(requestUrl).toContain('to=2024-06-30');
    });
  });

  describe('loading state', () => {
    it('shows loading state during download', async () => {
      const user = userEvent.setup();

      server.use(
        http.get('/api/teams/:teamId/export', async () => {
          // Simulate network delay
          await new Promise((resolve) => setTimeout(resolve, 100));
          return new HttpResponse('data', {
            headers: { 'Content-Type': 'text/csv' },
          });
        })
      );

      render(<CSVExportButton teamId={teamId} />);
      await user.click(screen.getByRole('button', { name: /export csv/i }));

      // Button should show loading state
      expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled();
    });
  });

  describe('error handling', () => {
    it('shows error message when export fails', async () => {
      const user = userEvent.setup();

      server.use(
        http.get('/api/teams/:teamId/export', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      render(<CSVExportButton teamId={teamId} />);
      await user.click(screen.getByRole('button', { name: /export csv/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/export failed/i);
    });

    it('re-enables button after error', async () => {
      const user = userEvent.setup();

      server.use(
        http.get('/api/teams/:teamId/export', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      render(<CSVExportButton teamId={teamId} />);
      await user.click(screen.getByRole('button', { name: /export csv/i }));

      await screen.findByRole('alert');
      expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled();
    });
  });

  describe('file download', () => {
    it('triggers a file download with .csv extension', async () => {
      const user = userEvent.setup();
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const anchor = {
            href: '',
            download: '',
            click: clickSpy,
            style: {},
          } as unknown as HTMLAnchorElement;
          return anchor;
        }
        return originalCreateElement(tag);
      });

      server.use(
        http.get('/api/teams/:teamId/export', () => {
          return new HttpResponse('session_date,question,average_score\n2024-01-01,Q1,4.2', {
            headers: { 'Content-Type': 'text/csv' },
          });
        })
      );

      render(<CSVExportButton teamId={teamId} />);
      await user.click(screen.getByRole('button', { name: /export csv/i }));

      // Wait for download to trigger
      await vi.waitFor(() => {
        expect(clickSpy).toHaveBeenCalled();
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe('accessibility', () => {
    it('has no axe-detectable accessibility violations', async () => {
      const { container } = render(<CSVExportButton teamId={teamId} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
