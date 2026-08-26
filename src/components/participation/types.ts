/**
 * Types for the ParticipationView component.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6
 */

export interface NonResponder {
  id: string;
  name: string;
}

export interface ParticipationData {
  totalCount: number;
  respondedCount: number;
  nonResponders: NonResponder[];
}

export type PrivacyMode = 'anonymous' | 'attributed';
export type UserRole = 'delivery_manager' | 'team_member';

export interface ParticipationViewProps {
  /** Team ID for the session */
  teamId: string;
  /** Session ID to fetch participation for */
  sessionId: string;
  /** Current user's role in the team */
  userRole: UserRole;
  /** Team's privacy mode setting */
  privacyMode: PrivacyMode;
}

export interface ParticipationViewInternalProps {
  /** Participation data fetched from the API */
  data: ParticipationData;
  /** Team's privacy mode setting */
  privacyMode: PrivacyMode;
  /** Current user's role in the team */
  userRole: UserRole;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Error message if fetch failed */
  error?: string | null;
}
