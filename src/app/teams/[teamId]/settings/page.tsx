/**
 * Team Management Settings Page
 * Requirements: 1.1, 1.3, 1.6, 1.7, 2.7, 3.1, 14.4, 19.5
 *
 * Orchestrates sub-sections for team details, privacy mode,
 * members, schedule, and Slack delivery window configuration.
 */

'use client';

import { useEffect, useState } from 'react';

import { TeamDetailsSection } from './team-details-section';
import { PrivacyModeSection } from './privacy-mode-section';
import { MembersSection, type Member } from './members-section';
import { ScheduleSection, type ScheduleData } from './schedule-section';
import { SlackDeliverySection } from './slack-delivery-section';

interface TeamData {
  id: string;
  name: string;
  description: string;
  privacyMode: string;
  slackDeliveryStart: string;
  slackDeliveryEnd: string;
  timezone: string;
}

interface PageProps {
  params: Promise<{ teamId: string }>;
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

        if (!teamRes.ok) {
          if (!cancelled) {
            setError('Failed to load team');
            setLoading(false);
          }
          return;
        }

        const teamData: TeamData = await teamRes.json();
        const membersData: Member[] = await membersRes.json();
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  if (error || !team) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-red-600 font-medium">{error ?? 'Team not found'}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-gray-800">Team Settings</h1>

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
    </main>
  );
}
