/** Members list and mutations. Requirements: 1.3, 1.6, 1.7, 2.7, 19.5-19.9. */
'use client';

import { useState } from 'react';

import { isTeamRole, type MemberSummary } from '@/lib/contracts/member-summary';

import { apiErrorMessage, normalizeMember, normalizeMembers } from './member-contract';

export type Member = MemberSummary;

interface MembersSectionProps {
  teamId: string;
  members: Member[];
  onMembersChanged: (members: Member[]) => void;
}

async function readBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function MembersSection({ teamId, members, onMembersChanged }: MembersSectionProps) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /** What the manager has typed, per member, before they save it. */
  const [slackIds, setSlackIds] = useState<Record<string, string>>({});
  const safeMembers = normalizeMembers(members);

  async function handleAddMember() {
    setAddError('');
    if (!newName.trim()) {
      setAddError('Name is required');
      return;
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || undefined }),
      });
      const body = await readBody(response);
      if (!response.ok) {
        setAddError(apiErrorMessage(body, 'Failed to add member'));
        return;
      }
      const member = normalizeMember(body);
      if (!member) {
        setAddError('The server returned an invalid member');
        return;
      }
      onMembersChanged([...safeMembers, member]);
      setNewName('');
      setNewEmail('');
    } catch {
      setAddError('Network error');
    }
  }
  async function handleRemoveMember(memberId: string) {
    setActionError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, { method: 'DELETE' });
      const body = await readBody(response);
      if (!response.ok) {
        setActionError(apiErrorMessage(body, 'Failed to remove member'));
        return;
      }
      onMembersChanged(safeMembers.filter((member) => member.id !== memberId));
      setConfirmRemove(null);
    } catch {
      setActionError('Network error while removing member');
    }
  }

  /**
   * Record, change or clear which Slack account belongs to a member.
   *
   * Requirements: Slack Sign In 2.1, 2.4
   *
   * The state comes from the server's answer rather than from the click, the
   * same rule the role control follows — a row that showed "Slack linked"
   * because a button was pressed would be reporting an intention.
   */
  async function handleSlackBinding(memberId: string, slackUserId: string | null) {
    setActionError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackUserId }),
      });
      const body = await readBody(response);
      if (!response.ok) {
        setActionError(apiErrorMessage(body, 'Failed to update the Slack account'));
        return;
      }
      const updated = normalizeMember(body);
      if (!updated) {
        setActionError('The server returned an invalid member');
        return;
      }
      onMembersChanged(safeMembers.map((member) => member.id === memberId ? updated : member));
      setSlackIds((current) => ({ ...current, [memberId]: '' }));
    } catch {
      setActionError('Network error while updating the Slack account');
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    if (!isTeamRole(newRole)) return;
    setActionError('');
    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const body = await readBody(response);
      if (!response.ok) {
        setActionError(apiErrorMessage(body, 'Failed to update member role'));
        return;
      }
      const updated = normalizeMember(body);
      if (!updated) {
        setActionError('The server returned an invalid member');
        return;
      }
      onMembersChanged(safeMembers.map((member) => member.id === memberId ? updated : member));
    } catch {
      setActionError('Network error while updating member role');
    }
  }

  const memberToRemove = safeMembers.find((member) => member.id === confirmRemove);

  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="text-lg font-semibold text-gray-800 mb-3">Members</h2>
      <p className="mb-3 text-sm text-gray-600">
        A <strong>delivery manager</strong> can open and close health checks,
        change these settings, add and remove members, and read the audit log. A
        <strong> team member</strong> answers checks and sees the team&rsquo;s
        trends. Every team needs at least one delivery manager, so the last one
        cannot be removed or demoted.
      </p>
      <p className="mb-3 text-sm text-gray-600">
        <strong>Slack not linked</strong> means that person has not connected
        their Slack account, so prompts and reminders reach them by email link
        only — they can still answer everything. They can link it themselves by
        running <code className="mx-1 rounded bg-gray-100 px-1">/healthcheck connect</code>
        in Slack and entering the pairing code from their profile page.
      </p>
      <p className="mb-3 text-sm text-gray-600">
        {/*
          This paragraph said "Only they can do this; it is not something you
          can set on their behalf." That was true until a manager could record
          a binding, and leaving it would have the page contradicting the
          control beneath it.
        */}
        <strong>Or you can record it for them.</strong> Paste somebody&rsquo;s
        Slack member ID below and they can sign in with{' '}
        <code className="mx-1 rounded bg-gray-100 px-1">/healthcheck signin</code>,
        which is how a team gets started before email is set up. This records
        who a Slack account belongs to — it{' '}
        <strong>does not let you sign in as them</strong>, and gives you no
        access to their account. They sign in with their own Slack login, as
        they would have anyway.
      </p>
      {actionError && <p className="mb-3 text-sm text-red-600" role="alert">{actionError}</p>}

      <div className="space-y-2 mb-4">
        {safeMembers.map((member) => (
          <div key={member.id} data-testid="member-row" className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-gray-50 rounded-md">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{member.name}</p>
              {member.email && <p className="text-sm text-gray-500 truncate">{member.email}</p>}
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600 w-fit">
              {member.slackLink ? 'Slack linked' : 'Slack not linked'}
            </span>
            {member.slackLink ? (
              <button
                type="button"
                onClick={() => handleSlackBinding(member.id, null)}
                className="px-3 py-1 text-sm text-blue-700 underline"
              >
                Unlink Slack
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <label htmlFor={`slack-id-${member.id}`} className="sr-only">
                  Slack member ID for {member.name}
                </label>
                <input
                  id={`slack-id-${member.id}`}
                  type="text"
                  value={slackIds[member.id] ?? ''}
                  onChange={(event) =>
                    setSlackIds((current) => ({ ...current, [member.id]: event.target.value }))
                  }
                  placeholder="U01ABCDE"
                  className="w-28 px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => handleSlackBinding(member.id, (slackIds[member.id] ?? '').trim())}
                  disabled={!(slackIds[member.id] ?? '').trim()}
                  className="px-2 py-1 text-sm text-blue-700 underline disabled:text-gray-400 disabled:no-underline"
                >
                  Save Slack ID
                </button>
              </div>
            )}
            <select
              aria-label={`Role for ${member.name}`}
              value={member.roles[0]?.role ?? 'team_member'}
              onChange={(event) => handleRoleChange(member.id, event.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="delivery_manager">Delivery Manager</option>
              <option value="team_member">Team Member</option>
            </select>
            <button type="button" onClick={() => { setActionError(''); setConfirmRemove(member.id); }} className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium">
              Remove
            </button>
          </div>
        ))}
        {safeMembers.length === 0 && <p className="text-sm text-gray-500">No members added yet.</p>}
      </div>
      {confirmRemove && memberToRemove && (
        <div className="p-4 border border-red-200 bg-red-50 rounded-md mb-4">
          <p className="text-sm text-gray-800 mb-3">
            Remove {memberToRemove.name} from the team? Their historical responses will be preserved.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => handleRemoveMember(confirmRemove)} className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700">
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmRemove(null)} className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Add a member</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <label htmlFor="member-name" className="sr-only">Member name</label>
            <input id="member-name" type="text" placeholder="Name" value={newName} onChange={(event) => setNewName(event.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500" />
          </div>
          <div className="flex-1">
            <label htmlFor="member-email" className="sr-only">Member email</label>
            <input id="member-email" type="email" placeholder="Email (optional)" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500" />
          </div>
          <button type="button" onClick={handleAddMember} className="px-4 py-2 bg-green-700 text-white font-medium rounded-md hover:bg-green-800 text-sm">
            Add member
          </button>
        </div>
        {addError && <p className="mt-1 text-sm text-red-600" role="alert">{addError}</p>}
      </div>
    </section>
  );
}
