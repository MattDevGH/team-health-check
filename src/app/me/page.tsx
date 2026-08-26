'use client';

/**
 * User Profile & Preferences Page
 * Requirements: 13.1, 15.1, 15.2, 12.1, 17.1, 17.2, 17.5, 2.6, NFR 4.3, NFR 4.4, 14.7
 *
 * Displays user profile info, cadence preference toggle, reminder toggle,
 * availability picker, streak display, Slack unlink, data deletion,
 * and current privacy mode.
 */

import { useEffect, useState } from 'react';

import { CadencePreference } from './cadence-preference';
import { ReminderToggle } from './reminder-toggle';
import { AvailabilityPicker } from './availability-picker';
import { StreakDisplay } from './streak-display';
import { SlackSection } from './slack-section';
import { DeleteDataSection } from './delete-data-section';

interface SlackLink {
  slackUserId: string;
}

interface ProfileData {
  id: string;
  name: string;
  email: string;
  cadencePreference: string;
  remindersEnabled: boolean;
  currentStreak: number;
  bestStreak: number;
  slackLink: SlackLink | null;
  privacyMode: string;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) {
          if (!cancelled) {
            setError('Failed to load profile');
            setLoading(false);
          }
          return;
        }
        const data: ProfileData = await res.json();
        if (!cancelled) {
          setProfile(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load profile');
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-red-600 font-medium">{error}</p>
      </main>
    );
  }

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Profile</h1>

        <section className="bg-white rounded-lg shadow p-4">
          <p className="text-lg font-medium text-gray-900">{profile.name}</p>
          <p className="text-sm text-gray-500">{profile.email}</p>
          <p className="mt-2 text-xs text-gray-600">
            Privacy mode: <span className="font-medium">{profile.privacyMode}</span>
          </p>
        </section>

        <CadencePreference
          value={profile.cadencePreference}
          onChange={(cadence) => setProfile({ ...profile, cadencePreference: cadence })}
        />

        <ReminderToggle
          enabled={profile.remindersEnabled}
          onChange={(enabled) => setProfile({ ...profile, remindersEnabled: enabled })}
        />

        <AvailabilityPicker />

        <StreakDisplay
          currentStreak={profile.currentStreak}
          bestStreak={profile.bestStreak}
        />

        <SlackSection slackLink={profile.slackLink} />

        <DeleteDataSection />
      </div>
    </main>
  );
}
