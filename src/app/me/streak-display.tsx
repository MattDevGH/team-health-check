/**
 * Streak display component (de-emphasised).
 * Requirements: 17.1, 17.2, 17.5
 *
 * Shows current and best streak in muted styling to avoid gamification pressure.
 */

interface StreakDisplayProps {
  currentStreak: number;
  bestStreak: number;
}

export function StreakDisplay({ currentStreak, bestStreak }: StreakDisplayProps) {
  return (
    <section
      data-testid="streak-section"
      className="bg-white rounded-lg shadow p-4 text-gray-500"
    >
      <h2 className="text-sm font-semibold mb-2">Participation</h2>
      <div className="flex justify-between text-sm">
        <div>
          <p className="text-xs">Current streak</p>
          <p className="text-lg">{currentStreak}</p>
        </div>
        <div>
          <p className="text-xs">Best streak</p>
          <p className="text-lg">{bestStreak}</p>
        </div>
      </div>
    </section>
  );
}
