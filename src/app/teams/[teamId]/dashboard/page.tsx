'use client';

/**
 * Trend Dashboard Page
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8
 *
 * Displays trend line chart of average scores per question across closed sessions.
 * Shows "More data needed" if fewer than 2 closed sessions.
 * Displays response counts alongside averages and trend indicator distribution.
 * Clickable question detail view with anonymity threshold suppression.
 */

import { useEffect, useState } from 'react';

import { GuidanceBanner, type GuidanceItem } from '@/components/guidance';
import { SessionLifecyclePanel } from '@/components/session-lifecycle';
import { LatestSessionPanel } from './latest-session-panel';
import { TrendChart } from './trend-chart';
import { TrendDistribution as TrendDistributionPanel } from './trend-distribution';
import { QuestionDetailView } from './question-detail-view';

interface SessionAverage {
  questionId: string;
  averageScore: number;
  responseCount: number;
}

interface SessionData {
  sessionId: string;
  closedAt: string;
  averages: SessionAverage[];
}

interface TrendDistributionData {
  questionId: string;
  improving: number;
  stable: number;
  declining: number;
}

/** One entry of the fixed question catalogue, from the trends response. */
interface QuestionCatalogueEntry {
  id: string;
  title: string;
  description: string;
}

interface TrendsResponse {
  sessions: SessionData[];
  trendDistribution: TrendDistributionData[];
  privacyMode?: string;
  /**
   * The team's question themes. Optional so the page still renders against a
   * response that predates the catalogue, but without it a theme nobody
   * answered cannot be named.
   */
  questions?: QuestionCatalogueEntry[];
}

interface PageProps {
  params: Promise<{ teamId: string }>;
}

/** Suppression threshold, matching the trend service and the drill-down. */
const ANONYMITY_THRESHOLD = 3;

/**
 * What the dashboard can usefully say next, from data it has already loaded.
 *
 * Guidance about members and the schedule lives on the settings page, which is
 * where both jobs are done and which already holds the data to know whether to
 * offer it. Here it would cost two extra requests to say something the manager
 * would have to leave for anyway.
 */
function dashboardGuidance(state: {
  closedSessionCount: number;
  anonymousMode: boolean;
  canManage: boolean;
}): GuidanceItem[] {
  const items: GuidanceItem[] = [];

  if (state.closedSessionCount === 0) {
    items.push({
      id: 'no-sessions',
      message: state.canManage
        ? 'Trends appear once a health check has closed. Open one above to get started.'
        : 'Trends appear once a health check has closed.',
    });
  } else if (state.closedSessionCount === 1) {
    items.push({
      id: 'one-session',
      message:
        'One check has closed. A second gives the first something to be compared against, and the trend lines begin there.',
    });
  }

  // Said before a manager meets a blank row and reads it as nobody answering
  if (state.anonymousMode) {
    items.push({
      id: 'anonymity',
      message: `This team is in anonymous mode, so a question answered by fewer than ${ANONYMITY_THRESHOLD} people is hidden rather than shown. Hidden is not the same as unanswered.`,
    });
  }

  return items;
}

export default function TrendDashboardPage({ params }: PageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;

    params.then(({ teamId: id }) => {
      if (!cancelled) setTeamId(id);
    });

    return () => {
      cancelled = true;
    };
  }, [params]);

  /**
   * Lifecycle controls are Delivery-Manager-only (Requirement 2.6), and the
   * roles come from the same endpoint the navigation shell uses.
   *
   * Fetched again here rather than shared from the shell: a context would
   * couple this page to being rendered inside that layout, and one small GET is
   * a fair price for the page standing on its own.
   */
  useEffect(() => {
    let cancelled = false;

    fetch('/api/me')
      .then(res => (res.ok ? res.json() : null))
      .then((me: { roles?: string[] } | null) => {
        if (!cancelled && me) {
          setCanManage(Array.isArray(me.roles) && me.roles.includes('delivery_manager'));
        }
      })
      .catch(() => {
        // A page that cannot read roles simply offers no controls
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrends() {
      const { teamId } = await params;

      try {
        const res = await fetch(`/api/teams/${teamId}/trends`);
        if (!res.ok) {
          if (!cancelled) {
            setError('Failed to load trend data');
            setLoading(false);
          }
          return;
        }

        const json: TrendsResponse = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load trend data');
          setLoading(false);
        }
      }
    }

    fetchTrends();
    return () => { cancelled = true; };
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { sessions, trendDistribution, privacyMode, questions } = data;
  const hasEnoughData = sessions.length >= 2;
  const anonymousMode = privacyMode === 'anonymous';

  /**
   * The lifecycle panel belongs in every data state, not only the populated
   * one: a team with no closed sessions is exactly the team that most needs to
   * open its first check.
   *
   * Sessions in the trends response are the ones whose aggregates exist, so
   * their ids are what tells the panel a closed check has results — no extra
   * request.
   */
  const guidance = dashboardGuidance({
    closedSessionCount: sessions.length,
    anonymousMode,
    canManage,
  });

  const lifecyclePanel =
    canManage && teamId ? (
      <div className="mb-6">
        <SessionLifecyclePanel
          teamId={teamId}
          materialisedSessionIds={sessions.map(session => session.sessionId)}
        />
      </div>
    ) : null;

  if (!hasEnoughData) {
    return (
      <div className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Trend Dashboard
          </h1>

          {lifecyclePanel}
          <GuidanceBanner items={guidance} />
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 text-lg">
              More data needed
            </p>
            <p className="text-gray-600 text-sm mt-2">
              At least 2 closed sessions are required to display trends.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Trend Dashboard
        </h1>

        {lifecyclePanel}
        <GuidanceBanner items={guidance} />

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <TrendChart sessions={sessions} />
        </div>

        <LatestSessionPanel
          sessions={sessions}
          questions={questions}
          anonymousMode={anonymousMode}
        />

        {trendDistribution.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              Trend Indicators
            </h2>
            <TrendDistributionPanel distribution={trendDistribution} />
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 mt-6">
          <QuestionDetailView
            sessions={sessions}
            questions={questions}
            anonymousMode={anonymousMode}
          />
        </div>
      </div>
    </div>
  );
}
