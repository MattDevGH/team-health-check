/**
 * Members Section — List, add, remove, role assignment, Slack status
 * Requirements: 1.3, 1.6, 1.7, 2.7, 19.5
 */

'use client';

import { useState } from 'react';

interface MemberRole {
  role: string;
}

interface SlackLink {
  slackUserId: string;
}

export interface Member {
  id: string;
  name: string;
  email?: string;
  roles: MemberRole[];
  slackLink: SlackLink | null;
}

interface MembersSectionProps {
  teamId: string;
  members: Member[];
  onMembersChanged: (members: Member[]) => void;
}

export function MembersSection({ teamId, members, onMembersChanged }: MembersSectionProps) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function handleAddMember() {
    setAddError('');

    if (!newName.trim()) {
      setAddError('Name is required');
      return;
    }

    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body.errors?.[0]?.message ?? 'Failed to add member');
        return;
      }

      const member: Member = await res.json();
      onMembersChanged([...members, member]);
      setNewName('');
      setNewEmail('');
    } catch {
      setAddError('Network error');
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onMembersChanged(members.filter((m) => m.id !== memberId));
      }
    } catch {
      // Silently handle
    }

    setConfirmRemove(null);
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        onMembersChanged(
          members.map((m) =>
            m.id === memberId ? { ...m, roles: [{ role: newRole }] } : m
          )
        );
      }
    } catch {
      // Silently handle
    }
  }

  const memberToRemove = members.find((m) => m.id === confirmRemove);

  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="text-lg font-semibold text-gray-800 mb-3">
        Members
      </h2>

      {/* Member list */}
      <div className="space-y-2 mb-4">
        {members.map((member) => (
          <div
            key={member.id}
            data-testid="member-row"
            className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-gray-50 rounded-md"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{member.name}</p>
              {member.email && (
                <p className="text-sm text-gray-500 truncate">{member.email}</p>
              )}
            </div>

            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600 w-fit">
              {member.slackLink ? 'Slack linked' : 'Slack not linked'}
            </span>

            <select
              aria-label={`Role for ${member.name}`}
              value={member.roles[0]?.role ?? 'team_member'}
              onChange={(e) => handleRoleChange(member.id, e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="delivery_manager">Delivery Manager</option>
              <option value="team_member">Team Member</option>
            </select>

            <button
              type="button"
              onClick={() => setConfirmRemove(member.id)}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Remove
            </button>
          </div>
        ))}

        {members.length === 0 && (
          <p className="text-sm text-gray-500">No members added yet.</p>
        )}
      </div>

      {/* Confirm removal dialog */}
      {confirmRemove && memberToRemove && (
        <div className="p-4 border border-red-200 bg-red-50 rounded-md mb-4">
          <p className="text-sm text-gray-800 mb-3">
            Remove {memberToRemove.name} from the team? Their historical responses will be preserved.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleRemoveMember(confirmRemove)}
              className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add member form */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Add a member</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <label htmlFor="member-name" className="sr-only">Member name</label>
            <input
              id="member-name"
              type="text"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="member-email" className="sr-only">Member email</label>
            <input
              id="member-email"
              type="email"
              placeholder="Email (optional)"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <button
            type="button"
            onClick={handleAddMember}
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 text-sm"
          >
            Add member
          </button>
        </div>
        {addError && <p className="mt-1 text-sm text-red-600" role="alert">{addError}</p>}
      </div>
    </section>
  );
}
