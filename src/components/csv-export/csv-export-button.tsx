'use client';

import { useState, useCallback } from 'react';

interface CSVExportButtonProps {
  teamId: string;
}

/**
 * CSV Export button component with optional date range filtering.
 * Triggers GET /api/teams/[teamId]/export and downloads the result as a .csv file.
 *
 * Validates: Requirements 8.9, 8.11
 */
export function CSVExportButton({ teamId }: CSVExportButtonProps) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const queryString = params.toString();
      const url = `/api/teams/${teamId}/export${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `team-${teamId}-trends.csv`;
      anchor.click();

      URL.revokeObjectURL(downloadUrl);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [teamId, fromDate, toDate]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="csv-export-from" className="text-sm font-medium text-gray-700">
          From
        </label>
        <input
          id="csv-export-from"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="csv-export-to" className="text-sm font-medium text-gray-700">
          To
        </label>
        <input
          id="csv-export-to"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        aria-label={isExporting ? 'Exporting...' : 'Export CSV'}
        className={`
          rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors
          ${isExporting
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }
        `}
      >
        {isExporting ? 'Exporting...' : 'Export CSV'}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
