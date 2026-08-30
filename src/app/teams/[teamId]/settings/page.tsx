/**
 * Team Management Settings Page
 * Requirements: 1.1, 1.3, 1.6, 1.7, 2.7, 3.1, 14.4, 19.5
 *
 * Orchestrates sub-sections for team details, privacy mode,
 * members, schedule, and Slack delivery window configuration.
 */

'use client';

import { useEffect, useState } from 'react';

import { GuidanceBanner, type GuidanceItem } from '@/components/guidance';
import { TeamDetailsSection } from './team-details-section';
import { PrivacyModeSection } from './privacy-mode-section';
import { MembersSection, type Member } from './members-section';
import { normalizeMembers } from './member-contract';
import { ScheduleSection, type ScheduleData } from './schedule-section';
import { SlackDeliverySection } from './slack-delivery-section';

interface TeamData {
  id: string;
  name: string;
  description: string;
  privacyMode: string;
  slackDeliveryStart: string | null;
  slackDeliveryEnd: string | null;
  timezone: string;
}

interface PageProps {
  params: Promise<{ teamId: string }>;
}

/**
 * What a manager still needs to do, from data this page has already loaded.
 *
 * Members and schedule guidance lives here rather than on the dashboard: this
 * is the page that does both jobs, and the dashboard would need two extra
 * requests to know whether to say anything.
 */
function settingsGuidance(state: {
  members: Member[];
  schedule: ScheduleData | null;
}): GuidanceItem[] {
  const items: GuidanceItem[] = [];

  // A team of one is the state every team starts in, and a health check of one
  // person is not a health check
  if (state.members.length <= 1) {
    items.push({
      id: 'members',
      message: 'Add the rest of your team below — a check needs more than one person to be useful.',
    });
  }

  if (!state.schedule) {
    items.push({
      id: 'schedule',
      message:
        'Choose a schedule below to open and close checks automatically. Without one you can still open each check yourself from the dashboard.',
    });
  }

  return items;
}

export default function TeamSettingsPage({ params }: PageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { teamId } = await params;

      try {
        const [teamRes, membersRes, scheduleRes] = await Promise.all([
          fetch(`/api/teams/${teamId}`),
          fetch(`/api/teams/${teamId}/members`),
          fetch(`/api/teams/${teamId}/schedule`),
        ]);

        if (!teamRes.ok || !membersRes.ok) {
          if (!cancelled) {
            setError(!teamRes.ok ? 'Failed to load team' : 'Failed to load team members');
            setLoading(false);
          }
          return;
        }

        const teamData: TeamData = await teamRes.json();
        const membersData = normalizeMembers(await membersRes.json());
        const scheduleData = await scheduleRes.json();

        if (!cancelled) {
          setTeam(teamData);
          setMembers(membersData);
          setSchedule(scheduleData.schedule ?? null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load team settings');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-red-600 font-medium">{error ?? 'Team not found'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-gray-800">Team Settings</h1>

        <GuidanceBanner items={settingsGuidance({ members, schedule })} />

        <TeamDetailsSection
          teamId={team.id}
          name={team.name}
          description={team.description}
          onUpdated={({ name, description }) =>
            setTeam((t) => t ? { ...t, name, description } : t)
          }
        />

        <PrivacyModeSection
          teamId={team.id}
          privacyMode={team.privacyMode}
          onUpdated={(mode) => setTeam((t) => t ? { ...t, privacyMode: mode } : t)}
        />

        <MembersSection
          teamId={team.id}
          members={members}
          onMembersChanged={setMembers}
        />

        <ScheduleSection
          teamId={team.id}
          schedule={schedule}
          onUpdated={setSchedule}
        />

        <SlackDeliverySection
          teamId={team.id}
          deliveryStart={team.slackDeliveryStart}
          deliveryEnd={team.slackDeliveryEnd}
          onUpdated={(start, end) =>
            setTeam((t) => t ? { ...t, slackDeliveryStart: start, slackDeliveryEnd: end } : t)
          }
        />
      </div>
    </div>
  );
}
