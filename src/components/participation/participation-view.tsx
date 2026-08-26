'use client';

import type { ParticipationViewInternalProps } from './types';

/**
 * Displays participation tracking data for a health check session.
 * Shows responded/total counts and non-responder names based on
 * privacy mode and user role.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6
 */
export function ParticipationView({
  data,
  privacyMode,
  userRole,
  isLoading = false,
  error = null,
}: ParticipationViewInternalProps) {
  if (isLoading) {
    return (
      <section aria-label="Participation" role="region">
        <p className="text-sm text-gray-500">Loading participation data...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Participation" role="region">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      </section>
    );
  }

  const { totalCount, respondedCount, nonResponders } = data;
  const allResponded = respondedCount >= totalCount && totalCount > 0;

  // Req 11.2: In anonymous mode, only delivery_manager sees non-responder names
  // Req 11.3: In attributed mode, all team members see non-responder names
  const canSeeNonResponderNames =
    privacyMode === 'attributed' || userRole === 'delivery_manager';

  return (
    <section aria-label="Participation" role="region" className="space-y-3">
      {/* Req 11.1: Display responded/total count */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-gray-900">
          {respondedCount} / {totalCount}
        </span>
        <span className="text-sm text-gray-600">responded</span>
      </div>

      {/* Full participation message */}
      {allResponded && (
        <p className="text-sm text-green-700">
          Everyone has responded!
        </p>
      )}

      {/* Non-responder list */}
      {!allResponded && canSeeNonResponderNames && nonResponders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            Not yet responded
          </h3>
          <ul className="space-y-1">
            {nonResponders.map((member) => (
              <li
                key={member.id}
                className="text-sm text-gray-600 pl-2"
              >
                {member.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
